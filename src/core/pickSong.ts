import type { SongIndexEntry } from './schema'

/**
 * まだクリアしていない曲を優先して1曲選ぶ。全部クリア済みなら全体から選ぶ。
 * rng を差し込めるようにして、描画中の副作用と切り離してある。
 */
export function chooseRandomSong(
  pool: readonly SongIndexEntry[],
  isCompleted: (id: string) => boolean,
  rng: () => number = Math.random,
): SongIndexEntry | null {
  if (pool.length === 0) return null
  const unfinished = pool.filter((s) => !isCompleted(s.id))
  const from = unfinished.length > 0 ? unfinished : pool
  return from[Math.min(from.length - 1, Math.floor(rng() * from.length))]
}
