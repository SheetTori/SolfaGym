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
