/**
 * 音高の表現。
 *
 * 移動ドの階名は「音高クラス」だけでは決まらない。Do# は Di、Re♭ は Ra と
 * 別の階名になるが、この2つは同じ音高クラス（1）である。したがって音名の
 * 文字（C D E F G A B）と変化記号を分けて保持する必要がある。
 */

/** 0=C, 1=D, 2=E, 3=F, 4=G, 5=A, 6=B */
export type Step = 0 | 1 | 2 | 3 | 4 | 5 | 6

export interface Pitch {
  step: Step
  /** シャープが正、フラットが負。ダブルシャープなら +2 */
  alter: number
  /** 科学的音高表記。C4 = 中央ハ = MIDI 60 */
  octave: number
}

/** 各音名の、Cからの半音数 */
export const STEP_SEMITONES: readonly number[] = [0, 2, 4, 5, 7, 9, 11]

export const STEP_LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const

export function toMidi(p: Pitch): number {
  return (p.octave + 1) * 12 + STEP_SEMITONES[p.step] + p.alter
}

/**
 * 全音階上の絶対位置。オクターブをまたぐ度数計算に使う。
 * C4 → 4*7 + 0 = 28
 */
export function diatonicIndex(p: Pitch): number {
  return p.octave * 7 + p.step
}

export function pitchName(p: Pitch): string {
  const accidental = p.alter > 0 ? '#'.repeat(p.alter) : 'b'.repeat(-p.alter)
  return `${STEP_LETTERS[p.step]}${accidental}${p.octave}`
}

/** "C4" "F#3" "Bb5" "Ebb2" 形式をパースする。主にテストとデータ記述用。 */
export function parsePitch(name: string): Pitch {
  const m = /^([A-G])(#{0,2}|b{0,2})(-?\d+)$/.exec(name)
  if (!m) throw new Error(`音高として解釈できない: ${name}`)
  const step = STEP_LETTERS.indexOf(m[1] as (typeof STEP_LETTERS)[number]) as Step
  const alter = m[2].startsWith('#') ? m[2].length : -m[2].length
  return { step, alter, octave: Number(m[3]) }
}

/**
 * MIDI ノート番号から Pitch を作る。異名同音は調号の方向で決める。
 * preferFlats が true なら黒鍵をフラットで綴る。
 */
export function fromMidi(midi: number, preferFlats = false): Pitch {
  const pc = ((midi % 12) + 12) % 12
  const octave = Math.floor(midi / 12) - 1
  const sharpSpelling: Array<[Step, number]> = [
    [0, 0], [0, 1], [1, 0], [1, 1], [2, 0], [3, 0],
    [3, 1], [4, 0], [4, 1], [5, 0], [5, 1], [6, 0],
  ]
  const flatSpelling: Array<[Step, number]> = [
    [0, 0], [1, -1], [1, 0], [2, -1], [2, 0], [3, 0],
    [4, -1], [4, 0], [5, -1], [5, 0], [6, -1], [6, 0],
  ]
  const [step, alter] = (preferFlats ? flatSpelling : sharpSpelling)[pc]
  return { step, alter, octave }
}
