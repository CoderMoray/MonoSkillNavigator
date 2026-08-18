"""Placeholder entry point for the skillnav CLI.

The full command surface is specified in ``docs/cli-design.md`` at the
repository root. This release (0.0.1) only reserves the PyPI name and
provides ``--version`` / ``--help``.
"""

from __future__ import annotations

import argparse

from skillnav import __version__


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="skillnav",
        description="CLI client for the Skill management platform (MonoSkillNavigator).",
    )
    parser.add_argument(
        "-v", "--version", action="version", version=f"skillnav {__version__}"
    )
    parser.add_argument(
        "--registry", help="Registry API base URL (default: config file)"
    )
    parser.add_argument(
        "--json", action="store_true", help="Machine-readable JSON output"
    )
    parser.add_argument(
        "--no-input", action="store_true", help="Never prompt for input"
    )
    parser.add_argument("command", nargs="?", help="Command (see docs/cli-design.md)")
    parser.add_argument("args", nargs=argparse.REMAINDER, help=argparse.SUPPRESS)
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if not args.command:
        parser.print_help()
        return 0

    print(
        f"skillnav {__version__}: command '{args.command}' is not implemented yet "
        f"(see docs/cli-design.md)"
    )
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
