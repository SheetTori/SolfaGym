"""PDMX の JSON（MusicRender 形式）から単旋律を取り出す。

PDMX は MusicXML そのものではなく、MuSPy を拡張した独自の JSON で
配布されている。幸い **`pitch_str` に音名が入っている**ので、
MIDI 番号と合わせれば綴り（step + alter + octave）を復元できる。
これが無ければ Di と Ra を区別できず、このアプリには使えなかった。

music21 は通さない。この形式を読めないのと、通す意味も無いため
（必要な情報は JSON に平坦に入っている）。中間 JSON の形は
Mutopia 経路と同じなので、以降の検証と変換は共通のまま。
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path

from extract import Extracted, Unsupported

STEP_INDEX = {name: i for i, name in enumerate("CDEFGAB")}
STEP_SEMITONES = [0, 2, 4, 5, 7, 9, 11]

# 長短の判定に使う音程。extract.py と同じ考え方
_MODE_HINTS = [
    (3, "minor"), (4, "major"),
    (8, "minor"), (9, "major"),
    (10, "minor"), (11, "major"),
]

# 繰り返しを示す小節線。譜面と音がずれないよう、走査で扱える形に写す
_REPEAT_SUBTYPES = {
    "start-repeat": "repeat-start",
    "startrepeat": "repeat-start",
    "end-repeat": "repeat-end",
    "endrepeat": "repeat-end",
    "end-start-repeat": "repeat-both",
}
_PLAIN_SUBTYPES = {
    "single": "normal",
    "double": "double",
    "end": "final",
    "final": "final",
    "": "normal",
}


@dataclass
class ParsedNote:
    step: int
    alter: int
    octave: int
    ql: float
    measure: int
    start: int
    end: int


def _spell(pitch_str: str, midi: int) -> tuple[int, int, int]:
    """音名と MIDI 番号から step / alter / octave を復元する。

    `pitch_str` は "C" や "F#"、"Bb" のような綴り。オクターブは
    書かれていないので、MIDI 番号との差から逆算する。
    """
    m = re.match(r"^([A-Ga-g])([#b♯♭x]*)$", pitch_str.strip())
    if not m:
        raise Unsupported(f"音名として解釈できない pitch_str: {pitch_str!r}")

    step = STEP_INDEX[m.group(1).upper()]
    marks = m.group(2).replace("♯", "#").replace("♭", "b")
    alter = marks.count("#") + 2 * marks.count("x") - marks.count("b")

    natural = midi - alter
    octave, rem = divmod(natural - STEP_SEMITONES[step], 12)
    if rem != 0:
        # 綴りと MIDI 番号が食い違う。信用できないので弾く
        raise Unsupported(f"綴りと音高が矛盾する: {pitch_str} / MIDI {midi}")
    return step, alter, octave - 1


def _guess_key(notes: list[ParsedNote]) -> tuple[int, str, int | None]:
    """最終音を主音とし、その上の音程で長短を決める（Mutopia 経路と同じ）"""
    last = notes[-1]
    tonic_midi = (last.octave + 1) * 12 + STEP_SEMITONES[last.step] + last.alter
    tonic_pc = tonic_midi % 12
    pcs = {
        ((n.octave + 1) * 12 + STEP_SEMITONES[n.step] + n.alter) % 12 for n in notes
    }
    for interval, mode in _MODE_HINTS:
        if (tonic_pc + interval) % 12 in pcs:
            return tonic_midi, mode, interval
    return tonic_midi, "major", None


def extract_pdmx(
    path: Path, source: str, license_name: str, source_url: str | None, title: str | None = None
) -> Extracted:
    doc = json.loads(path.read_text(encoding="utf-8"))

    resolution = int(doc.get("resolution") or 0)
    if resolution <= 0:
        raise Unsupported("resolution が無い")

    time_sigs = doc.get("time_signatures") or []
    if not time_sigs:
        raise Unsupported("拍子記号が無い")
    ratios = {(t["numerator"], t["denominator"]) for t in time_sigs}
    if len(ratios) > 1:
        raise Unsupported(f"拍子が曲の途中で変わる: {sorted(ratios)}")
    meter = {"num": int(time_sigs[0]["numerator"]), "den": int(time_sigs[0]["denominator"])}

    tracks = doc.get("tracks") or []
    if len(tracks) != 1:
        raise Unsupported(f"トラックが {len(tracks)} 個ある（単旋律のみ対応）")
    track = tracks[0]
    if track.get("is_drum"):
        raise Unsupported("打楽器トラック")

    raw_notes = sorted(track.get("notes") or [], key=lambda n: (n["time"], -n["duration"]))
    if not raw_notes:
        raise Unsupported("音符が無い")

    notes: list[ParsedNote] = []
    for n in raw_notes:
        if n.get("is_grace"):
            raise Unsupported("装飾音を含む")
        duration = int(n.get("duration") or 0)
        if duration <= 0:
            raise Unsupported("音価 0 の音符を含む")
        step, alter, octave = _spell(str(n.get("pitch_str") or ""), int(n["pitch"]))
        start = int(n["time"])
        notes.append(
            ParsedNote(
                step=step,
                alter=alter,
                octave=octave,
                ql=duration / resolution,
                measure=int(n.get("measure") or 1),
                start=start,
                end=start + duration,
            )
        )

    # 同時に鳴る音があれば単旋律ではない。トラックが1つでも和音は入りうる
    for prev, cur in zip(notes, notes[1:]):
        if cur.start < prev.end:
            raise Unsupported("同時に鳴る音がある（単旋律のみ対応）")

    # 小節線。繰り返しがあれば走査で扱える形に写す
    bar_kind_at: dict[int, str] = {}
    for b in doc.get("barlines") or []:
        subtype = str(b.get("subtype") or "").lower()
        if subtype in _REPEAT_SUBTYPES:
            bar_kind_at[int(b["measure"])] = _REPEAT_SUBTYPES[subtype]
        elif subtype not in _PLAIN_SUBTYPES:
            raise Unsupported(f"未知の小節線: {subtype}")

    elements: list[dict] = []
    pickup_bars = 1 if notes[0].measure == 0 else 0
    previous_measure = notes[0].measure
    cursor = notes[0].start

    for note in notes:
        if note.measure != previous_measure:
            # 小節が変わったところに小節線を置く。繰り返しの開始は線の後ろ
            kind = bar_kind_at.get(previous_measure)
            if kind == "repeat-start":
                elements.append({"kind": "bar", "type": "normal"})
                elements.append({"kind": "bar", "type": "repeat-start"})
            else:
                elements.append({"kind": "bar", "type": kind or "normal"})
            previous_measure = note.measure

        # 音の隙間は休符にする。PDMX は休符を持たず、時刻で表現している
        gap = note.start - cursor
        if gap > 0:
            elements.append({"kind": "rest", "ql": gap / resolution})

        elements.append(
            {
                "kind": "note",
                "step": note.step,
                "alter": note.alter,
                "octave": note.octave,
                "ql": note.ql,
                "tie": None,
            }
        )
        cursor = note.end

    elements.append({"kind": "bar", "type": "final"})

    tonic_midi, mode, decided_by = _guess_key(notes)

    return Extracted(
        id=path.stem.lower(),
        title=title or path.stem,
        meter=meter,
        tonicMidi=tonic_midi,
        mode=mode,
        baseBpm=96,
        elements=elements,
        chords=[],
        provenance={
            "source": source,
            "sourceId": path.stem,
            "sourceUrl": source_url,
            "license": license_name,
            # pitch_str が綴りを保持しているので、推定ではない
            "spellingInferred": False,
            "keyConfidence": None,
            "keyDecidedBy": decided_by,
            "keyAgreesWithAnalysis": False,
            "skylineUsed": False,
            "chordsFromSource": False,
        },
    )
