import { z } from 'zod'

/**
 * 曲データは `public/songs/` に JSON として置き、実行時に fetch する。
 * ビルド時の型チェックが効かないので、Zod スキーマで実行時に検証し、
 * 同じスキーマを使って全曲を一括検証するテストを持つ。
 */

export const modeSchema = z.enum(['major', 'minor'])

export const unitSchema = z.enum(['kodaly', 'japanese'])

export const chordEventSchema = z.object({
  /** 1 始まり。弱起の不完全小節は 0 とする */
  bar: z.number().int().min(0),
  /** 小節内の拍。0 始まり */
  beat: z.number().min(0),
  /** ローマ数字の度数表記。"I" "IV" "V7" "vi" "bVII" など */
  degree: z.string().min(1),
})

/**
 * 曲の出どころ。数百曲を全数目視できないので、機械が自分で
 * レビューキューを作れるよう、怪しさの手がかりを残しておく。
 */
export const provenanceSchema = z.object({
  source: z.string().min(1),
  sourceId: z.string().optional(),
  sourceUrl: z.string().nullable().optional(),
  license: z.string().min(1),
  /** 音名の綴りが推定か。true なら Di/Ra が入れ替わりうる */
  spellingInferred: z.boolean().default(false),
  keyConfidence: z.number().nullable().default(null),
  /** 長短の判定に使った音程（半音）。null は手がかりが無かった */
  keyDecidedBy: z.number().nullable().default(null),
  /** music21 の調推定と一致したか。false ならレビュー対象 */
  keyAgreesWithAnalysis: z.boolean().default(false),
  /** 多声を潰して旋律を取ったか */
  skylineUsed: z.boolean().default(false),
  /** コード進行が出典に由来するか。false なら Step 3 を出さない */
  chordsFromSource: z.boolean().default(false),
})

export type Provenance = z.infer<typeof provenanceSchema>

export const songSchema = z.object({
  id: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, 'id は英小文字・数字・ハイフンのみ'),
  title: z.string().min(1),
  titleEn: z.string().optional(),
  /** 原題の言語。一覧のタグに使う */
  language: z.string().length(2).optional(),
  /** 出典と権利の根拠。「Scottish traditional」「岡野貞一 (d.1941)」など */
  source: z.string().min(1),
  /** 取り込み由来の曲だけが持つ。手入力の曲は省略できる */
  provenance: provenanceSchema.optional(),
  mode: modeSchema,
  /**
   * 原調の主音の MIDI。長調なら do、短調なら la。
   * オクターブは「曲が中心とする段」に合わせる — レベル判定の register が
   * これを基準に決まるため（下方拡張の判定に効く）。
   */
  tonicMidi: z.number().int().min(21).max(108),
  baseBpm: z.number().min(30).max(240),
  unit: unitSchema.default('kodaly'),
  /** 伴奏和音。空なら主音のドローンにフォールバックする */
  chords: z.array(chordEventSchema).default([]),
  /** 曲の正本。単旋律・和音なし・連符なしの範囲で書く */
  abc: z.string().min(1),
})

export type Song = z.infer<typeof songSchema>
export type ChordEvent = z.infer<typeof chordEventSchema>
export type SongUnit = z.infer<typeof unitSchema>

/** 一覧画面が読む軽いメタ。scripts/build-songs.ts が自動生成する */
export const songIndexEntrySchema = z.object({
  id: z.string(),
  title: z.string(),
  titleEn: z.string().optional(),
  source: z.string(),
  mode: modeSchema,
  unit: unitSchema,
  language: z.string().length(2).optional(),
  /** 曲中の階名から自動算出したレベル */
  level: z.number().int().min(1).max(8),
  /** 伴奏で歌う Step を出すか。コード進行を持たない曲では出さない */
  hasChords: z.boolean().default(false),
  /** 曲に現れる階名（重複なし、出現順） */
  syllables: z.array(z.string()),
})

export const songIndexSchema = z.object({
  generatedAt: z.string(),
  songs: z.array(songIndexEntrySchema),
})

export type SongIndexEntry = z.infer<typeof songIndexEntrySchema>
export type SongIndex = z.infer<typeof songIndexSchema>
