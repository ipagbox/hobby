#!/usr/bin/env python3
"""
Agents Pipeline — Artifact Validator

Проверяет артефакты run на соответствие JSON схемам.

Usage:
    python scripts/validate.py --run-id <id>
    python scripts/validate.py --run-id <id> --stage 03-seo
    python scripts/validate.py --brief path/to/brief.yaml
"""

import argparse
import json
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent
sys.path.insert(0, str(PROJECT_ROOT))

from pipeline.orchestrator import Pipeline, load_yaml, SCHEMAS_DIR


def check_jsonschema() -> bool:
    try:
        import jsonschema
        return True
    except ImportError:
        print("⚠️  jsonschema not installed. Run: pip install jsonschema")
        return False


def validate_file(file_path: Path, schema_path: Path) -> tuple[bool, str]:
    """Валидировать файл по JSON-схеме. Возвращает (ok, error_message)."""
    import jsonschema

    with open(schema_path) as f:
        schema = json.load(f)

    suffix = file_path.suffix.lower()
    if suffix in (".yaml", ".yml"):
        data = load_yaml(file_path)
    elif suffix == ".json":
        with open(file_path) as f:
            data = json.load(f)
    else:
        return False, f"Unsupported file type: {suffix}"

    try:
        jsonschema.validate(data, schema)
        return True, ""
    except jsonschema.ValidationError as e:
        return False, e.message


def validate_run(run_id: str, stage_filter: str | None = None) -> dict:
    """Проверить все артефакты run."""
    pipeline = Pipeline()
    run_dir = pipeline._get_run_dir(run_id)

    index_path = run_dir / "artifact-index.yaml"
    if not index_path.exists():
        print(f"❌ artifact-index.yaml not found for run: {run_id}")
        return {"total": 0, "valid": 0, "invalid": 0, "skipped": 0}

    index = load_yaml(index_path)
    artifacts = index.get("artifacts", [])

    # Контракты для получения schema paths
    from pipeline.orchestrator import CONTRACTS_DIR
    contracts_cache = {}

    results = {"total": 0, "valid": 0, "invalid": 0, "skipped": 0}

    print(f"\nValidating run: {run_id}")
    print(f"{'Artifact':<50} {'Status':<12} {'Note'}")
    print("-" * 90)

    for artifact in artifacts:
        stage_id = artifact["stage_id"]
        if stage_filter and stage_id != stage_filter:
            continue

        key = artifact["key"]
        rel_path = artifact["path"]
        artifact_path = run_dir / rel_path
        results["total"] += 1

        display_name = f"{stage_id}/{key}"

        if not artifact_path.exists():
            print(f"  ❌ {display_name:<48} {'MISSING':<12}")
            results["invalid"] += 1
            continue

        # Найти schema для этого артефакта
        if stage_id not in contracts_cache:
            contract_path = CONTRACTS_DIR / f"{stage_id}.yaml"
            if contract_path.exists():
                contracts_cache[stage_id] = load_yaml(contract_path)

        contract = contracts_cache.get(stage_id, {})
        schema_path = None
        for out in contract.get("outputs", []):
            if out["key"] == key and out.get("schema"):
                schema_rel = out["schema"]
                schema_path = PROJECT_ROOT / schema_rel
                break

        if schema_path is None or not schema_path.exists():
            size = artifact_path.stat().st_size
            print(f"  🔵 {display_name:<48} {'NO SCHEMA':<12} {size} bytes")
            results["skipped"] += 1
            continue

        ok, error = validate_file(artifact_path, schema_path)
        if ok:
            print(f"  ✅ {display_name:<48} {'VALID':<12}")
            results["valid"] += 1
        else:
            print(f"  ❌ {display_name:<48} {'INVALID':<12} {error[:60]}")
            results["invalid"] += 1

    print(f"\nSummary: {results['total']} artifacts | "
          f"✅ {results['valid']} valid | "
          f"❌ {results['invalid']} invalid | "
          f"🔵 {results['skipped']} skipped (no schema)")
    return results


def validate_brief(brief_path: Path) -> bool:
    """Валидировать входной бриф."""
    schema_path = SCHEMAS_DIR / "brief.schema.json"
    if not schema_path.exists():
        print(f"❌ Schema not found: {schema_path}")
        return False

    ok, error = validate_file(brief_path, schema_path)
    if ok:
        print(f"✅ Brief is valid: {brief_path}")
    else:
        print(f"❌ Brief validation failed: {error}")
    return ok


def main() -> None:
    parser = argparse.ArgumentParser(description="Agents Pipeline — Artifact Validator")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--run-id", help="Run ID to validate")
    group.add_argument("--brief", help="Path to brief.yaml to validate")

    parser.add_argument("--stage", help="Validate only this stage (with --run-id)")

    args = parser.parse_args()

    if not check_jsonschema():
        sys.exit(1)

    if args.brief:
        ok = validate_brief(Path(args.brief))
        sys.exit(0 if ok else 1)

    if args.run_id:
        results = validate_run(args.run_id, stage_filter=args.stage)
        sys.exit(0 if results["invalid"] == 0 else 1)


if __name__ == "__main__":
    main()
