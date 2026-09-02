"""取り込みレポートを読んで、落ちた理由ごとに実例を出す。"""

import collections
import io
import sys
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

rows = []
for line in Path("mutopia_report.tsv").read_text(encoding="utf-8").splitlines()[1:]:
    parts = (line.split("\t") + [""] * 6)[:6]
    rows.append(parts)

by_reason = collections.defaultdict(list)
ok = []
for status, reason, path, lic, composer, title in rows:
    if status == "ok":
        ok.append((title or Path(path).stem, composer, lic))
    else:
        by_reason[reason[:34]].append(path)

print(f"=== 通過 {len(ok)} 件 ===")
for title, composer, lic in ok:
    print(f"  {title[:44]:46s} {composer[:18]:20s} {lic[:26]}")

print("\n=== 落ちた理由ごとの実例 ===")
for reason, paths in sorted(by_reason.items(), key=lambda kv: -len(kv[1]))[:8]:
    print(f"\n[{len(paths):4d}] {reason}")
    for p in paths[:3]:
        print(f"        {p}")
