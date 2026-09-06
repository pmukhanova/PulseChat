#!/usr/bin/env sh
set -eu

export LC_ALL=C

project_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
artifacts_dir="$project_root/artifacts"
output="$artifacts_dir/pulse-chat-submission.zip"
package_name='pulse-chat-submission'
staging=$(mktemp -d "${TMPDIR:-/tmp}/pulse-chat-submission.XXXXXX")
package_dir="$staging/$package_name"
trap 'rm -rf "$staging"' EXIT HUP INT TERM

fail() {
  printf 'ERROR: %s\n' "$1" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "required command not found: $1"
}

for command_name in zip unzip grep sed wc tr; do
  require_command "$command_name"
done

source_archive="$artifacts_dir/pulse-chat-source.zip"
report="$artifacts_dir/pulse-chat-report.pdf"
presentation="$artifacts_dir/presentation.pptx"
demo="$artifacts_dir/demo/pulse-chat-presentation-demo.webm"
erd="$project_root/docs/erd.svg"
architecture="$project_root/docs/architecture.svg"
sequence="$project_root/docs/send-message-sequence.svg"
realtime="$project_root/docs/realtime-sync.svg"
auth_model="$project_root/docs/auth-model.md"
roles="$project_root/docs/roles-and-permissions.md"
runbook="$project_root/docs/runbook.md"
contribution="$project_root/docs/contribution.md"
testing="$project_root/docs/testing.md"
defense_script="$project_root/docs/defense-script.md"
sql_examples="$project_root/scripts/sql_examples.sql"

for required_file in \
  "$source_archive" \
  "$report" \
  "$presentation" \
  "$demo" \
  "$erd" \
  "$architecture" \
  "$sequence" \
  "$realtime" \
  "$auth_model" \
  "$roles" \
  "$runbook" \
  "$contribution" \
  "$testing" \
  "$defense_script" \
  "$sql_examples"
do
  [ -f "$required_file" ] || fail "required input is missing: $required_file"
  [ -s "$required_file" ] || fail "required input is empty: $required_file"
done

unzip -tqq "$source_archive" || fail "source ZIP integrity check failed: $source_archive"
if unzip -Z1 "$source_archive" | grep -Ev '^pulse-chat/' >/dev/null; then
  fail "source ZIP does not use the required pulse-chat/ top-level folder"
fi

mkdir -p "$package_dir/docs"

cp -p "$source_archive" "$package_dir/pulse-chat-source.zip"
cp -p "$report" "$package_dir/pulse-chat-report.pdf"
cp -p "$presentation" "$package_dir/presentation.pptx"
cp -p "$demo" "$package_dir/pulse-chat-presentation-demo.webm"
cp -p "$erd" "$package_dir/docs/erd.svg"
cp -p "$architecture" "$package_dir/docs/architecture.svg"
cp -p "$sequence" "$package_dir/docs/send-message-sequence.svg"
cp -p "$realtime" "$package_dir/docs/realtime-sync.svg"
cp -p "$auth_model" "$package_dir/docs/auth-model.md"
cp -p "$roles" "$package_dir/docs/roles-and-permissions.md"
cp -p "$runbook" "$package_dir/docs/runbook.md"
cp -p "$contribution" "$package_dir/docs/contribution.md"
cp -p "$testing" "$package_dir/docs/testing.md"
cp -p "$defense_script" "$package_dir/docs/defense-script.md"
cp -p "$sql_examples" "$package_dir/docs/sql_examples.sql"

{
  printf '%s\n' \
    'PulseChat — комплект материалов для защиты' \
    '' \
    'Обязательный материал | Файл' \
    '1. Отчёт | pulse-chat-report.pdf' \
    '2. ER | docs/erd.svg' \
    '3. Код сервисов | pulse-chat-source.zip/backend' \
    '4. Код скриптов | docs/sql_examples.sql и pulse-chat-source.zip' \
    '5. Модель авторизации | docs/auth-model.md' \
    '6. Роли | docs/roles-and-permissions.md' \
    '7. Инструкция запуска | docs/runbook.md' \
    '8. Запись сценариев | pulse-chat-presentation-demo.webm' \
    '9. Презентация | presentation.pptx' \
    '10. Вклад | docs/contribution.md' \
    '' \
    'Дополнительные материалы:' \
    '- docs/architecture.svg — архитектура;' \
    '- docs/send-message-sequence.svg — полная последовательность отправки;' \
    '- docs/realtime-sync.svg — синхронизация без reload;' \
    '- docs/testing.md — результаты проверок;' \
    '- docs/defense-script.md — сценарий защиты.' \
    '' \
    'Исходный архив имеет корневую папку pulse-chat/ и не содержит зависимостей, сборок, секретов и временных файлов.'
} > "$package_dir/README.txt"

rm -f "$output"
(
  cd "$staging"
  zip -X -qr "$output" "$package_name"
)

unzip -tqq "$output" || fail "submission ZIP integrity check failed: $output"

listing="$staging/submission-entries.txt"
unzip -Z1 "$output" > "$listing"

for required_entry in \
  "$package_name/README.txt" \
  "$package_name/pulse-chat-source.zip" \
  "$package_name/pulse-chat-report.pdf" \
  "$package_name/presentation.pptx" \
  "$package_name/pulse-chat-presentation-demo.webm" \
  "$package_name/docs/erd.svg" \
  "$package_name/docs/architecture.svg" \
  "$package_name/docs/send-message-sequence.svg" \
  "$package_name/docs/realtime-sync.svg" \
  "$package_name/docs/auth-model.md" \
  "$package_name/docs/roles-and-permissions.md" \
  "$package_name/docs/runbook.md" \
  "$package_name/docs/contribution.md" \
  "$package_name/docs/testing.md" \
  "$package_name/docs/defense-script.md" \
  "$package_name/docs/sql_examples.sql"
do
  grep -Fqx "$required_entry" "$listing" || fail "submission ZIP is missing: $required_entry"
done

file_count=$(sed -n '/\/$/!p' "$listing" | wc -l | tr -d ' ')
[ "$file_count" -eq 16 ] || fail "submission ZIP must contain exactly 16 files; found $file_count"

if grep -E '(^|/)(node_modules|dist|build|\.git|__MACOSX)(/|$)|(^|/)(\.DS_Store|Thumbs\.db)$|(^|/)\._|(^|/)\.env($|\.)' "$listing" >/dev/null; then
  fail "submission ZIP contains a forbidden dependency, build, VCS, secret, or system path"
fi

if grep -Fqx "$package_name/pulse-chat-submission.zip" "$listing"; then
  fail "submission ZIP recursively contains itself"
fi

printf 'Created and verified %s\n' "$output"
