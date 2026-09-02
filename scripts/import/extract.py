"""楽譜（MusicXML / LilyPond）から単旋律を取り出し、中間 JSON に落とす。

ここは「綴りを保ったまま音符列を取り出す」ところまでを担当する。
ABC 文字列の生成は TypeScript 側（src/core/abcSource.ts）に置いてある。
そうすると「アプリが受け付ける ABC」の定義が parseAbc() ひとつに保たれ、
往復テストがそのまま取り込みの検証になる。

使い方:
    uv run python extract.py <楽譜ファイル> [--source Mutopia --license "Public Domain"]
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import tempfile
from dataclasses import dataclass, asdict, field
from pathlib import Path

from music21 import bar, chord, converter, key, meter, note, stream

STEP_INDEX = {name: i for i, name in enumerate("CDEFGAB")}


class Unsupported(Exception):
    """取り込みの対象外。理由を添えてレポートに出す"""


# --- 調の判定 ---------------------------------------------------------------

# 主音の上に何度が乗っているかで長短を決める。上から順に見て最初に決まったものを採る。
# 調号を使わないのは、実データが調号と一致しないことが普通にあるため
# （Mutopia の日本俗曲は調号 0 個で F# を含み、最終音は E だった）。
_MODE_HINTS = [
    (3, "minor"), (4, "major"),   # 3度
    (8, "minor"), (9, "major"),   # 6度
    (10, "minor"), (11, "major"), # 7度
]


@dataclass
class KeyGuess:
    tonic_midi: int
    mode: str
    """判定に使った音程（半音数）。None なら手がかりが無く既定に落ちた"""
    decided_by: int | None
    """music21 の analyze('key') と一致したか"""
    agrees_with_analysis: bool
    confidence: float | None


def guess_key(notes: list[note.Note], score: stream.Score) -> KeyGuess:
    """最終音を主音とし、その上の音程で長短を決める。

    単旋律の民謡・唱歌は 95% 以上が主音で終止する。調号から
    「長調主音か平行短調主音か」を選ぶ方式は、教会旋法や民族音階
    （日本の俗曲、ドリア旋法のアイリッシュ民謡）で丸ごと外れる。
    """
    tonic = notes[-1].pitch
    tonic_midi = int(tonic.midi)
    tonic_pc = tonic.pitchClass
    pcs = {n.pitch.pitchClass for n in notes}

    mode, decided_by = "major", None
    for interval, candidate in _MODE_HINTS:
        if (tonic_pc + interval) % 12 in pcs:
            mode, decided_by = candidate, interval
            break

    agrees, confidence = False, None
    try:
        analyzed = score.analyze("key")
        confidence = float(getattr(analyzed, "correlationCoefficient", 0.0))
        agrees = analyzed.tonic.pitchClass == tonic_pc and analyzed.mode == mode
    except Exception:
        pass

    return KeyGuess(tonic_midi, mode, decided_by, agrees, confidence)


# --- 楽譜の読み込み ---------------------------------------------------------


def load_score(path: Path) -> stream.Score:
    """MusicXML はそのまま、LilyPond は python-ly を挟んで読む。

    music21 は LilyPond を書き出せるが**読めない**ので、
    `ly musicxml` で MusicXML に変換してから渡す。
    """
    if path.suffix.lower() in (".ly", ".ily"):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "converted.musicxml"
            result = subprocess.run(
                [sys.executable, "-m", "ly", "musicxml", str(path), "-o", str(out)],
                capture_output=True,
                text=True,
            )
            if not out.exists() or out.stat().st_size == 0:
                raise Unsupported(f"LilyPond の変換に失敗: {result.stderr.strip()[:200]}")
            return converter.parse(str(out))
    return converter.parse(str(path))


def pick_melody_part(score: stream.Score) -> tuple[stream.Part, bool]:
    """単旋律のパートを1つ選ぶ。返り値の bool は skyline を使ったか。

    多声を潰して最高音を取る（skyline）方式は、アルト/テノールに旋律がある曲や
    声部交叉で破綻する。**今回は skyline を使わず、単一パートでない曲は弾く。**
    量より確実さを取る。
    """
    parts = list(score.parts)
    if len(parts) > 1:
        raise Unsupported(f"パートが {len(parts)} 個ある（単旋律のみ対応）")
    part = parts[0] if parts else score

    # 小節ごとの声部数を見る。全小節から数えると、単声部でも
    # 小節数と同じ数の Voice を数えてしまう
    measures = list(part.getElementsByClass(stream.Measure))
    max_voices = max((len(m.voices) for m in measures), default=0)
    if max_voices > 1:
        raise Unsupported(f"同時に {max_voices} 声部ある（単旋律のみ対応）")

    return part, False


# --- 要素の取り出し ---------------------------------------------------------


@dataclass
class Extracted:
    id: str
    title: str
    meter: dict
    tonicMidi: int
    mode: str
    baseBpm: float
    elements: list = field(default_factory=list)
    chords: list = field(default_factory=list)
    provenance: dict = field(default_factory=dict)
    titleEn: str | None = None
    language: str | None = None


def _bar_kind(measure: stream.Measure, is_last: bool) -> str | None:
    """小節の右側の縦線を、中間表現のバー種別にする"""
    right = measure.rightBarline
    left_repeat = isinstance(measure.leftBarline, bar.Repeat)
    right_repeat = isinstance(right, bar.Repeat)

    if right_repeat:
        return "repeat-end"
    if right is not None and getattr(right, "type", None) == "final":
        return "final"
    if is_last:
        return "final"
    if right is not None and getattr(right, "type", None) in ("double", "light-light"):
        return "double"
    return "normal"


def extract(path: Path, source: str, license_name: str, source_url: str | None) -> Extracted:
    score = load_score(path)

    # 移調楽器は実音に直す。'unknown' は素通しにして provenance に残す
    if score.atSoundingPitch is False:
        score = score.toSoundingPitch()

    part, skyline_used = pick_melody_part(score)

    time_sigs = list(part.recurse().getElementsByClass(meter.TimeSignature))
    if not time_sigs:
        raise Unsupported("拍子記号が無い")
    ratios = {t.ratioString for t in time_sigs}
    if len(ratios) > 1:
        raise Unsupported(f"拍子が曲の途中で変わる: {sorted(ratios)}")
    ts = time_sigs[0]

    key_sigs = list(part.recurse().getElementsByClass(key.KeySignature))
    if len({k.sharps for k in key_sigs}) > 1:
        raise Unsupported("調号が曲の途中で変わる")

    elements: list[dict] = []
    sounding: list[note.Note] = []
    inferred = False

    measures = list(part.getElementsByClass(stream.Measure))
    if not measures:
        raise Unsupported("小節が無い")

    for i, measure in enumerate(measures):
        if isinstance(measure.leftBarline, bar.Repeat):
            elements.append({"kind": "bar", "type": "repeat-start"})

        for el in measure.notesAndRests:
            if isinstance(el, chord.Chord):
                raise Unsupported("和音を含む（単旋律のみ対応）")
            if isinstance(el, note.Rest):
                elements.append({"kind": "rest", "ql": float(el.duration.quarterLength)})
                continue
            if not isinstance(el, note.Note):
                continue
            if el.duration.tuplets:
                raise Unsupported("連符を含む（ABC の対応範囲外）")
            if float(el.duration.quarterLength) <= 0:
                raise Unsupported("装飾音（音価 0）を含む")

            p = el.pitch
            if p.octave is None:
                raise Unsupported("オクターブが決まらない音符がある")
            inferred = inferred or bool(p.spellingIsInferred)
            tie_type = el.tie.type if el.tie else None
            elements.append(
                {
                    "kind": "note",
                    "step": STEP_INDEX[p.step],
                    "alter": int(p.accidental.alter) if p.accidental else 0,
                    "octave": int(p.octave),
                    "ql": float(el.duration.quarterLength),
                    "tie": tie_type if tie_type in ("start", "stop", "continue") else None,
                }
            )
            if tie_type in (None, "start"):
                sounding.append(el)

        kind = _bar_kind(measure, is_last=(i == len(measures) - 1))
        if kind:
            elements.append({"kind": "bar", "type": kind})

    if not sounding:
        raise Unsupported("音符が無い")


    guess = guess_key(sounding, score)
    title = (score.metadata.title if score.metadata else None) or path.stem

    return Extracted(
        id=slugify(f"{source}-{path.stem}"),
        title=title,
        meter={"num": ts.numerator, "den": ts.denominator},
        tonicMidi=guess.tonic_midi,
        mode=guess.mode,
        baseBpm=96,
        elements=elements,
        chords=[],
        provenance={
            "source": source,
            "sourceId": path.stem,
            "sourceUrl": source_url,
            "license": license_name,
            "spellingInferred": inferred,
            "keyConfidence": guess.confidence,
            "keyDecidedBy": guess.decided_by,
            "keyAgreesWithAnalysis": guess.agrees_with_analysis,
            "skylineUsed": skyline_used,
            "chordsFromSource": False,
        },
    )


def slugify(text: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9]+", "-", text).strip("-").lower()
    return re.sub(r"-+", "-", s) or "song"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("path", type=Path)
    ap.add_argument("--source", default="unknown")
    ap.add_argument("--license", default="unknown")
    ap.add_argument("--url", default=None)
    ap.add_argument("-o", "--out", type=Path, default=None)
    args = ap.parse_args()

    try:
        result = extract(args.path, args.source, args.license, args.url)
    except Unsupported as e:
        print(json.dumps({"skipped": str(e), "path": str(args.path)}, ensure_ascii=False))
        return 2

    text = json.dumps(asdict(result), ensure_ascii=False, indent=2)
    if args.out:
        args.out.write_text(text + "\n", encoding="utf-8")
    else:
        sys.stdout.reconfigure(encoding="utf-8")
        print(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
