import { STEP_SEMITONES, diatonicIndex, toMidi, type Pitch, type Step } from './pitch'
import type { Key, Mode } from './solfa'

/**
 * 全音階上の歩数と半音数を指定して移調する。
 *
 * 半音数だけでは綴りが決まらない（増二度と短三度は同じ3半音）ため、
 * 音名を何文字ずらすかを別に受け取る。これで階名が保存される。
 */
export function transposePitch(p: Pitch, diatonicSteps: number, semitones: number): Pitch {
  const absDiatonic = diatonicIndex(p) + diatonicSteps
  const octave = Math.floor(absDiatonic / 7)
  const step = (absDiatonic - octave * 7) as Step
  const naturalMidi = (octave + 1) * 12 + STEP_SEMITONES[step]
  return { step, alter: toMidi(p) + semitones - naturalMidi, octave }
}

/** 主音 from → to の移調を、任意の音高に適用する関数を作る */
export function transposerBetween(from: Pitch, to: Pitch): (p: Pitch) => Pitch {
  const steps = diatonicIndex(to) - diatonicIndex(from)
  const semitones = toMidi(to) - toMidi(from)
  return (p) => transposePitch(p, steps, semitones)
}

/**
 * 各音高クラスに対する実用的な主音の綴り。
 * 調号が7つを超える綴り（Cb 長調など）を避けるための表。
 */
const MAJOR_TONIC_SPELLING: ReadonlyArray<[Step, number]> = [
  [0, 0], [1, -1], [1, 0], [2, -1], [2, 0], [3, 0],
  [3, 1], [4, 0], [5, -1], [5, 0], [6, -1], [6, 0],
]
// 短調は la 基準。ここでの主音は「la」にあたる音。
const MINOR_TONIC_SPELLING: ReadonlyArray<[Step, number]> = [
  [0, 0], [0, 1], [1, 0], [2, -1], [2, 0], [3, 0],
  [3, 1], [4, 0], [4, 1], [5, 0], [6, -1], [6, 0],
]

export function spellTonic(midi: number, mode: Mode): Pitch {
  const pc = ((midi % 12) + 12) % 12
  const [step, alter] = (mode === 'major' ? MAJOR_TONIC_SPELLING : MINOR_TONIC_SPELLING)[pc]
  const octave = (midi - alter - STEP_SEMITONES[step]) / 12 - 1
  return { step, alter, octave }
}

export interface VocalRange {
  lowMidi: number
  highMidi: number
}

/** A3–E5 / A2–E4。無理なく地声で出せる範囲に寄せてある。 */
export const VOCAL_PRESETS = {
  female: { lowMidi: 57, highMidi: 76 },
  male: { lowMidi: 45, highMidi: 64 },
} as const satisfies Record<string, VocalRange>

export interface KeyChoice {
  key: Key
  /** 原調から何半音ずらしたか */
  semitoneShift: number
}

export interface KeyCandidateInput {
  /** 原調の主音（長調なら do、短調なら la）の MIDI */
  tonicMidi: number
  mode: Mode
  /** 旋律の最低音・最高音（原調での MIDI） */
  minMidi: number
  maxMidi: number
  range: VocalRange
}

/**
 * 旋律全体が音域に収まる移調をすべて挙げる。
 * ±12 半音まで見れば 12 個の音高クラスをすべて網羅できる。
 */
export function candidateKeys(input: KeyCandidateInput): KeyChoice[] {
  const { tonicMidi, mode, minMidi, maxMidi, range } = input
  const out: KeyChoice[] = []
  const seen = new Set<number>()
  for (let shift = -12; shift <= 12; shift++) {
    if (minMidi + shift < range.lowMidi) continue
    if (maxMidi + shift > range.highMidi) continue
    const pc = (((tonicMidi + shift) % 12) + 12) % 12
    if (seen.has(pc)) continue
    seen.add(pc)
    out.push({ key: { tonic: spellTonic(tonicMidi + shift, mode), mode }, semitoneShift: shift })
  }
  return out
}

/** どの移調でも収まらない曲のための、はみ出し量が最小の移調 */
function leastOverflowKey(input: KeyCandidateInput): KeyChoice {
  const { tonicMidi, mode, minMidi, maxMidi, range } = input
  let best: KeyChoice | null = null
  let bestCost = Infinity
  for (let shift = -12; shift <= 12; shift++) {
    const below = Math.max(0, range.lowMidi - (minMidi + shift))
    const above = Math.max(0, maxMidi + shift - range.highMidi)
    const cost = below + above
    if (cost < bestCost) {
      bestCost = cost
      best = { key: { tonic: spellTonic(tonicMidi + shift, mode), mode }, semitoneShift: shift }
    }
  }
  return best!
}

export interface ChooseKeyResult extends KeyChoice {
  /** 音域に収まりきらなかった場合に true。UI で注意を出す */
  outOfRange: boolean
}

/**
 * 曲を開くたびに呼ぶ。音域に収まるキーから一様ランダムに選び、
 * 直前と同じキーは避ける（絶対音高の記憶が固定されるのを防ぐため）。
 */
export function chooseKey(
  input: KeyCandidateInput,
  previousShift: number | null = null,
  rng: () => number = Math.random,
): ChooseKeyResult {
  const candidates = candidateKeys(input)
  if (candidates.length === 0) {
    return { ...leastOverflowKey(input), outOfRange: true }
  }
  const pool =
    candidates.length > 1 && previousShift !== null
      ? candidates.filter((c) => c.semitoneShift !== previousShift)
      : candidates
  const picked = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))]
  return { ...picked, outOfRange: false }
}
