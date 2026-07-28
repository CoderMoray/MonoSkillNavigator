#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKILLSPECTOR_DIR="${SKILLSPECTOR_DIR:-$ROOT/packages/SkillSpector-main}"
PYPI_JSON="https://pypi.org/pypi/skillspector/json"
GITHUB_REPO="https://github.com/nvidia/skillspector.git"

detect_python() {
  local candidates=()
  if [ -n "${SKILLSPECTOR_PYTHON:-}" ]; then
    candidates+=("$SKILLSPECTOR_PYTHON")
  fi
  if [ "${OS:-}" = "Windows_NT" ]; then
    candidates+=(python python3)
  else
    candidates+=(python3 python)
  fi

  local cmd
  for cmd in "${candidates[@]}"; do
    if command -v "$cmd" >/dev/null 2>&1 && "$cmd" -m pip --version >/dev/null 2>&1; then
      echo "$cmd"
      return
    fi
  done

  echo "❌ Python 3.12+ with pip not found. Set SKILLSPECTOR_PYTHON or install pip." >&2
  exit 1
}

python_version_ok() {
  local py="$1"
  "$py" -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 12) else 1)" 2>/dev/null
}

pypi_has_skillspector() {
  local py="$1"
  if command -v curl >/dev/null 2>&1; then
    if curl -sf "$PYPI_JSON" >/dev/null 2>&1; then
      return 0
    fi
  fi
  if "$py" -m pip index versions skillspector >/dev/null 2>&1; then
    return 0
  fi
  return 1
}

install_from_pypi() {
  local py="$1"
  echo "  Running: $py -m pip install --upgrade skillspector"
  "$py" -m pip install --upgrade skillspector
}

install_from_github() {
  local py="$1"
  if [ ! -d "$SKILLSPECTOR_DIR/src/skillspector" ]; then
    echo "  Cloning SkillSpector into $SKILLSPECTOR_DIR ..."
    mkdir -p "$(dirname "$SKILLSPECTOR_DIR")"
    git clone --depth 1 "$GITHUB_REPO" "$SKILLSPECTOR_DIR"
  else
    echo "  Using SkillSpector source at $SKILLSPECTOR_DIR"
  fi
  echo "  Running: $py -m pip install -e $SKILLSPECTOR_DIR"
  "$py" -m pip install -e "$SKILLSPECTOR_DIR"
}

main() {
  local python_cmd
  python_cmd="$(detect_python)"

  if ! python_version_ok "$python_cmd"; then
    echo "  ⚠️  $python_cmd is below Python 3.12; SkillSpector requires 3.12+."
  fi

  if pypi_has_skillspector "$python_cmd"; then
    echo "  PyPI has skillspector — installing with pip"
    install_from_pypi "$python_cmd"
  else
    echo "  PyPI has no skillspector — installing from GitHub ($GITHUB_REPO)"
    install_from_github "$python_cmd"
  fi

  echo "  Verifying SkillSpector import..."
  "$python_cmd" -c "from skillspector.graph import graph; print('  ✅ SkillSpector Python package ready')"
}

main "$@"
