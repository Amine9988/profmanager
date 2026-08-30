#!/bin/bash
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="$HERE/ProfManager.app"
DEST="/Applications/ProfManager.app"

if [ ! -d "$SRC" ]; then
  osascript -e 'display alert "ProfManager.app غير موجود داخل ملف التثبيت." as critical'
  exit 1
fi

osascript -e 'display dialog "سيتم تثبيت ProfManager في Applications ثم فتحه." buttons {"متابعة"} default button 1 with title "ProfManager"' >/dev/null

rm -rf "$DEST"
ditto "$SRC" "$DEST"
xattr -cr "$DEST" >/dev/null 2>&1 || true
xattr -cr "$SRC" >/dev/null 2>&1 || true

open "$DEST"
