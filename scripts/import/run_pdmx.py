"""PDMX の Traditional 層から単旋律を取り込む。

PDMX の「CC0 / PD Mark」は投稿者の自己申告なので、**作曲者名で裏を取れる
ものだけ**を対象にする。実測では、絞り込み後の高評価曲の作曲者に
Billie Eilish・Lewis Capaldi・Toby Fox・Koji Kondo が並んでおり、
現代の著作権が生きている曲が CC0 と申告されていることが分かっている。

したがって作曲者が Traditional / Trad. / Anonymous / Folk のものだけを候補にする。
民謡の転写なので、現代曲を拾うリスクが構造的に低い。

    uv run python run_pdmx.py <PDMX.csv> <mxl を展開したディレクトリ>
"""

from __future__ import annotations

import collections
import csv
import io
import json
import re
import sys
from dataclasses import asdict
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
csv.field_size_limit(10**8)

from extract import Unsupported, extract  # noqa: E402

OUT_DIR = Path("../../data/import")
REPORT = Path("pdmx_report.tsv")
PDMX_URL = "https://zenodo.org/records/14648209"

# 作曲者名が伝承を示すもの。ここに当たらないものは一切取らない
TRADITIONAL = re.compile(r"\b(traditional|trad\.?|anonymous|anon\.?|folk|unknown)\b", re.I)

# 曲名に現代のアーティスト名が入っている投稿があるので、念のため弾く
SUSPICIOUS_TITLE = re.compile(
    r"\b(cover|arr\.? by|ost|theme from|remix|feat\.?|tiktok|anime|opening|ending)\b", re.I
)


def truthy(v: object) -> bool:
    return str(v).strip().lower() in ("true", "1", "yes")


def candidates(csv_path: Path, limit: int | None) -> list[dict]:
    """CSV から、取り込む価値のある行だけを選ぶ"""
    out: list[dict] = []
    stats: collections.Counter = collections.Counter()

    with csv_path.open(encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            stats["全体"] += 1
            if not truthy(row.get("subset:no_license_conflict")):
                continue
            stats["ライセンス矛盾なし"] += 1

            try:
                n_tracks = int(float(row.get("n_tracks") or 0))
                bars = float(row.get("song_length.bars") or 0)
            except ValueError:
                continue
            if n_tracks != 1:
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

            out.append(
                {
                    "path": row.get("mxl") or row.get("path") or "",
                    "title": title,
                    "composer": composer,
                    "license": (row.get("license") or "CC0 / PD Mark").strip(),
                    "rating": row.get("rating") or "",
                    "n_ratings": row.get("n_ratings") or "",
                }
            )
            if limit and len(out) >= limit:
                break

    print("=== CSV の絞り込み ===")
    for k in [
        "全体", "ライセンス矛盾なし", "単一トラック", "下書きでない",
        "8〜64小節", "作曲者が伝承", "曲名が現代曲らしい（除外）", "候補",
    ]:
        print(f"  {k:24s} {stats[k]:>9,}")
    return out


def main() -> None:
    csv_path = Path(sys.argv[1])
    mxl_root = Path(sys.argv[2])
    limit = int(sys.argv[3]) if len(sys.argv) > 3 else None

    rows = candidates(csv_path, limit)
    print(f"\n{len(rows)} 件を取り込みにかけます\n")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    reasons: collections.Counter = collections.Counter()
    kept = 0

    with REPORT.open("w", encoding="utf-8") as report:
        report.write("status\treason\tpath\ttitle\tcomposer\trating\n")
        for i, row in enumerate(rows, 1):
            rel = row["path"].lstrip("./").replace("\\", "/")
            path = mxl_root / rel
            if not path.exists():
                # データセット内の相対パスは先頭が data/ のことがある
                alt = mxl_root / Path(rel).name
                path = alt if alt.exists() else path
            if not path.exists():
                reasons["ファイルが見つからない"] += 1
                report.write(f"skip\tファイルが見つからない\t{rel}\t{row['title']}\t{row['composer']}\t\n")
                continue

            try:
                result = extract(path, source="PDMX", license_name=row["license"], source_url=PDMX_URL)
            except Unsupported as e:
                reasons[str(e)[:50]] += 1
                report.write(f"skip\t{e}\t{rel}\t{row['title']}\t{row['composer']}\t{row['rating']}\n")
                continue
            except Exception as e:
                reasons[f"[例外] {type(e).__name__}"] += 1
                report.write(f"error\t{type(e).__name__}: {e}\t{rel}\t{row['title']}\t{row['composer']}\t\n")
                continue

            if row["title"]:
                result.title = row["title"]
            result.id = f"pdmx-{Path(rel).stem}"
            result.provenance["sourceUrl"] = PDMX_URL

            (OUT_DIR / f"{result.id}.json").write_text(
                json.dumps(asdict(result), ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
            )
            kept += 1
            report.write(f"ok\t\t{rel}\t{row['title']}\t{row['composer']}\t{row['rating']}\n")

            if i % 100 == 0:
                print(f"  {i}/{len(rows)} 件処理  （通過 {kept}）", flush=True)

    print(f"\n=== 結果: {len(rows)} 件中 {kept} 件が通過 ===\n")
    print("=== 落とした理由 ===")
    for reason, n in reasons.most_common(20):
        print(f"  {n:5d}  {reason}")


if __name__ == "__main__":
    main()
