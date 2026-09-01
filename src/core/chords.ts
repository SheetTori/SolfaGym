import type { Mode } from './solfa'

/**
 * 伴奏和音は度数表記（ローマ数字）で持つ。音名で持たないのは、
 * 曲を任意のキーに移調するため — 度数なら移調がそのまま効く。
 */

const NUMERALS: Record<string, number> = {
  i: 0, ii: 1, iii: 2, iv: 3, v: 4, vi: 5, vii: 6,
}

/** 主音から各度数の根音までの半音数 */
const DEGREE_SEMITONES: Record<Mode, readonly number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10], // 自然短音階（la 基準）
}

const TRIADS = {
  major: [0, 4, 7],
  minor: [0, 3, 7],
  diminished: [0, 3, 6],
  augmented: [0, 4, 8],
} as const

export interface ChordSpec {
  /** 主音から根音までの半音数 */
  rootSemitone: number
  /** 根音を 0 とした構成音 */
  intervals: number[]
}

/**
 * "I" "IV" "V7" "vi" "vii°" "bVII" "V/V" 以外の複雑な表記は扱わない。
 * 大文字＝長三和音、小文字＝短三和音。接尾辞で 7 度や減・増を付ける。
 */
export function parseDegree(degree: string, mode: Mode): ChordSpec {
  const m = /^([b#]?)([ivIV]+)(.*)$/.exec(degree.trim())
  if (!m) throw new Error(`和音の度数として解釈できない: ${degree}`)

  const [, accidental, numeral, suffix] = m
  const index = NUMERALS[numeral.toLowerCase()]
  if (index === undefined) throw new Error(`不明なローマ数字: ${degree}`)

  const isMinorNumeral = numeral === numeral.toLowerCase()
  const chromatic = accidental === 'b' ? -1 : accidental === '#' ? 1 : 0
  const rootSemitone = DEGREE_SEMITONES[mode][index] + chromatic

  let intervals: number[]
  if (suffix.startsWith('°') || suffix.startsWith('dim')) {
    intervals = [...TRIADS.diminished]
  } else if (suffix.startsWith('+') || suffix.startsWith('aug')) {
    intervals = [...TRIADS.augmented]
  } else {
    intervals = [...(isMinorNumeral ? TRIADS.minor : TRIADS.major)]
  }

  if (/maj7/.test(suffix)) intervals.push(11)
  else if (/°7/.test(suffix)) intervals.push(9)
  else if (/ø7/.test(suffix)) intervals.push(10)
  else if (/7/.test(suffix)) intervals.push(isMinorNumeral ? 10 : 10)
  if (/6/.test(suffix) && !/7/.test(suffix)) intervals.push(9)

  return { rootSemitone, intervals }
}

/** 伴奏を置く音域。低すぎると濁り、高すぎると旋律と混ざる。 */
const ACCOMPANIMENT_LOW = 48 // C3
const ACCOMPANIMENT_HIGH = 60 // C4

/**
 * 度数表記を実際の MIDI ノート列にする。
 * 根音が伴奏音域に収まるようオクターブを畳む。
 */
export function chordMidi(degree: string, tonicMidi: number, mode: Mode): number[] {
  const { rootSemitone, intervals } = parseDegree(degree, mode)
  let root = tonicMidi + rootSemitone
  while (root >= ACCOMPANIMENT_HIGH) root -= 12
  while (root < ACCOMPANIMENT_LOW) root += 12
  return intervals.map((i) => root + i)
}

/** 主和音（長調 I / 短調 i）。Step 0 で調のセンターを示すのに使う。 */
export function tonicChordMidi(tonicMidi: number, mode: Mode): number[] {
  return chordMidi(mode === 'major' ? 'I' : 'i', tonicMidi, mode)
}
