"""候補の .ly を全件 extract.py に通し、通ったものと落ちた理由を集計する。

数百曲を目視で確かめるのは現実的でないので、機械が落とした理由を
一覧にして、人はそれと抜き取りだけを見る。
"""

import collections
import io
import json
import sys
from dataclasses import asdict
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

from extract import Unsupported, extract  # noqa: E402

CANDIDATES = Path("mutopia_candidates.tsv")
OUT_DIR = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("../../data/import")
REPORT = Path("mutopia_report.tsv")

MUTOPIA_URL = "https://www.mutopiaproject.org/"


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    rows = [line.rstrip("\n").split("\t") for line in CANDIDATES.read_text(encoding="utf-8").splitlines()]

    reasons: collections.Counter = collections.Counter()
    kept = 0
    report = REPORT.open("w", encoding="utf-8")
    report.write("status\treason\tpath\tlicense\tcomposer\ttitle\n")

    for i, row in enumerate(rows, 1):
        path, lic, _inst, _style, composer, title = (row + [""] * 6)[:6]
        p = Path(path)
        try:
            result = extract(p, source="Mutopia", license_name=lic, source_url=MUTOPIA_URL)
        except Unsupported as e:
            reasons[str(e)[:60]] += 1
            report.write(f"skip\t{e}\t{path}\t{lic}\t{composer}\t{title}\n")
            continue
        except Exception as e:  # 想定外の失敗も理由として残す
            reasons[f"[例外] {type(e).__name__}: {str(e)[:40]}"] += 1
            report.write(f"error\t{type(e).__name__}: {e}\t{path}\t{lic}\t{composer}\t{title}\n")
            continue

        # Mutopia のヘッダから取れる情報で補う
        if title:
            result.title = title
        result.id = f"mutopia-{p.stem.lower()}"
        result.provenance["sourceUrl"] = MUTOPIA_URL

        (OUT_DIR / f"{result.id}.json").write_text(
            json.dumps(asdict(result), ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        kept += 1
        report.write(f"ok\t\t{path}\t{lic}\t{composer}\t{title}\n")

        if i % 25 == 0:
            print(f"  {i}/{len(rows)} 件処理  （通過 {kept}）", flush=True)

    report.close()
    print(f"\n=== 結果: {len(rows)} 件中 {kept} 件が通過 ===\n")
    print("=== 落とした理由 ===")
    for reason, n in reasons.most_common(20):
        print(f"  {n:4d}  {reason}")
    print(f"\n詳細は {REPORT}、中間 JSON は {OUT_DIR}")


if __name__ == "__main__":
    main()
