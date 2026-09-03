import { z } from 'zod'
import { renderAbcSource, type ParsedElement, type ParsedSong } from './abc'
import { toMidi, type Pitch, type Step } from './pitch'
import { modeSchema, provenanceSchema } from './schema'
import type { Key } from './solfa'
import { spellTonic } from './transpose'

/**
 * 外部コーパスから取り込んだ音符列を、アプリが扱う形（ABC 文字列）に変換する。
 *
 * ABC のエミッタを新しく書かない。取り込んだ音符列から `ParsedSong` を組み立て、
 * 既存の `renderAbcSource()` に渡す。こうすると「アプリが出力する ABC」の実装が
 * 1つに保たれ、`parseAbc()` との往復テストがそのまま取り込みの検証になる。
 *
 * Python 側（music21）はここで定義した JSON を出すところまでを担当し、
 * ABC 文字列の生成には関与しない。
 */

/** music21 の quarterLength をそのまま受ける（4分音符 = 1.0） */
const quarterLength = z.number().positive().max(64)

export const importedNoteSchema = z.object({
  kind: z.literal('note'),
  /** 0=C, 1=D, ... 6=B */
  step: z.number().int().min(0).max(6),
  alter: z.number().int().min(-2).max(2),
  octave: z.number().int().min(-1).max(9),
  ql: quarterLength,
  /** タイの種類。music21 の `note.tie.type` に対応 */
  tie: z.enum(['start', 'stop', 'continue']).nullable().default(null),
})

export const importedRestSchema = z.object({
  kind: z.literal('rest'),
  ql: quarterLength,
})

export const importedBarSchema = z.object({
  kind: z.literal('bar'),
  type: z.enum(['normal', 'double', 'final', 'repeat-start', 'repeat-end', 'repeat-both']),
})

export const importedElementSchema = z.discriminatedUnion('kind', [
  importedNoteSchema,
  importedRestSchema,
  importedBarSchema,
])

export const importedSongSchema = z.object({
  /** 出典側の命名をそのまま受ける。曲データの id への正規化は変換側の仕事 */
  id: z.string().min(1),
  title: z.string().min(1),
  titleEn: z.string().nullish(),
  language: z.string().length(2).nullish(),
  meter: z.object({ num: z.number().int().positive(), den: z.number().int().positive() }),
  /** 原調の主音の MIDI。長調なら do、短調なら la */
  tonicMidi: z.number().int().min(21).max(108),
  mode: modeSchema,
  baseBpm: z.number().min(30).max(240).default(96),
  elements: z.array(importedElementSchema).min(1),
  chords: z
    .array(z.object({ bar: z.number().int().min(0), beat: z.number().min(0), degree: z.string() }))
    .default([]),
  provenance: provenanceSchema,
})

export type ImportedSong = z.infer<typeof importedSongSchema>
export type ImportedElement = z.infer<typeof importedElementSchema>

/**
 * 曲末の休符と空小節を落とす。
 *
 * 出典によっては最後に空の小節が付いており、そのまま取り込むと毎回
 * 数拍の無音が入って再生の終わりが間延びする。ただし `:|` で終わる曲の
 * 繰り返し記号は落とさない（落とすと繰り返しが消える）。
 */
export function trimTrailingSilence(elements: readonly ImportedElement[]): ImportedElement[] {
  const droppable = new Set(['normal', 'double', 'final'])
  const trimmed = [...elements]

  while (trimmed.length > 0) {
    const last = trimmed[trimmed.length - 1]
    if (last.kind === 'rest' || (last.kind === 'bar' && droppable.has(last.type))) {
      trimmed.pop()
      continue
    }
    break
  }

  // 音符で終わっていたら終止線で閉じる。`:|` で終わる曲はそのまま
  const last = trimmed[trimmed.length - 1]
  if (!last || last.kind !== 'bar') {
    trimmed.push({ kind: 'bar', type: 'final' })
  }
  return trimmed
}

/** 取り込んだ音符列 → アプリ内部の解析済み表現 */
export function toParsedSong(imported: ImportedSong): ParsedSong {
  const elements: ParsedElement[] = []
  let time = 0
  let soundingIndex = 0
  let minMidi = Infinity
  let maxMidi = -Infinity

  for (const el of imported.elements) {
    if (el.kind === 'bar') {
      elements.push({ kind: 'bar', type: BAR_TYPES[el.type] })
      continue
    }

    // music21 の quarterLength は4分音符が 1.0。こちらは全音符が 1.0
    const duration = el.ql / 4

    if (el.kind === 'rest') {
      elements.push({
        kind: 'rest',
        duration,
        time,
        startTie: false,
        endTie: false,
        soundingIndex: null,
      })
      time += duration
      continue
    }

    const pitch: Pitch = { step: el.step as Step, alter: el.alter, octave: el.octave }
    const midi = toMidi(pitch)
    minMidi = Math.min(minMidi, midi)
    maxMidi = Math.max(maxMidi, midi)

    // タイの継続と終端は「鳴り始める音」ではないので通し番号を与えない
    const endTie = el.tie === 'stop' || el.tie === 'continue'
    elements.push({
      kind: 'note',
      pitch,
      duration,
      time,
      startTie: el.tie === 'start' || el.tie === 'continue',
      endTie,
      soundingIndex: endTie ? null : soundingIndex++,
    })
    time += duration
  }

  if (!Number.isFinite(minMidi)) throw new Error('音符が1つも無い')

  return {
    meter: imported.meter,
    elements,
    soundingCount: soundingIndex,
    minMidi,
    maxMidi,
    totalDuration: time,
  }
}

