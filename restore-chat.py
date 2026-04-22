#!/usr/bin/env python3
"""
Восстанавливает отсутствующий чат в UI проекта push.az.

Добавляет запись про чат "Casual greeting in Arabic" (3b4633b3-...)
в composer.composerData воркспейса push.az, чтобы он появился
в панели истории чатов.

Перед запуском ПОЛНОСТЬЮ закрой Cursor (Cmd+Q).
"""
import json
import os
import shutil
import sqlite3
import sys
import time
from pathlib import Path

HOME = Path.home()
WS_DB = HOME / "Library/Application Support/Cursor/User/workspaceStorage/295be461b05e71f3af0ccf198f9da521/state.vscdb"
GLOBAL_DB = HOME / "Library/Application Support/Cursor/User/globalStorage/state.vscdb"

MISSING_COMPOSER_ID = "3b4633b3-9014-4eba-9670-1d5dcfd80707"


def check_cursor_running() -> bool:
    result = os.popen("pgrep -x 'Cursor' 2>/dev/null || ps -A | grep '/Cursor.app/Contents/MacOS/Cursor' | grep -v grep").read().strip()
    return bool(result)


def main() -> int:
    if check_cursor_running():
        print("ERROR: Cursor всё ещё запущен. Закрой его полностью (Cmd+Q) и запусти скрипт снова.")
        return 1

    if not WS_DB.exists():
        print(f"ERROR: не найдена БД воркспейса: {WS_DB}")
        return 1
    if not GLOBAL_DB.exists():
        print(f"ERROR: не найдена глобальная БД: {GLOBAL_DB}")
        return 1

    ts = time.strftime("%Y%m%d-%H%M%S")
    backup = WS_DB.with_suffix(f".vscdb.backup-{ts}")
    shutil.copy2(WS_DB, backup)
    print(f"Бэкап воркспейс-БД: {backup}")

    with sqlite3.connect(GLOBAL_DB) as gconn:
        row = gconn.execute(
            "SELECT value FROM cursorDiskKV WHERE key = ?",
            (f"composerData:{MISSING_COMPOSER_ID}",),
        ).fetchone()
    if not row:
        print(f"ERROR: composerData для {MISSING_COMPOSER_ID} не найден в глобальной БД.")
        return 1
    global_data = json.loads(row[0])

    with sqlite3.connect(WS_DB) as wconn:
        row = wconn.execute(
            "SELECT value FROM ItemTable WHERE key = 'composer.composerData'"
        ).fetchone()
        if not row:
            print("ERROR: ключ composer.composerData не найден в БД воркспейса.")
            return 1
        cd = json.loads(row[0])

        if any(c.get("composerId") == MISSING_COMPOSER_ID for c in cd.get("allComposers", [])):
            print(f"OK: чат {MISSING_COMPOSER_ID} уже есть в индексе, ничего не меняю.")
            return 0

        new_entry = {
            "type": "head",
            "composerId": MISSING_COMPOSER_ID,
            "name": global_data.get("name", "Casual greeting in Arabic"),
            "lastUpdatedAt": global_data.get("lastUpdatedAt"),
            "createdAt": global_data.get("createdAt"),
            "unifiedMode": global_data.get("unifiedMode", "agent"),
            "forceMode": global_data.get("forceMode", "edit"),
            "hasUnreadMessages": False,
            "contextUsagePercent": global_data.get("contextUsagePercent", 0),
            "totalLinesAdded": global_data.get("totalLinesAdded", 0),
            "totalLinesRemoved": global_data.get("totalLinesRemoved", 0),
            "filesChangedCount": global_data.get("filesChangedCount", 0),
            "subtitle": global_data.get("subtitle", ""),
            "isArchived": False,
            "isDraft": False,
            "isWorktree": False,
            "worktreeStartedReadOnly": False,
            "isSpec": False,
            "isProject": False,
            "isBestOfNSubcomposer": False,
            "numSubComposers": 0,
            "referencedPlans": [],
            "branches": global_data.get("branches", []),
            "hasBlockingPendingActions": False,
        }

        cd.setdefault("allComposers", []).insert(0, new_entry)

        wconn.execute(
            "UPDATE ItemTable SET value = ? WHERE key = 'composer.composerData'",
            (json.dumps(cd, ensure_ascii=False),),
        )
        wconn.commit()

    print(f"OK: чат '{new_entry['name']}' добавлен в индекс воркспейса push.az.")
    print("Открывай Cursor — чат должен появиться в истории.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
