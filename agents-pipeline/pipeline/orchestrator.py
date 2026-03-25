"""
Agents Pipeline — Core Orchestrator

Детерминированная часть пайплайна:
- читает/пишет файлы и артефакты
- управляет версионированием стадий
- строит промпты из шаблонов + входных артефактов
- вызывает Claude API для LLM-стадий
- обновляет run-metadata и artifact-index

Что требует LLM: каждая stage — весь контентный вывод
Что детерминированно: всё остальное (файлы, версии, метаданные, валидация)
Что требует ручной проверки: stages с review_required=true
"""

from __future__ import annotations

import json
import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml

# Опциональная валидация по JSON Schema
try:
    import jsonschema
    HAS_JSONSCHEMA = True
except ImportError:
    HAS_JSONSCHEMA = False

try:
    import anthropic
    HAS_ANTHROPIC = True
except ImportError:
    HAS_ANTHROPIC = False


# ---------------------------------------------------------------------------
# Константы
# ---------------------------------------------------------------------------

PIPELINE_ROOT = Path(__file__).parent.parent  # agents-pipeline/
STAGES_REGISTRY = PIPELINE_ROOT / "pipeline" / "stages.yaml"
CONTRACTS_DIR = PIPELINE_ROOT / "pipeline" / "contracts"
PROMPTS_DIR = PIPELINE_ROOT / "prompts"
SCHEMAS_DIR = PIPELINE_ROOT / "schemas"
RUNS_DIR = PIPELINE_ROOT / "runs"

DEFAULT_MODEL = "claude-opus-4-6"
MAX_TOKENS = 16000


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def load_yaml(path: Path) -> dict:
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def save_yaml(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        yaml.dump(data, f, allow_unicode=True, default_flow_style=False, sort_keys=False)


def save_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)


def read_text(path: Path) -> str:
    with open(path, encoding="utf-8") as f:
        return f.read()


def generate_run_id(project_name: str) -> str:
    slug = project_name.lower().replace(" ", "-")[:30]
    date = datetime.now().strftime("%Y%m%d")
    suffix = uuid.uuid4().hex[:6]
    return f"{slug}-{date}-{suffix}"


# ---------------------------------------------------------------------------
# Pipeline class
# ---------------------------------------------------------------------------