/** 取り込んだ曲の原調 */
export function importedKey(imported: ImportedSong): Key {
  return { tonic: spellTonic(imported.tonicMidi, imported.mode), mode: imported.mode }
}

/**
 * 曲データ JSON に入れる ABC 文字列を作る。
 *
 * 階名は入れない（表示のたびにキーを変えて描き直すため、正本には持たせない）。
 */
export function emitAbc(imported: ImportedSong): string {
  const key = importedKey(imported)
  return renderAbcSource(toParsedSong(imported), {
    variant: 'pitch',
    originalKey: key,
    targetKey: key,
    syllables: null,
    barsPerLine: 4,
  })
}

/** 中間表現のバー種別 → abcjs のバー種別 */
const BAR_TYPES: Record<z.infer<typeof importedBarSchema>['type'], string> = {
  normal: 'bar_thin',
  double: 'bar_thin_thin',
  final: 'bar_thin_thick',
  'repeat-start': 'bar_left_repeat',
  'repeat-end': 'bar_right_repeat',
  'repeat-both': 'bar_dbl_repeat',
}

/** 4分音符を 1 としたときの 1 小節の長さ */
export function barQuarterLength(meter: { num: number; den: number }): number {
  return (4 * meter.num) / meter.den
}

/**
 * 小節線を拍子どおりに引き直す。引き直せなければ null。
 *
 * 実データには「3/4 の 1 小節が 2.0 + 1.0 に割れている」たぐいの楽譜が多い。
 * 小節長の最頻値は 96% の曲で拍子と一致しているので、**拍子が正しく
 * 小節線の位置だけが崩れている**とみなして引き直すのが実態に合う。
 * 放っておくと譜面の見た目が崩れ、小節を数える処理も狂う。
 *
 * ただし繰り返し記号は音楽的な意味を持つので**動かさない**。
 * 繰り返し記号が小節の途中に来る楽譜は、直しようがないので null を返す。
 * 音符をまたいで小節線を引く必要がある場合（タイが要る場合）も null を返す。
 */
export function rebar(imported: ImportedSong): ImportedSong | null {
  const expected = barQuarterLength(imported.meter)

  // 「2/2 と書いてあるのに全部の小節が 4 分音符 1 つ分」という楽譜が実在する。
  // 音価がまるごと 4 倍細かい（または粗い）状態で、小節線を引き直しても
  // 音価は直らない（単位長が 1/32 のままで譜面が読めない）ので諦める。
  // 一方、一部の小節だけ長さが違うのは小節線の位置の問題なので引き直せる
  if (!barLengthsAgreeWithMeter(imported, expected)) return null

  // 弱起の長さ。先頭の小節線を読み飛ばして、最初の小節の中身を測る
  let head = 0
  let seenNote = false
  for (const el of imported.elements) {
    if (el.kind === 'bar') {
      if (seenNote) break
      continue
    }
    seenNote = true
    head += el.ql
  }
  const pickup = head > 0 && head < expected - 1e-9 ? head : 0

  const out: ImportedSong['elements'] = []
  let filled = 0
  // 現在の小節の目標の長さ。弱起があるぶん最初だけ短い
  let target = pickup > 0 ? pickup : expected

  for (const el of imported.elements) {
    if (el.kind === 'bar') {
      // 終止線・複縦線は再生に影響しないので捨てる。末尾で付け直す。
      // 繰り返し記号だけは音楽的な意味を持つので位置を保つ
      if (el.type === 'normal' || el.type === 'double' || el.type === 'final') continue

      if (filled < 1e-9) {
        // 小節の切れ目にある。直前に引いた小節線を繰り返し記号で置き換える
        if (out.length > 0 && out[out.length - 1].kind === 'bar') out.pop()
        out.push(el)
        target = expected
        continue
      }
      // 小節の途中にある。弱起と足して 1 小節になるなら段落の切れ目として認める
      if (pickup > 0 && Math.abs(filled + pickup - expected) < 1e-9) {
        out.push(el)
        filled = 0
        target = expected
        continue
      }
      return null // 拍子と辻褄が合わず、動かすこともできない
    }

    if (el.ql > target - filled + 1e-9) return null // 音符が小節線をまたぐ（タイが要る）
    out.push(el)
    filled += el.ql
    if (target - filled < 1e-9) {
      out.push({ kind: 'bar', type: 'normal' })
      filled = 0
      target = expected
    }
  }

  while (out.length > 0 && out[out.length - 1].kind === 'bar') out.pop()
  if (out.length === 0) return null
  out.push({ kind: 'bar', type: 'final' })

  return { ...imported, elements: out }
}

/**
 * 元データの小節の長さが、拍子と同じ桁に収まっているか。
 *
 * どの小節も拍子より短ければ音価が細かすぎ、どの小節も長ければ粗すぎる。
 * どちらも小節線を引き直しても救えない。
 */
function barLengthsAgreeWithMeter(imported: ImportedSong, expected: number): boolean {
  const fills: number[] = []
  let current = 0
  for (const el of imported.elements) {
    if (el.kind === 'bar') {
      fills.push(current)
      current = 0
    } else {
      current += el.ql
    }
  }
  fills.push(current)

  const body = fills.filter((f) => f > 0)
  if (body.length === 0) return false
  if (Math.max(...body) < expected - 1e-9) return false

  // 先頭と末尾は弱起とその対で短いのが普通なので、下限の判定から外す
  const inner = body.length > 2 ? body.slice(1, -1) : body
  return Math.min(...inner) <= expected + 1e-9
}
