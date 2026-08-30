#!/bin/bash
# Installs ProfManager and clears the download quarantine so the app can open.
set +e

HERE="$(cd "$(dirname "$0")" && pwd)"
SRC=""
for candidate in \
  "$HERE/ProfManager.app" \
  "/Volumes/"*"/ProfManager.app" \
  "$HOME/Downloads/ProfManager.app"
do
  if [ -d "$candidate" ]; then
    SRC="$candidate"
    break
  fi
done

if [ -z "$SRC" ]; then
  osascript -e 'display alert "ProfManager.app غير موجود. افتح ملف الـ DMG أولاً ثم شغّل هذا التثبيت من داخله." as critical'
  exit 1
fi

DEST="/Applications/ProfManager.app"

osascript <<'APPLESCRIPT' >/dev/null
display dialog "سيتم نسخ ProfManager إلى مجلد Applications وإزالة قفل Gatekeeper ثم فتحه." buttons {"متابعة"} default button 1 with title "تثبيت ProfManager"
APPLESCRIPT
if [ $? -ne 0 ]; then
  exit 0
fi

xattr -cr "$SRC" >/dev/null 2>&1
xattr -d com.apple.quarantine "$SRC" >/dev/null 2>&1
find "$SRC" -exec xattr -d com.apple.quarantine {} \; >/dev/null 2>&1

rm -rf "$DEST"
ditto "$SRC" "$DEST"
if [ ! -d "$DEST" ]; then
  osascript -e 'display alert "فشل النسخ إلى Applications. أعد المحاولة أو اسحب ProfManager يدوياً ثم شغّل التثبيت مرة أخرى." as critical'
  exit 1
fi

xattr -cr "$DEST" >/dev/null 2>&1
xattr -d com.apple.quarantine "$DEST" >/dev/null 2>&1
find "$DEST" -exec xattr -d com.apple.quarantine {} \; >/dev/null 2>&1

# Clear quarantine on this installer too (so a later re-run is not blocked).
xattr -cr "$HERE" >/dev/null 2>&1

open "$DEST"
if [ $? -ne 0 ]; then
  osascript -e 'display dialog "تم التثبيت في Applications. إذا رفض النظام الفتح: انقر بزر أيمن على ProfManager ثم اختر فتح." buttons {"حسناً"} default button 1 with title "ProfManager"'
fi
exit 0