class Pipeline:
    """Основной оркестратор stage-based pipeline."""

    def __init__(self, runs_dir: Path = RUNS_DIR):
        self.runs_dir = runs_dir
        self.stages_registry = self._load_stages_registry()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def init_run(self, brief_path: Path) -> str:
        """
        Инициализировать новый run из брифа.
        Возвращает run_id.

        Детерминированно: читает brief, создаёт директорию, пишет метаданные.
        """
        brief_path = Path(brief_path)
        if not brief_path.exists():
            raise FileNotFoundError(f"Brief not found: {brief_path}")

        brief = self._load_and_validate_brief(brief_path)

        project_name = brief.get("business", {}).get("name", "project")
        run_id = generate_run_id(project_name)
        run_dir = self.runs_dir / run_id

        # Создать структуру директорий
        run_dir.mkdir(parents=True, exist_ok=True)
        for stage_info in self.stages_registry:
            stage_id = stage_info["id"]
            (run_dir / "stages" / stage_id).mkdir(parents=True, exist_ok=True)

        # Скопировать brief
        import shutil
        shutil.copy2(brief_path, run_dir / "brief.yaml")

        # Инициализировать run-metadata
        stages_init = {}
        for stage_info in self.stages_registry:
            stages_init[stage_info["id"]] = {
                "status": "pending",
                "versions": 0,
                "current_version": 0,
            }

        metadata = {
            "run_id": run_id,
            "project_name": project_name,
            "project_type": brief.get("project_type", "local_business_website"),
            "brief_path": str(brief_path),
            "created_at": now_iso(),
            "updated_at": now_iso(),
            "status": "pending",
            "stages": stages_init,
        }
        save_yaml(run_dir / "run-metadata.yaml", metadata)

        # Инициализировать artifact-index
        artifact_index = {
            "run_id": run_id,
            "updated_at": now_iso(),
            "artifacts": [],
        }
        save_yaml(run_dir / "artifact-index.yaml", artifact_index)

        print(f"✅ Run initialized: {run_id}")
        print(f"   Directory: {run_dir}")
        return run_id

    def run_pipeline(
        self,
        run_id: str,
        from_stage: str | None = None,
        to_stage: str | None = None,
        dry_run: bool = False,
    ) -> None:
        """
        Запустить полный pipeline (или диапазон стадий).
        Останавливается при ошибке или если stage требует review.
        """
        run_dir = self._get_run_dir(run_id)
        metadata = load_yaml(run_dir / "run-metadata.yaml")

        stage_ids = [s["id"] for s in self.stages_registry]
        if from_stage:
            if from_stage not in stage_ids:
                raise ValueError(f"Unknown stage: {from_stage}")
            stage_ids = stage_ids[stage_ids.index(from_stage):]
        if to_stage:
            if to_stage not in stage_ids:
                raise ValueError(f"Unknown stage: {to_stage}")
            stage_ids = stage_ids[:stage_ids.index(to_stage) + 1]

        self._update_run_status(run_dir, "in_progress")

        for stage_id in stage_ids:
            stage_status = metadata["stages"].get(stage_id, {}).get("status", "pending")

            # Пропустить уже завершённые (если не rerun)
            if stage_status == "completed":
                print(f"⏭  {stage_id}: already completed, skipping")
                continue

            if stage_status == "review_required":
                print(f"⚠️  {stage_id}: requires manual review before continuing")
                print("   Run with --stage to re-run after review")
                break

            print(f"\n{'='*60}")
            print(f"▶  Stage: {stage_id}")
            print(f"{'='*60}")

            try:
                self.run_stage(run_id, stage_id, dry_run=dry_run)
            except Exception as e:
                self._update_stage_status(run_dir, stage_id, "failed", error=str(e))
                self._update_run_status(run_dir, "failed")
                print(f"❌ Stage {stage_id} failed: {e}")
                raise

            # Перечитать обновлённые метаданные
            metadata = load_yaml(run_dir / "run-metadata.yaml")
            stage_status = metadata["stages"][stage_id]["status"]

            if stage_status == "review_required":
                print(f"\n⚠️  Stage {stage_id} completed but requires manual review.")
                print("   Pipeline paused. Review the artifact and re-run the stage.")
                break

        # Проверить общий статус
        metadata = load_yaml(run_dir / "run-metadata.yaml")
        all_done = all(
            metadata["stages"].get(sid, {}).get("status") in ("completed", "review_required", "skipped")
            for sid in [s["id"] for s in self.stages_registry]
        )
        if all_done:
            self._update_run_status(run_dir, "completed")
            print(f"\n✅ Pipeline completed: {run_id}")

    def run_stage(
        self,
        run_id: str,
        stage_id: str,
        rerun: bool = False,
        dry_run: bool = False,
    ) -> None:
        """
        Запустить одну stage.
        rerun=True: создаёт новую версию, сохраняет историю.
        dry_run=True: строит промпт но не вызывает LLM.
        """
        run_dir = self._get_run_dir(run_id)
        contract = self._load_contract(stage_id)
        stage_info = self._get_stage_info(stage_id)

        print(f"  Role: {stage_info['role']}")
        print(f"  Goal: {stage_info['description']}")

        # Проверить входные артефакты
        inputs = self._collect_inputs(run_dir, contract)
        print(f"  Inputs collected: {list(inputs.keys())}")

        # Определить версию
        metadata = load_yaml(run_dir / "run-metadata.yaml")
        stage_meta = metadata["stages"].get(stage_id, {})
        current_version = stage_meta.get("current_version", 0)

        if not rerun and current_version > 0 and stage_meta.get("status") == "completed":
            print(f"  Already completed (v{current_version}). Use --rerun to re-run.")
            return

        new_version = current_version + 1
        version_dir = run_dir / "stages" / stage_id / f"v{new_version}"
        version_dir.mkdir(parents=True, exist_ok=True)

        # Обновить статус → in_progress
        self._update_stage_status(run_dir, stage_id, "in_progress",
                                  started_at=now_iso(),
                                  version=new_version)

        # Построить промпт
        prompt_text = self._build_prompt(stage_id, inputs, run_dir)

        if dry_run:
            save_text(version_dir / "_dry_run_prompt.md", prompt_text)
            print(f"  [DRY RUN] Prompt saved to {version_dir}/_dry_run_prompt.md")
            self._update_stage_status(run_dir, stage_id, "completed",
                                      version=new_version,
                                      completed_at=now_iso())
            return

        # Вызвать LLM (требует ANTHROPIC_API_KEY)
        if not HAS_ANTHROPIC:
            raise RuntimeError("anthropic package not installed. Run: pip install anthropic")

        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            raise RuntimeError("ANTHROPIC_API_KEY environment variable not set")

        print(f"  Calling LLM (model: {DEFAULT_MODEL})...")
        result, usage = self._call_llm(prompt_text, stage_info)

        # Сохранить выходные артефакты
        self._save_outputs(version_dir, stage_id, result, contract, run_dir)

        # Создать симлинк current → v{n}
        current_link = run_dir / "stages" / stage_id / "current"
        if current_link.exists() or current_link.is_symlink():
            current_link.unlink()
        current_link.symlink_to(f"v{new_version}")

        # Обновить stage-log
        self._append_stage_log(run_dir, stage_id, new_version, usage)

        # Определить финальный статус
        final_status = "review_required" if contract.get("review_required") else "completed"

        self._update_stage_status(
            run_dir, stage_id, final_status,
            version=new_version,
            completed_at=now_iso(),
            model=DEFAULT_MODEL,
            input_tokens=usage.get("input_tokens", 0),
            output_tokens=usage.get("output_tokens", 0),
        )

        if final_status == "review_required":
            print(f"  ⚠️  Review required: {contract.get('review_reason', '')}")
        else:
            print(f"  ✅ Stage completed (v{new_version})")

    def get_status(self, run_id: str) -> dict:
        """Вернуть статус run и всех stages."""
        run_dir = self._get_run_dir(run_id)
        metadata = load_yaml(run_dir / "run-metadata.yaml")
        return metadata

    def list_runs(self) -> list[dict]:
        """Список всех runs."""
        runs = []
        if not self.runs_dir.exists():
            return runs
        for run_dir in sorted(self.runs_dir.iterdir()):
            metadata_path = run_dir / "run-metadata.yaml"
            if metadata_path.exists():
                meta = load_yaml(metadata_path)
                runs.append({
                    "run_id": meta.get("run_id"),
                    "project_name": meta.get("project_name"),
                    "status": meta.get("status"),
                    "created_at": meta.get("created_at"),
                })
        return runs

    # ------------------------------------------------------------------
    # Private: stages registry
    # ------------------------------------------------------------------

    def _load_stages_registry(self) -> list[dict]:
        data = load_yaml(STAGES_REGISTRY)
        return data.get("stages", [])

    def _get_stage_info(self, stage_id: str) -> dict:
        for s in self.stages_registry:
            if s["id"] == stage_id:
                return s
        raise ValueError(f"Stage not found in registry: {stage_id}")

    def _load_contract(self, stage_id: str) -> dict:
        contract_path = CONTRACTS_DIR / f"{stage_id}.yaml"
        if not contract_path.exists():
            raise FileNotFoundError(f"Contract not found: {contract_path}")
        return load_yaml(contract_path)

    # ------------------------------------------------------------------
    # Private: inputs / outputs
    # ------------------------------------------------------------------

    def _load_and_validate_brief(self, brief_path: Path) -> dict:
        brief = load_yaml(brief_path)
        if HAS_JSONSCHEMA:
            schema_path = SCHEMAS_DIR / "brief.schema.json"
            if schema_path.exists():
                with open(schema_path) as f:
                    schema = json.load(f)
                try:
                    jsonschema.validate(brief, schema)
                except jsonschema.ValidationError as e:
                    print(f"⚠️  Brief validation warning: {e.message}")
        return brief

    def _collect_inputs(self, run_dir: Path, contract: dict) -> dict[str, str]:
        """
        Собрать входные артефакты для stage.
        Детерминированно: читает файлы по путям из контракта.
        """
        inputs = {}
        for inp in contract.get("inputs", []):
            key = inp["key"]
            rel_path = inp["path"]
            required = inp.get("required", True)

            artifact_path = run_dir / rel_path
            if not artifact_path.exists():
                if required:
                    raise FileNotFoundError(
                        f"Required input '{key}' not found at: {artifact_path}\n"
                        f"  → Run the preceding stage first."
                    )
                else:
                    print(f"  Optional input '{key}' not found, skipping.")
                    continue

            if artifact_path.suffix in (".yaml", ".yml"):
                content = f"```yaml\n{read_text(artifact_path)}\n```"
            else:
                content = read_text(artifact_path)

            inputs[key] = content
        return inputs

    def _save_outputs(
        self,
        version_dir: Path,
        stage_id: str,
        llm_output: str,
        contract: dict,
        run_dir: Path,
    ) -> None:
        """
        Сохранить выходные артефакты.
        Детерминированно: запись файлов из LLM-вывода.
        """
        outputs = contract.get("outputs", [])

        if not outputs:
            return

        # Если один output — сохраняем весь вывод LLM
        if len(outputs) == 1:
            out = outputs[0]
            out_path = version_dir / Path(out["path"]).name
            save_text(out_path, llm_output)
            self._register_artifact(run_dir, stage_id, out["key"], out_path)
            return

        # Если несколько outputs — парсим по маркерам
        # LLM должен разделять секции как:
        # === OUTPUT: key ===
        # ...контент...
        # === END OUTPUT ===
        sections = self._parse_output_sections(llm_output)
        for out in outputs:
            key = out["key"]
            out_path = version_dir / Path(out["path"]).name
            if key in sections:
                save_text(out_path, sections[key])
                self._register_artifact(run_dir, stage_id, key, out_path)
            else:
                # Fallback: сохранить весь вывод в первый output
                if out == outputs[0]:
                    save_text(out_path, llm_output)
                    self._register_artifact(run_dir, stage_id, key, out_path)
                    print(f"  ⚠️  Could not parse section '{key}', saved full output")

    def _parse_output_sections(self, text: str) -> dict[str, str]:
        """Парсить секции === OUTPUT: key === из LLM вывода."""
        import re
        sections = {}
        pattern = r"===\s*OUTPUT:\s*(\w+)\s*===\s*(.*?)\s*===\s*END OUTPUT\s*==="
        for match in re.finditer(pattern, text, re.DOTALL):
            key = match.group(1).strip()
            content = match.group(2).strip()
            sections[key] = content
        return sections

    def _register_artifact(
        self,
        run_dir: Path,
        stage_id: str,
        key: str,
        artifact_path: Path,
    ) -> None:
        """Зарегистрировать артефакт в artifact-index."""
        index_path = run_dir / "artifact-index.yaml"
        index = load_yaml(index_path)

        rel_path = str(artifact_path.relative_to(run_dir))
        size = artifact_path.stat().st_size if artifact_path.exists() else 0

        index["artifacts"].append({
            "stage_id": stage_id,
            "key": key,
            "path": rel_path,
            "version": int(artifact_path.parent.name[1:]) if artifact_path.parent.name.startswith("v") else 1,
            "created_at": now_iso(),
            "status": "created",
            "size_bytes": size,
        })
        index["updated_at"] = now_iso()
        save_yaml(index_path, index)

    # ------------------------------------------------------------------
    # Private: prompt building
    # ------------------------------------------------------------------

    def _build_prompt(
        self,
        stage_id: str,
        inputs: dict[str, str],
        run_dir: Path,
    ) -> str:
        """
        Построить промпт: шаблон роли + входные артефакты.
        Детерминированно.
        """
        prompt_path = PROMPTS_DIR / f"{stage_id}.md"
        if not prompt_path.exists():
            raise FileNotFoundError(f"Prompt template not found: {prompt_path}")

        role_prompt = read_text(prompt_path)

        # Вставить входные артефакты в промпт
        artifacts_block = "\n\n".join(
            f"=== INPUT: {key} ===\n{content}\n=== END INPUT ==="
            for key, content in inputs.items()
        )

        if artifacts_block:
            full_prompt = (
                f"{role_prompt}\n\n"
                f"---\n\n"
                f"## Input Artifacts\n\n"
                f"{artifacts_block}"
            )
        else:
            full_prompt = role_prompt

        return full_prompt

    # ------------------------------------------------------------------
    # Private: LLM call
    # ------------------------------------------------------------------

    def _call_llm(self, prompt: str, stage_info: dict) -> tuple[str, dict]:
        """
        Вызов Claude API.
        Использует streaming для надёжности.
        Возвращает (content_text, usage_dict).
        """
        client = anthropic.Anthropic()

        print(f"  Sending prompt ({len(prompt)} chars)...")

        full_text = ""
        usage = {}

        with client.messages.stream(
            model=DEFAULT_MODEL,
            max_tokens=MAX_TOKENS,
            thinking={"type": "adaptive"},
            system=(
                f"You are {stage_info['role']}. "
                f"You work within a structured website development pipeline. "
                f"Follow the instructions in the prompt exactly. "
                f"Produce complete, professional output — not placeholders."
            ),
            messages=[
                {"role": "user", "content": prompt}
            ],
        ) as stream:
            for text_chunk in stream.text_stream:
                full_text += text_chunk
                print(".", end="", flush=True)

            final = stream.get_final_message()
            usage = {
                "input_tokens": final.usage.input_tokens,
                "output_tokens": final.usage.output_tokens,
            }

        print()  # newline после dots
        print(f"  Tokens: {usage['input_tokens']} in / {usage['output_tokens']} out")
        return full_text, usage

    # ------------------------------------------------------------------
    # Private: metadata management
    # ------------------------------------------------------------------

    def _get_run_dir(self, run_id: str) -> Path:
        run_dir = self.runs_dir / run_id
        if not run_dir.exists():
            raise FileNotFoundError(
                f"Run not found: {run_id}\n"
                f"  Expected: {run_dir}\n"
                f"  Use 'run.py list' to see available runs."
            )
        return run_dir

    def _update_run_status(self, run_dir: Path, status: str) -> None:
        metadata = load_yaml(run_dir / "run-metadata.yaml")
        metadata["status"] = status
        metadata["updated_at"] = now_iso()
        save_yaml(run_dir / "run-metadata.yaml", metadata)

    def _update_stage_status(
        self,
        run_dir: Path,
        stage_id: str,
        status: str,
        version: int | None = None,
        started_at: str | None = None,
        completed_at: str | None = None,
        model: str | None = None,
        input_tokens: int | None = None,
        output_tokens: int | None = None,
        error: str | None = None,
    ) -> None:
        metadata = load_yaml(run_dir / "run-metadata.yaml")
        stage_meta = metadata["stages"].setdefault(stage_id, {})

        stage_meta["status"] = status
        if version is not None:
            stage_meta["current_version"] = version
            stage_meta["versions"] = version
        if started_at:
            stage_meta["started_at"] = started_at
        if completed_at:
            stage_meta["completed_at"] = completed_at
        if model:
            stage_meta["model"] = model
        if input_tokens is not None:
            stage_meta["input_tokens"] = input_tokens
        if output_tokens is not None:
            stage_meta["output_tokens"] = output_tokens
        if error:
            stage_meta["error"] = error

        metadata["updated_at"] = now_iso()
        save_yaml(run_dir / "run-metadata.yaml", metadata)

    def _append_stage_log(
        self,
        run_dir: Path,
        stage_id: str,
        version: int,
        usage: dict,
    ) -> None:
        """Добавить запись в stage-log.yaml."""
        log_path = run_dir / "stages" / stage_id / "stage-log.yaml"
        log = []
        if log_path.exists():
            log = load_yaml(log_path) or []
        if not isinstance(log, list):
            log = []

        log.append({
            "version": version,
            "timestamp": now_iso(),
            "model": DEFAULT_MODEL,
            "input_tokens": usage.get("input_tokens", 0),
            "output_tokens": usage.get("output_tokens", 0),
        })
        save_yaml(log_path, log)
