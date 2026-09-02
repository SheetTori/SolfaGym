import {
  analyzeSolfa,
  barOccurrences,
  hasVoltas,
  resolveChordBeats,
  soundingNotes,
  traversalOrder,
  type ParsedSong,
} from './abc'
import { importedKey, toParsedSong, type ImportedSong } from './abcSource'
import { chordMidi } from './chords'
import { toMidi } from './pitch'
import { VOCAL_PRESETS, candidateKeys } from './transpose'

/**
 * 取り込んだ曲を機械的に検品する。
 *
 * 数百曲を全数目視するのは現実的でないので、**弾いた理由を必ず言語化して**
 * レポートに残す。人が見るのは弾かれたものと抜き取りだけ。
 *
 * 判断はすべてここに集めて純粋関数にしてある。取り込み元が増えても
 * 検品の基準は 1 か所で済む。
 */

export interface ValidationIssue {
  code: string
  message: string
}

export interface ValidationResult {
  ok: boolean
  issues: ValidationIssue[]
  /** 通ったときだけ埋まる。レポートに出す */
  stats?: {
    bars: number
    notes: number
    rangeSemitones: number
    /** 歌える声域プリセット */
    singableBy: string[]
    leapRatio: number
    syllables: string[]
  }
}

export interface ValidationLimits {
  minBars: number
  maxBars: number
  /** 6度以上の跳躍が全音程に占める割合の上限 */
  maxLeapRatio: number
  /** 跳躍とみなす下限（半音）。9 = 長6度 */
  leapSemitones: number
  /** 調推定の確信度の下限。null は検査しない */
  minKeyConfidence: number | null
}

export const DEFAULT_LIMITS: ValidationLimits = {
  minBars: 8,
  maxBars: 64,
  maxLeapRatio: 0.3,
  leapSemitones: 9,
  minKeyConfidence: null,
}

export function validateImported(
  imported: ImportedSong,
  limits: ValidationLimits = DEFAULT_LIMITS,
): ValidationResult {
  const issues: ValidationIssue[] = []
  const add = (code: string, message: string) => issues.push({ code, message })

  let parsed: ParsedSong
  try {
    parsed = toParsedSong(imported)
  } catch (e) {
    return { ok: false, issues: [{ code: 'parse', message: (e as Error).message }] }
  }

  // --- 出典そのものの信頼性 ---
  const prov = imported.provenance
  if (prov.spellingInferred) {
    // MIDI 由来などで綴りが推定になっていると、Di と Ra が入れ替わりうる
    add('spelling-inferred', '音名の綴りが推定されている（出典が綴りを持っていない）')
  }
  if (prov.skylineUsed) {
    add('skyline', '多声を潰して旋律を取り出している（旋律が正しい保証がない）')
  }

  // --- 記譜の対応範囲 ---
  if (hasVoltas(parsed)) {
    add('volta', 'ヴォルタ（1番/2番括弧）を含む')
  }

  // --- 規模 ---
  const bars = new Set(barOccurrences(parsed).map((o) => o.bar)).size
  if (bars < limits.minBars) add('too-short', `${bars} 小節（下限 ${limits.minBars}）`)
  if (bars > limits.maxBars) add('too-long', `${bars} 小節（上限 ${limits.maxBars}）`)

  const notes = soundingNotes(parsed)
  if (notes.length < 4) add('too-few-notes', `発音する音符が ${notes.length} 個`)

  // --- 歌えるか ---
  // 固定の上限を置くのではなく、**実際の声域プリセットに収まるか**を見る。
  // 上限を声域より広く取ると「検証は通ったのに歌えるキーが1つも無い」曲が出る。
  const range = parsed.maxMidi - parsed.minMidi
  const fits = Object.entries(VOCAL_PRESETS).filter(
    ([, preset]) =>
      candidateKeys({
        tonicMidi: imported.tonicMidi,
        mode: imported.mode,
        minMidi: parsed.minMidi,
        maxMidi: parsed.maxMidi,
        range: preset,
      }).length > 0,
  )
  if (fits.length === 0) {
    const widest = Math.max(...Object.values(VOCAL_PRESETS).map((p) => p.highMidi - p.lowMidi))
    add('range', `音域が ${range} 半音で、どの声域プリセット（最大 ${widest} 半音）にも収まらない`)
  }

  const midis = notes.map((n) => toMidi(n.pitch!))
  let leaps = 0
  for (let i = 1; i < midis.length; i++) {
    if (Math.abs(midis[i] - midis[i - 1]) >= limits.leapSemitones) leaps++
  }
  const leapRatio = midis.length > 1 ? leaps / (midis.length - 1) : 0
  if (leapRatio > limits.maxLeapRatio) {
    add('leaps', `6度以上の跳躍が ${(leapRatio * 100).toFixed(0)}%（上限 ${limits.maxLeapRatio * 100}%）`)
  }

  // --- 調と階名 ---
  const key = importedKey(imported)
  const lastMidi = midis[midis.length - 1]
  if (((lastMidi - imported.tonicMidi) % 12 + 12) % 12 !== 0) {
    // 最終音を主音とする方式なので、ここがずれるのは抽出のバグ
    add('tonic-mismatch', '最終音が主音と一致しない')
  }
  if (
    limits.minKeyConfidence !== null &&
    prov.keyConfidence !== null &&
    prov.keyConfidence < limits.minKeyConfidence
  ) {
    add('key-confidence', `調推定の確信度が ${prov.keyConfidence?.toFixed(2)}`)
  }

  let syllables: string[] = []
  try {
    syllables = analyzeSolfa(parsed, key).syllables
  } catch (e) {
    // 階名表に無い変化（Do♭, Mi#, Fa♭, Ti#）を含む
    add('solfa', (e as Error).message)
  }

  // --- 伴奏 ---
  if (imported.chords.length > 0) {
    try {
      const traversal = traversalOrder(parsed)
      for (const c of resolveChordBeats(parsed, imported.chords, traversal)) {
        chordMidi(c.degree, imported.tonicMidi, imported.mode)
      }
    } catch (e) {
      add('chords', (e as Error).message)
    }
  }

  if (issues.length > 0) return { ok: false, issues }

  return {
    ok: true,
    issues: [],
    stats: {
      bars,
      notes: notes.length,
      rangeSemitones: range,
      singableBy: fits.map(([name]) => name),
      leapRatio: Number(leapRatio.toFixed(3)),
      syllables: [...new Set(syllables)],
    },
  }
}
