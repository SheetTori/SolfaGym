import {
  analyzeSolfa,
  hasRepeats,
  parseAbc,
  resolveChordBeats,
  type ParsedSong,
} from './abc'
import { computeLevel } from './level'
import { toMidi } from './pitch'
import type { Song, SongIndexEntry } from './schema'
import type { Key, SolfaToken } from './solfa'
import { spellTonic } from './transpose'

/**
 * 曲データ（JSON）から、アプリが必要とするものを一度に導出する。
 * レベルも階名も音域も、ここで曲データから計算する — 手で持たせない。
 */
export interface AnalyzedSong {
  meta: Song
  parsed: ParsedSong
  /** 原調。階名の基準になる */
  originalKey: Key
  tokens: SolfaToken[]
  /** 発音する音符と同じ並び */
  syllables: string[]
  /** 出現順・重複なし */
  distinctSyllables: string[]
  level: number
  minMidi: number
  maxMidi: number
}

export function analyzeSong(meta: Song): AnalyzedSong {
  const parsed = parseAbc(meta.abc)
  const originalKey: Key = { tonic: spellTonic(meta.tonicMidi, meta.mode), mode: meta.mode }
  const { tokens, syllables } = analyzeSolfa(parsed, originalKey)

  const distinct: string[] = []
  for (const s of syllables) if (!distinct.includes(s)) distinct.push(s)

  // 再生は繰り返しを展開しないので、譜面と音がずれる前にここで弾く
  if (hasRepeats(parsed)) {
    throw new Error('繰り返し記号は未対応。小節を書き下すこと')
  }

  // 和音の位置が曲の中に収まっているかをここで確かめる
  resolveChordBeats(parsed, meta.chords)

  return {
    meta,
    parsed,
    originalKey,
    tokens,
    syllables,
    distinctSyllables: distinct,
    level: computeLevel(tokens, meta.mode),
    minMidi: parsed.minMidi,
    maxMidi: parsed.maxMidi,
  }
}

export function toIndexEntry(a: AnalyzedSong): SongIndexEntry {
  return {
    id: a.meta.id,
    title: a.meta.title,
    titleEn: a.meta.titleEn,
    source: a.meta.source,
    mode: a.meta.mode,
    unit: a.meta.unit,
    level: a.level,
    syllables: a.distinctSyllables,
  }
}

/**
 * ABC が宣言している調と、JSON の tonicMidi が食い違っていないか。
 * データ検証専用 — 食い違うと階名が丸ごとずれるため、必ず検査する。
 */
export function tonicMatchesAbcKey(meta: Song): boolean {
  const declared = /^K:\s*([A-G][#b]?)(m?)/m.exec(meta.abc)
  if (!declared) return false
  const expected = spellTonic(meta.tonicMidi, meta.mode)
  const acc = expected.alter > 0 ? '#'.repeat(expected.alter) : 'b'.repeat(-expected.alter)
  const expectedName = ['C', 'D', 'E', 'F', 'G', 'A', 'B'][expected.step] + acc
  const expectedMinor = meta.mode === 'minor'
  return declared[1] === expectedName && (declared[2] === 'm') === expectedMinor
}

/** 旋律の音域が tonicMidi の周辺にあるか（オクターブ指定ミスの検出） */
export function tonicOctaveLooksRight(a: AnalyzedSong): boolean {
  return toMidi(a.originalKey.tonic) >= a.minMidi - 12 && toMidi(a.originalKey.tonic) <= a.maxMidi
}
