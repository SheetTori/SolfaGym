/**
 * 速さの表示と操作。
 *
 * 保存するのは曲ごとの基準テンポに対する倍率（曲をまたいで引き継ぐため）だが、
 * 画面に出すのは BPM にする。「85%」では実際に何拍で歌うのかが分からない。
 */

/** 倍率の下限・上限。保存側のスキーマ（storage/progress.ts）と揃える */
export const TEMPO_RATIO_MIN = 0.5
export const TEMPO_RATIO_MAX = 1.2

export interface TempoRange {
  /** いま鳴る速さ */
  bpm: number
  minBpm: number
  maxBpm: number
}

/**
 * 倍率から BPM の現在値と可動域を出す。
 *
 * 端は内側に丸める（ceil / floor）。外側に丸めると、そこから戻した倍率が
 * 保存できる範囲をはみ出す。
 */
export function bpmRange(baseBpm: number, ratio: number): TempoRange {
  const minBpm = Math.ceil(baseBpm * TEMPO_RATIO_MIN)
  const maxBpm = Math.floor(baseBpm * TEMPO_RATIO_MAX)
  const bpm = Math.min(maxBpm, Math.max(minBpm, Math.round(baseBpm * ratio)))
  return { bpm, minBpm, maxBpm }
}

/** BPM を倍率に戻す。保存できる範囲に収める */
export function ratioFromBpm(baseBpm: number, bpm: number): number {
  const ratio = bpm / baseBpm
  return Math.min(TEMPO_RATIO_MAX, Math.max(TEMPO_RATIO_MIN, ratio))
}
