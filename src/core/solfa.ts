import { STEP_SEMITONES, diatonicIndex, type Pitch } from './pitch'

export type Mode = 'major' | 'minor'

export interface Key {
  /** 主音。オクターブも含む — これが register 0 の基準になる */
  tonic: Pitch
  mode: Mode
}

export const NATURAL_SYLLABLES = ['do', 're', 'mi', 'fa', 'so', 'la', 'ti'] as const
export type NaturalSyllable = (typeof NATURAL_SYLLABLES)[number]

export const ALL_SYLLABLES = [
  'do', 'di', 'ra', 're', 'ri', 'ma', 'mi', 'fa',
  'fi', 'sa', 'so', 'si', 'lo', 'la', 'li', 'ta', 'ti',
] as const
export type Syllable = (typeof ALL_SYLLABLES)[number]

/**
 * 派生音の綴り。ユーザー指定の表そのまま。
 * ここに無い変化（Do♭, Mi#, Fa♭, Ti#）は意図的に未定義にしてあり、
 * 遭遇したら例外を投げる。該当する曲を追加する段階で表を広げる。
 */
const ALTERED: Record<NaturalSyllable, Partial<Record<-1 | 1, Syllable>>> = {
  do: { 1: 'di' },
  re: { 1: 'ri', [-1]: 'ra' },
  mi: { [-1]: 'ma' },
  fa: { 1: 'fi' },
  so: { 1: 'si', [-1]: 'sa' },
  la: { 1: 'li', [-1]: 'lo' },
  ti: { [-1]: 'ta' },
}

/** 長調は do 基準、短調は la 基準（コダーイ／英国式ソルファ） */
const DEGREE_SYLLABLES: Record<Mode, readonly NaturalSyllable[]> = {
  major: ['do', 're', 'mi', 'fa', 'so', 'la', 'ti'],
  minor: ['la', 'ti', 'do', 're', 'mi', 'fa', 'so'],
}

/** 各度数の、主音からの半音数 */
const DEGREE_SEMITONES: Record<Mode, readonly number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10], // 自然短音階
}

export interface SolfaToken {
  syllable: Syllable
  /**
   * 主音のオクターブを 0 とする段。下の so, la は -1、上の do は +1。
   * コダーイの「下方拡張」の段階判定に使う。
   */
  register: number
}

export function tokenKey(t: SolfaToken): string {
  return `${t.syllable}${t.register}`
}

/**
 * 音高と調から移動ドの階名を求める。
 *
 * 手順:
 *  1. 音名の文字どうしの差から全音階上の度数を出す（オクターブ込み）
 *  2. その度数の基本階名を引く
 *  3. 「その度数が本来あるべき半音数」と実際の半音数の差を変化量とする
 *  4. 変化量に応じて派生表を引く
 *
 * 移調しても階名は変わらない。これが移動ドの定義そのものであり、
 * テストで不変条件として押さえてある。
 */
export function solfaOf(pitch: Pitch, key: Key): SolfaToken {
  const relative = diatonicIndex(pitch) - diatonicIndex(key.tonic)
  const degree = ((relative % 7) + 7) % 7
  const register = Math.floor(relative / 7)

  const natural = DEGREE_SYLLABLES[key.mode][degree]
  const expected = DEGREE_SEMITONES[key.mode][degree]

  const tonicSemitone = STEP_SEMITONES[key.tonic.step] + key.tonic.alter
  const pitchSemitone = STEP_SEMITONES[pitch.step] + pitch.alter
  const actual = (((pitchSemitone - tonicSemitone) % 12) + 12) % 12

  let alteration = actual - expected
  if (alteration > 6) alteration -= 12
  if (alteration < -6) alteration += 12

  if (alteration === 0) return { syllable: natural, register }

  if (alteration === 1 || alteration === -1) {
    const altered = ALTERED[natural][alteration]
    if (altered) return { syllable: altered, register }
  }

  throw new Error(
    `階名表に無い変化: ${natural} の ${alteration > 0 ? '+' : ''}${alteration}` +
      `（${key.mode} の主音から見て）。派生音の表を拡張する必要がある。`,
  )
}

export function isNatural(s: Syllable): s is NaturalSyllable {
  return (NATURAL_SYLLABLES as readonly string[]).includes(s)
}
