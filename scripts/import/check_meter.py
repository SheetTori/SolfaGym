"""PDMX の各曲で、小節線の間隔が宣言された拍子と一致するかを測る。

一致しない曲は「拍子記号は 2/2 なのに 1 小節に 4 分音符 1 つ分しか入っていない」
という状態で、メトロノームが小節線と合わなくなる。
"""

import collections
import glob
import io
import json
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

ratios: collections.Counter = collections.Counter()
examples: dict = {}
checked = 0

for path in glob.glob(sys.argv[1] + "/PDMX/data/*/*/*.json"):
    try:
        d = json.load(open(path, encoding="utf-8"))
    except Exception:
        continue

    resolution = d.get("resolution") or 0
    ts = (d.get("time_signatures") or [None])[0]
    barlines = d.get("barlines") or []
    if not resolution or not ts or len(barlines) < 3:
        continue

    # 小節線の間隔の最頻値を「実際の 1 小節」とみなす
    spans = collections.Counter(
        barlines[i + 1]["time"] - barlines[i]["time"] for i in range(len(barlines) - 1)
    )
    actual = spans.most_common(1)[0][0]
    if actual <= 0:
        continue

    expected = resolution * 4 * ts["numerator"] / ts["denominator"]
    ratio = expected / actual
    checked += 1

    # 2 の冪に丸めて分類する
    key = round(ratio, 3)
    ratios[key] += 1
    if key not in examples:
        examples[key] = (path.split("/")[-1][:24], f'{ts["numerator"]}/{ts["denominator"]}', actual, expected)

print(f"調べた曲: {checked:,}\n")
print("=== 宣言された1小節の長さ ÷ 実際の小節線の間隔 ===")
for key, n in ratios.most_common(12):
    name, meter, actual, expected = examples[key]
    mark = "  ← 一致" if abs(key - 1.0) < 0.01 else ""
    print(f"  倍率 {key:>7}  {n:>6,} 曲   例: {meter} 実測{actual} 期待{expected:.0f}{mark}")

ok = sum(n for k, n in ratios.items() if abs(k - 1.0) < 0.01)
print(f"\n一致: {ok:,} / {checked:,} ({ok / max(1, checked) * 100:.1f}%)")
