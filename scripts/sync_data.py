"""Generate the static disease library from ml-service/labels.json.

Run from the repository root after editing labels.json:

    python scripts/sync_data.py
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "ml-service" / "labels.json"
TARGET = ROOT / "web" / "assets" / "data" / "diseases.json"

with SOURCE.open("r", encoding="utf-8") as fh:
    data = json.load(fh)

TARGET.parent.mkdir(parents=True, exist_ok=True)
with TARGET.open("w", encoding="utf-8") as fh:
    json.dump(data, fh, ensure_ascii=False, indent=2)
    fh.write("\n")

print(f"Wrote {TARGET} ({len(data['classes'])} classes)")
