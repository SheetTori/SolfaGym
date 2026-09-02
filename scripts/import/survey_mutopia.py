"""Mutopia の .ly を、ライセンスと単旋律らしさで安く絞り込む。

`ly musicxml` は1ファイルあたり数秒かかるので、テキストの走査で先に候補を減らす。
"""

import collections
import io
import re
import sys
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

ROOT = Path(sys.argv[1])

# ShareAlike は改変物への継承義務があるので外す
OK_LICENSE = re.compile(
    r"^(public domain|domaine public.*|creative commons attribution [0-9.]+)$", re.I
)

# 多声・複数段を示す記法
POLY_PATTERNS = [
    re.compile(r"\\new\s+(PianoStaff|ChoirStaff|StaffGroup|GrandStaff)"),
    re.compile(r"\\chordmode"),
    # << ... \\ ... >> は同時に複数声部を書く記法
    re.compile(r"<<[^>]{0,4000}?\\\\", re.S),
]
STAFF = re.compile(r"\\new\s+Staff")

# 曲の本体であることの印。header.ly / defs.ly のように \include される断片を外す
SCORE = re.compile(r"\\score\b")

# オーケストラのパート譜は単旋律だが「歌う教材」ではない
ORCHESTRAL_PART = re.compile(
    r"(-part$|^(clarinetti|clarinetto|oboi|oboe|fagotti|fagotto|corni|corno|flauti|flauto"
    r"|timpani|contrabasso|violino|viola|basso|cello|violoncello|trombe|tromba|tromboni"
    r"|trombone|arpa|percussione)\b)",
    re.I,
)


def header(text: str, field: str) -> str:
    m = re.search(field + r'\s*=\s*"([^"]*)"', text)
    return m.group(1).strip() if m else ""


def main() -> None:
    stats: collections.Counter = collections.Counter()
    candidates = []
    licenses: collections.Counter = collections.Counter()

    for p in sorted(ROOT.rglob("*.ly")):
        try:
            text = p.read_text(encoding="utf-8", errors="replace")
        except OSError:
            stats["読めない"] += 1
            continue
        stats["全ファイル"] += 1

        lic = header(text, "copyright")
        if not lic:
            stats["ライセンス記載なし"] += 1
            continue
        licenses[lic] += 1
        if not OK_LICENSE.match(lic):
            stats["ライセンス不適(SA等)"] += 1
            continue
        stats["ライセンスOK"] += 1

        if not SCORE.search(text):
            stats["曲の本体でない(断片)"] += 1
            continue
        if ORCHESTRAL_PART.search(p.stem):
            stats["オーケストラのパート譜"] += 1
            continue

        if any(pat.search(text) for pat in POLY_PATTERNS):
            stats["多声の記法を含む"] += 1
            continue
        if len(STAFF.findall(text)) > 1:
            stats["Staff が複数"] += 1
            continue

        stats["単旋律の候補"] += 1
        candidates.append(
            (
                p,
                lic,
                header(text, "mutopiainstrument"),
                header(text, "style"),
                header(text, "mutopiacomposer"),
                header(text, "mutopiatitle"),
            )
        )

    print("=== 絞り込み ===")
    for k in [
        "全ファイル",
        "ライセンス記載なし",
        "ライセンス不適(SA等)",
        "ライセンスOK",
        "曲の本体でない(断片)",
        "オーケストラのパート譜",
        "多声の記法を含む",
        "Staff が複数",
        "単旋律の候補",
    ]:
        print(f"  {k:22s} {stats[k]:>6,}")

    print("\n=== 候補の楽器 ===")
    for k, n in collections.Counter(c[2] or "(記載なし)" for c in candidates).most_common(12):
        print(f"  {n:4d}  {k[:50]}")

    print("\n=== 候補の作曲者 上位 ===")
    for k, n in collections.Counter(c[4] or "(記載なし)" for c in candidates).most_common(12):
        print(f"  {n:4d}  {k[:50]}")

    out = Path("mutopia_candidates.tsv")
    with out.open("w", encoding="utf-8") as f:
        for p, lic, inst, style, comp, title in candidates:
            f.write(f"{p}\t{lic}\t{inst}\t{style}\t{comp}\t{title}\n")
    print(f"\n候補 {len(candidates)} 件を {out} に書き出しました")


if __name__ == "__main__":
    main()
