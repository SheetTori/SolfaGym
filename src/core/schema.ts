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

export const songSchema = z.object({
  id: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, 'id は英小文字・数字・ハイフンのみ'),
  title: z.string().min(1),
  titleEn: z.string().optional(),
  /** 出典と権利の根拠。「Scottish traditional」「岡野貞一 (d.1941)」など */
  source: z.string().min(1),
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
  /** 曲中の階名から自動算出したレベル */
  level: z.number().int().min(1).max(8),
  /** 曲に現れる階名（重複なし、出現順） */
  syllables: z.array(z.string()),
})

export const songIndexSchema = z.object({
  generatedAt: z.string(),
  songs: z.array(songIndexEntrySchema),
})

export type SongIndexEntry = z.infer<typeof songIndexEntrySchema>
export type SongIndex = z.infer<typeof songIndexSchema>
