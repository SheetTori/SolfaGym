"""PDMX の CSV から、取り込む候補のパス一覧を作る。

ライセンスの根拠には **新しい Zenodo 版の CSV**（`subset:no_license_conflict`
列を持つ）を使う。旧版にはこの列が無く、MuseScore サイト上の表示と
ファイル内部の著作権表記が食い違う 31,221 曲（12.29%）を除外できない。

作曲者が Traditional / Trad. / Anonymous / Folk のものだけを候補にする。
「不明」の 154,290 曲には Billie Eilish・Undertale・Koji Kondo などが
CC0 と自己申告されており、そのまま使うことはできない。
"""

from __future__ import annotations

import collections
import csv
import io
import re
import sys
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
csv.field_size_limit(10**8)

TRADITIONAL = re.compile(r"\b(traditional|trad\.?|anonymous|anon\.?|folk|unknown)\b", re.I)
SUSPICIOUS_TITLE = re.compile(
    r"\b(cover|arr\.? by|ost|theme from|remix|feat\.?|tiktok|anime|opening|ending|"
    r"undertale|minecraft|pokemon|zelda|mario)\b",
    re.I,
)


def truthy(v: object) -> bool:
    return str(v).strip().lower() in ("true", "1", "yes")


def main() -> None:
    csv_path = Path(sys.argv[1])
    out_path = Path(sys.argv[2])

    stats: collections.Counter = collections.Counter()
    rows: list[tuple[str, str, str, str]] = []

    with csv_path.open(encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            stats["全体"] += 1
            if not truthy(row.get("subset:no_license_conflict")):
                continue
            stats["ライセンス矛盾なし"] += 1

            try:
                if int(float(row.get("n_tracks") or 0)) != 1:
                    continue
                bars = float(row.get("song_length.bars") or 0)
            except ValueError:
                continue
            stats["単一トラック"] += 1

            if truthy(row.get("is_draft")):
                continue
            stats["下書きでない"] += 1

            if not (8 <= bars <= 64):
                continue
            stats["8〜64小節"] += 1

            composer = (row.get("composer_name") or "").strip()
            title = (row.get("title") or row.get("song_name") or "").strip()
            if not TRADITIONAL.search(composer):
                continue
            stats["作曲者が伝承"] += 1

            if SUSPICIOUS_TITLE.search(title):
                stats["曲名が現代曲らしい（除外）"] += 1
                continue
            stats["候補"] += 1

            # data/ 配下の JSON パス。CSV の path は先頭に ./ が付くことがある
            path = (row.get("path") or "").lstrip("./").replace("\\", "/")
            rows.append((path, title, composer, (row.get("license") or "").strip()))

    print("=== 絞り込み ===")
    for k in [
        "全体", "ライセンス矛盾なし", "単一トラック", "下書きでない",
        "8〜64小節", "作曲者が伝承", "曲名が現代曲らしい（除外）", "候補",
    ]:
        print(f"  {k:24s} {stats[k]:>9,}")

    with out_path.open("w", encoding="utf-8") as f:
        for path, title, composer, license_name in rows:
            f.write(f"{path}\t{title}\t{composer}\t{license_name}\n")
    print(f"\n候補 {len(rows)} 件を {out_path} に書き出しました")
    if rows:
        print("\n=== 曲名のサンプル ===")
        for path, title, composer, _ in rows[:15]:
            print(f"  {title[:50]:52s} | {composer[:20]:22s} | {path[:40]}")


if __name__ == "__main__":
    main()
