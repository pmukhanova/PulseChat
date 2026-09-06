#!/usr/bin/env sh
set -eu

export LC_ALL=C

project_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
output="$project_root/artifacts/pulse-chat-source.zip"
staging=$(mktemp -d "${TMPDIR:-/tmp}/pulse-chat-source.XXXXXX")
trap 'rm -rf "$staging"' EXIT HUP INT TERM

fail() {
  printf 'ERROR: %s\n' "$1" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "required command not found: $1"
}

for command_name in rsync zip unzip grep awk; do
  require_command "$command_name"
done

for required_path in README.md backend frontend docs scripts; do
  [ -e "$project_root/$required_path" ] || fail "required project path is missing: $required_path"
done

mkdir -p "$project_root/artifacts" "$staging/pulse-chat"

# Keep the source package reproducible and free of dependencies, secrets,
# build/test output, temporary files, and generated delivery artifacts.
rsync -a \
  --include='.env.example' \
  --exclude='.env' \
  --exclude='.env.*' \
  --exclude='.git/' \
  --exclude='.gitmodules.lock' \
  --exclude='.DS_Store' \
  --exclude='._*' \
  --exclude='__MACOSX/' \
  --exclude='Thumbs.db' \
  --exclude='node_modules/' \
  --exclude='dist/' \
  --exclude='build/' \
  --exclude='coverage/' \
  --exclude='.nyc_output/' \
  --exclude='test-results/' \
  --exclude='playwright-report/' \
  --exclude='blob-report/' \
  --exclude='tmp/' \
  --exclude='temp/' \
  --exclude='.tmp/' \
  --exclude='.cache/' \
  --exclude='.vite/' \
  --exclude='.turbo/' \
  --exclude='.next/' \
  --exclude='.pytest_cache/' \
  --exclude='__pycache__/' \
  --exclude='*.pyc' \
  --exclude='*.log' \
  --exclude='*.tmp' \
  --exclude='*.temp' \
  --exclude='*.tsbuildinfo' \
  --exclude='*.zip' \
  --exclude='*.pdf' \
  --exclude='*.pptx' \
  --exclude='*.webm' \
  --exclude='/artifacts/' \
  "$project_root/" "$staging/pulse-chat/"

rm -f "$output"
(
  cd "$staging"
  zip -X -qr "$output" pulse-chat
)

unzip -tqq "$output" || fail "ZIP integrity check failed: $output"

listing="$staging/source-entries.txt"
unzip -Z1 "$output" > "$listing"
[ -s "$listing" ] || fail "source archive is empty"

if grep -Ev '^pulse-chat/' "$listing" >/dev/null; then
  fail "source archive contains an entry outside the pulse-chat/ top-level folder"
fi

if grep -E '(^|/)(node_modules|dist|build|coverage|test-results|playwright-report|blob-report|tmp|temp|\.tmp|\.git|__MACOSX)(/|$)' "$listing" >/dev/null; then
  fail "source archive contains a forbidden dependency, build, test, VCS, or temporary path"
fi

if grep -E '(^|/)(\.DS_Store|Thumbs\.db)$|(^|/)\._' "$listing" >/dev/null; then
  fail "source archive contains a macOS/Windows metadata file"
fi

if grep -E '^pulse-chat/artifacts/|\.(zip|pdf|pptx|webm)$' "$listing" >/dev/null; then
  fail "source archive contains a generated binary artifact"
fi

if awk -F/ '
  {
    name = $NF
    if (name == ".env" || (name ~ /^\.env\./ && name != ".env.example")) {
      found = 1
    }
  }
  END { exit found ? 0 : 1 }
' "$listing"; then
  fail "source archive contains an environment file other than .env.example"
fi

printf 'Created and verified %s\n' "$output"
