import { songIndexSchema, songSchema, type Song, type SongIndex } from '../core/schema'

/**
 * 曲データは `public/songs/` から実行時に fetch する。
 * ビルド時の型チェックが効かないので、受け取った直後に Zod で検証する。
 */

/** GitHub Pages ではサブパス配信になるので base を必ず前置する */
const base = import.meta.env.BASE_URL

let indexPromise: Promise<SongIndex> | null = null
const songCache = new Map<string, Promise<Song>>()

export function loadSongIndex(): Promise<SongIndex> {
  if (!indexPromise) {
    indexPromise = fetch(`${base}songs/index.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`曲一覧を読めませんでした (${r.status})`)
        return r.json()
      })
      .then((json) => songIndexSchema.parse(json))
      .catch((e) => {
        indexPromise = null
        throw e
      })
  }
  return indexPromise
}

export function loadSong(id: string): Promise<Song> {
  const cached = songCache.get(id)
  if (cached) return cached

  const promise = fetch(`${base}songs/${id}.json`)
    .then((r) => {
      if (!r.ok) throw new Error(`曲データを読めませんでした: ${id} (${r.status})`)
      return r.json()
    })
    .then((json) => songSchema.parse(json))
    .catch((e) => {
      songCache.delete(id)
      throw e
    })

  songCache.set(id, promise)
  return promise
}
