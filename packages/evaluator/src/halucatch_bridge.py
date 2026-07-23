"""Machine-readable bridge for the vendored HaluCatch evaluator.

This bridge runs HaluCatch's static checks against a temporary, materialized
Skill snapshot. It deliberately does not call the report generator, so it
does not write report files into a published Skill package.
"""

from __future__ import annotations

import argparse
import contextlib
import json
import os
import re
import sys
import traceback


def _prepare_info_for_report(info: dict) -> None:
    """Use Skill-relative paths in report metadata instead of temp absolute paths."""
    source = info.get("skill_md_source")
    if isinstance(source, str) and source.strip():
        info["skill_md_path"] = source.strip()
        return

    skill_md_path = info.get("skill_md_path")
    if isinstance(skill_md_path, str) and skill_md_path.strip():
        info["skill_md_path"] = os.path.basename(skill_md_path.replace("\\", "/"))


def _sanitize_report_text(text: str, skill_dir: str) -> str:
    """Remove materialized snapshot paths from HaluCatch markdown reports."""
    if not text:
        return text

    # HaluCatch includes the scanned entry path in the professional report header.
    text = re.sub(r"^\*\*(?:文件|File)\*\*: .+\r?\n", "", text, flags=re.MULTILINE)

    skill_dir_norm = os.path.normpath(skill_dir)
    for variant in {
        skill_dir_norm,
        skill_dir_norm.replace("\\", "/"),
        skill_dir_norm.replace("/", "\\"),
    }:
        escaped = re.escape(variant)
        text = re.sub(rf"(?i){escaped}[\\/]?", "", text)

    return text


def _sanitize_reports(reports: dict, skill_dir: str) -> dict:
    sanitized = {}
    for key, value in reports.items():
        sanitized[key] = _sanitize_report_text(value, skill_dir) if isinstance(value, str) else value
    return sanitized


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--skill-dir", required=True)
    parser.add_argument("--halucatch-dir", required=True)
    return parser.parse_args()


def evaluate(skill_dir: str, halucatch_dir: str) -> dict:
    sys.path.insert(0, halucatch_dir)

    from halucatch.classifier import classify_skill
    from halucatch.config import MESSAGES
    from halucatch.evaluators import (
        check_code_risks,
        check_complexity,
        check_foundation,
        check_guardrails,
        check_methodology,
        check_rules,
    )
    from halucatch.reporter import generate_report
    from halucatch.scanner import scan_folder

    # HaluCatch's scanner and complexity evaluator emit progress logs. Keep
    # stdout reserved for the JSON response consumed by the TypeScript adapter.
    with contextlib.redirect_stdout(sys.stderr):
        info = scan_folder(skill_dir, MESSAGES["zh-CN"])
        if info is None:
            raise ValueError("HaluCatch could not scan the Skill snapshot")

        skill_type = classify_skill(info)
        if skill_type == "code-engineered":
            results = {
                "foundation": check_foundation(info),
                "code": check_code_risks(info),
                "rules": check_rules(info),
                "guardrails": check_guardrails(info, skill_type),
                "complexity": check_complexity(info, skill_type),
            }
        else:
            results = {
                "foundation": {
                    "rating": "🟢 纯方法论",
                    "issues": [("✅ 纯方法论型 Skill，地基检查不适用", "pass")],
                    "score": "-",
                },
                "code": {
                    "rating": "🟢 纯方法论",
                    "issues": [("✅ 纯方法论型 Skill，代码风险不适用", "pass")],
                    "score": "-",
                },
                "rules": check_methodology(info),
                "guardrails": check_guardrails(info, skill_type),
                "complexity": check_complexity(info, skill_type),
            }

    _prepare_info_for_report(info)

    with contextlib.redirect_stdout(sys.stderr):
        reports = generate_report(info, results, output_dir=None, lang="zh-CN")

    return {
        "ok": True,
        "skillType": skill_type,
        "results": results,
        "reports": _sanitize_reports(reports, skill_dir),
    }


def main() -> None:
    args = parse_args()
    # Windows may default redirected Python streams to a legacy code page.
    # HaluCatch returns Chinese labels and emoji, so force a stable JSON-safe
    # UTF-8 transport between Python and the Node.js adapter.
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8")
    try:
        print(json.dumps(evaluate(args.skill_dir, args.halucatch_dir), ensure_ascii=False))
    except Exception as error:
        print(
            json.dumps(
                {
                    "ok": False,
                    "error": str(error),
                    "traceback": traceback.format_exc(limit=3),
                },
                ensure_ascii=False,
            )
        )
        sys.exit(1)


if __name__ == "__main__":
    main()
