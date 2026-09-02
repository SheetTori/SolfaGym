"""<harmony> を持つ MusicXML を作り、度数への変換を検証する。

PDMX のリードシートにはコード記号が入っているものがあるので、
それが正しくローマ数字になるかを、取り込み前に確かめておく。
"""

import io
import sys
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

from music21 import harmony, key, meter, metadata, note, stream  # noqa: E402

import extract  # noqa: E402


def main() -> None:
    score = stream.Score()
    score.metadata = metadata.Metadata(title="chordtest")
    part = stream.Part()
    part.append(meter.TimeSignature("4/4"))
    part.append(key.Key("C"))

    # ハ長調で I - IV - V7 - vi - I、旋律は do で終止する
    plan = [
        ("C", ["C4", "E4", "G4", "E4"]),
        ("F", ["F4", "A4", "G4", "F4"]),
        ("G7", ["G4", "F4", "E4", "D4"]),
        ("Am", ["A4", "G4", "E4", "C4"]),
        ("C", ["E4", "D4", "C4", "C4"]),
    ]
    for i, (symbol, pitches) in enumerate(plan):
        m = stream.Measure(number=i + 1)
        m.append(harmony.ChordSymbol(symbol))
        for name in pitches:
            m.append(note.Note(name, quarterLength=1))
        part.append(m)
    score.append(part)

    out = Path("chordtest.musicxml")
    score.write("musicxml", fp=str(out))

    result = extract.extract(out, source="test", license_name="CC0", source_url=None)
    print(f"tonicMidi: {result.tonicMidi} {result.mode}")
    print(f"chordsFromSource: {result.provenance['chordsFromSource']}")
    print("抽出したコード:")
    for c in result.chords:
        print(f"   bar={c['bar']} beat={c['beat']} → {c['degree']}")

    expected = ["I", "IV", "V7", "vi", "I"]
    got = [c["degree"] for c in result.chords]
    print(f"\n期待: {expected}")
    print(f"実際: {got}")
    print("一致" if got == expected else "★不一致★")


if __name__ == "__main__":
    main()
