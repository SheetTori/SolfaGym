"""候補の PDMX JSON を全件 extract_pdmx.py に通し、通ったものと落ちた理由を集計する。

    uv run python run_pdmx.py <展開先ディレクトリ>

候補一覧（pdmx_candidates.tsv）は pdmx_candidates.py が作る。
そこで既に「ライセンス矛盾なし・単一トラック・8〜64小節・作曲者が伝承」
まで絞ってあるので、ここは楽譜の中身だけを見る。
"""

from __future__ import annotations

import collections
import io
import json
import sys
from dataclasses import asdict
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

from extract import Unsupported  # noqa: E402
from extract_pdmx import extract_pdmx  # noqa: E402

CANDIDATES = Path("pdmx_candidates.tsv")
OUT_DIR = Path("../../data/import")
REPORT = Path("pdmx_report.tsv")
PDMX_URL = "https://zenodo.org/records/14648209"


def main() -> None:
    root = Path(sys.argv[1])
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    rows = [
        (line.split("\t") + [""] * 4)[:4]
        for line in CANDIDATES.read_text(encoding="utf-8").splitlines()
    ]

    reasons: collections.Counter = collections.Counter()
    kept = 0
    missing = 0

    with REPORT.open("w", encoding="utf-8") as report:
        report.write("status\treason\thash\ttitle\tcomposer\n")
        for i, (path, title, composer, license_name) in enumerate(rows, 1):
            h = Path(path).stem
            if len(h) < 4:
                continue
            src = root / "PDMX" / "data" / h[2] / h[3] / f"{h}.json"
            if not src.exists():
                missing += 1
                continue

            try:
                result = extract_pdmx(
                    src,
                    source="PDMX",
                    license_name=license_name or "CC0 / Public Domain Mark",
                    source_url=PDMX_URL,
                    title=title or None,
                )
            except Unsupported as e:
                reasons[str(e)[:56]] += 1
                report.write(f"skip\t{e}\t{h}\t{title}\t{composer}\n")
                continue
            except Exception as e:
                reasons[f"[例外] {type(e).__name__}: {str(e)[:30]}"] += 1
                report.write(f"error\t{type(e).__name__}: {e}\t{h}\t{title}\t{composer}\n")
                continue

            result.id = f"pdmx-{h[:16].lower()}"
            (OUT_DIR / f"{result.id}.json").write_text(
                json.dumps(asdict(result), ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
            kept += 1
            report.write(f"ok\t\t{h}\t{title}\t{composer}\n")

            if i % 500 == 0:
                print(f"  {i}/{len(rows)} 件処理  （通過 {kept}）", flush=True)

    print(f"\n=== 結果: {len(rows)} 件中 {kept} 件が通過 ===")
    if missing:
        print(f"（展開先に存在しなかったもの: {missing} 件）")
    print("\n=== 落とした理由 ===")
    for reason, n in reasons.most_common(20):
        print(f"  {n:5d}  {reason}")


if __name__ == "__main__":
    main()
