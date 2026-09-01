import { beatsPerBar, countInBeatsFor, noteEvents, resolveChordBeats, type ParsedSong } from './abc'
import { chordMidi, tonicChordMidi } from './chords'
import type { ChordEvent } from './schema'
import type { Key, Mode } from './solfa'
import { toMidi } from './pitch'

/**
 * 再生の「いつ・どの音を」を決める部分。Tone.js に触れない純粋関数なので、
 * 拍の計算・カウントインの位置・和音の長さをテストで固定できる。
 *
 * 音を出す層（audio/engine.ts）は、ここで出た拍をティックに直して
 * Tone に渡すだけの薄い層に留める。
 */

export interface PlannedNote {
  /** 発音する音符の通し番号。カーソルの対応づけに使う */
  index: number
  midi: number
  /** カウントインを含めた、曲頭からの拍位置 */
  startBeat: number
  durationBeats: number
}

export interface PlannedChord {
  midis: number[]
  startBeat: number
  durationBeats: number
}

export interface PlaybackPlan {
  countInBeats: number
  beatsPerBar: number
  melody: PlannedNote[]
  accompaniment: PlannedChord[]
  /** 最後の音が鳴り終わる拍。再生終了の判定に使う */
  endBeat: number
}

export interface PlanInput {
  song: ParsedSong
  originalKey: Key
  targetKey: Key
  mode: Mode
  chords: readonly ChordEvent[]
}

export function buildPlaybackPlan(input: PlanInput): PlaybackPlan {
  const { song, originalKey, targetKey, mode, chords } = input
  const perBar = beatsPerBar(song)
  const countIn = countInBeatsFor(song)
  const tonicMidi = toMidi(targetKey.tonic)

  const melody: PlannedNote[] = noteEvents(song, originalKey, targetKey).map((n) => ({
    index: n.index,
    midi: n.midi,
    startBeat: n.timeBeats + countIn,
    durationBeats: n.durationBeats,
  }))

  const musicEnd = melody.reduce((max, n) => Math.max(max, n.startBeat + n.durationBeats), countIn)

  const accompaniment = chords.length
    ? planChords(song, chords, tonicMidi, mode, countIn, musicEnd)
    : // 和音を持たない曲は主音のドローンで支える
      [
        {
          midis: [tonicMidi - 12, tonicMidi],
          startBeat: countIn,
          durationBeats: Math.max(1, musicEnd - countIn),
        },
      ]

  return { countInBeats: countIn, beatsPerBar: perBar, melody, accompaniment, endBeat: musicEnd }
}

function planChords(
  song: ParsedSong,
  chords: readonly ChordEvent[],
  tonicMidi: number,
  mode: Mode,
  countIn: number,
  musicEnd: number,
): PlannedChord[] {
  const resolved = resolveChordBeats(song, chords)
    .map((c) => ({ ...c, startBeat: c.timeBeats + countIn }))
    .sort((a, b) => a.startBeat - b.startBeat)

  return resolved.map((c, i) => ({
    midis: chordMidi(c.degree, tonicMidi, mode),
    startBeat: c.startBeat,
    // 次の和音まで伸ばす。最後の和音は曲の終わりまで
    durationBeats: Math.max(0.25, (resolved[i + 1]?.startBeat ?? musicEnd) - c.startBeat),
  }))
}

export interface TonicCueEvent {
  midis: number[]
  startBeat: number
  durationBeats: number
}

/**
 * Step 0 の調の提示。
 *
 * まず主和音を **アルペジオで1音ずつ**（長調なら do-mi-so、短調なら
 * la-do-mi）鳴らして各音の高さを聞かせ、**1拍おいてから三音を同時に**
 * 鳴らして和音として響かせる。分解して聞かせてから重ねることで、
 * 調のセンターが音程としても響きとしても掴める。
 */
export function buildTonicCue(tonicMidi: number, mode: Mode): TonicCueEvent[] {
  const chord = tonicChordMidi(tonicMidi, mode)
  const arpeggio = chord.map((midi, i) => ({
    midis: [midi],
    startBeat: i,
    // 次の音との間に僅かな切れ目を作る
    durationBeats: 0.9,
  }))
  return [
    ...arpeggio,
    // アルペジオの最後の音が終わる拍のさらに1拍後
    { midis: chord, startBeat: chord.length + 1, durationBeats: 2 },
  ]
}

/** 調の提示が鳴り終わるまでの拍数 */
export function tonicCueLengthBeats(cue: readonly TonicCueEvent[]): number {
  return cue.reduce((max, e) => Math.max(max, e.startBeat + e.durationBeats), 0)
}

/**
 * その拍が小節頭か。
 *
 * `countInBeatsFor()` が、弱起があっても曲の小節線が絶対拍の
 * beatsPerBar の倍数に乗るようカウントインを決めているので、
 * カウントイン中も本編中もこの1つの式で済む。
 */
export function isDownbeat(beat: number, beatsPerBar: number): boolean {
  return beat % beatsPerBar === 0
}
