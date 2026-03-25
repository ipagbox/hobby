#!/usr/bin/env python3
"""
Agents Pipeline — CLI Entry Point

Usage:
    python scripts/run.py init   --brief path/to/brief.yaml
    python scripts/run.py pipeline --run-id <id> [--from-stage 01-discovery] [--to-stage 05-design]
    python scripts/run.py stage  --run-id <id> --stage 01-discovery [--rerun] [--dry-run]
    python scripts/run.py status --run-id <id>
    python scripts/run.py list
"""

import argparse
import sys
from pathlib import Path

# Добавить корень проекта в sys.path
SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent
sys.path.insert(0, str(PROJECT_ROOT))

from pipeline.orchestrator import Pipeline


def cmd_init(args, pipeline: Pipeline) -> None:
    brief_path = Path(args.brief)
    run_id = pipeline.init_run(brief_path)
    print(f"\nRun ID: {run_id}")
    print("Next: python scripts/run.py pipeline --run-id " + run_id)


def cmd_pipeline(args, pipeline: Pipeline) -> None:
    pipeline.run_pipeline(
        run_id=args.run_id,
        from_stage=getattr(args, "from_stage", None),
        to_stage=getattr(args, "to_stage", None),
        dry_run=getattr(args, "dry_run", False),
    )


def cmd_stage(args, pipeline: Pipeline) -> None:
    pipeline.run_stage(
        run_id=args.run_id,
        stage_id=args.stage,
        rerun=getattr(args, "rerun", False),
        dry_run=getattr(args, "dry_run", False),
    )


def cmd_status(args, pipeline: Pipeline) -> None:
    status = pipeline.get_status(args.run_id)
    print(f"\nRun: {status['run_id']}")
    print(f"Project: {status['project_name']}")
    print(f"Status: {status['status']}")
    print(f"Created: {status['created_at']}")
    print(f"\nStages:")

    STATUS_ICONS = {
        "pending": "⏳",
        "in_progress": "🔄",
        "completed": "✅",
        "failed": "❌",
        "review_required": "⚠️ ",
        "skipped": "⏭ ",
    }

    for stage_id, stage_meta in status.get("stages", {}).items():
        st = stage_meta.get("status", "pending")
        icon = STATUS_ICONS.get(st, "?")
        ver = stage_meta.get("current_version", 0)
        ver_str = f"v{ver}" if ver > 0 else ""
        tokens = ""
        if stage_meta.get("output_tokens"):
            tokens = f"  [{stage_meta['input_tokens']}→{stage_meta['output_tokens']} tokens]"
        print(f"  {icon} {stage_id:<25} {st:<18} {ver_str}{tokens}")


def cmd_list(args, pipeline: Pipeline) -> None:
    runs = pipeline.list_runs()
    if not runs:
        print("No runs found.")
        return

    print(f"\n{'Run ID':<45} {'Project':<25} {'Status':<15} {'Created'}")
    print("-" * 110)
    for run in runs:
        print(
            f"{run['run_id']:<45} "
            f"{(run['project_name'] or '')[:24]:<25} "
            f"{run['status']:<15} "
            f"{run['created_at']}"
        )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Agents Pipeline — CLI",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )

    subparsers = parser.add_subparsers(dest="command", required=True)

    # init
    p_init = subparsers.add_parser("init", help="Initialize a new run from a brief")
    p_init.add_argument("--brief", required=True, help="Path to brief.yaml")

    # pipeline
    p_pipeline = subparsers.add_parser("pipeline", help="Run full pipeline")
    p_pipeline.add_argument("--run-id", required=True, help="Run ID")
    p_pipeline.add_argument("--from-stage", dest="from_stage", help="Start from this stage")
    p_pipeline.add_argument("--to-stage", dest="to_stage", help="Stop after this stage")
    p_pipeline.add_argument("--dry-run", action="store_true", help="Build prompts but don't call LLM")

    # stage
    p_stage = subparsers.add_parser("stage", help="Run a single stage")
    p_stage.add_argument("--run-id", required=True, help="Run ID")
    p_stage.add_argument("--stage", required=True, help="Stage ID (e.g., 01-discovery)")
    p_stage.add_argument("--rerun", action="store_true", help="Re-run stage, keeping history")
    p_stage.add_argument("--dry-run", action="store_true", help="Build prompt but don't call LLM")

    # status
    p_status = subparsers.add_parser("status", help="Show run status")
    p_status.add_argument("--run-id", required=True, help="Run ID")

    # list
    subparsers.add_parser("list", help="List all runs")

    args = parser.parse_args()

    pipeline = Pipeline()

    commands = {
        "init": cmd_init,
        "pipeline": cmd_pipeline,
        "stage": cmd_stage,
        "status": cmd_status,
        "list": cmd_list,
    }

    try:
        commands[args.command](args, pipeline)
    except FileNotFoundError as e:
        print(f"\n❌ Error: {e}", file=sys.stderr)
        sys.exit(1)
    except ValueError as e:
        print(f"\n❌ Error: {e}", file=sys.stderr)
        sys.exit(1)
    except KeyboardInterrupt:
        print("\n\nInterrupted by user")
        sys.exit(130)
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}", file=sys.stderr)
        raise


if __name__ == "__main__":
    main()
