import { z } from 'zod'

/**
 * 自分ひとり用なのでサーバは持たず localStorage に置く。
 * スキーマを変えたときに壊れたデータを引きずらないよう、
 * バージョンキーを持たせて読めなければ捨てる。
 */

const STORAGE_KEY = 'solfagym.v1'

export const vocalPresetSchema = z.enum(['female', 'male', 'custom'])
export type VocalPreset = z.infer<typeof vocalPresetSchema>

const settingsSchema = z.object({
  vocalPreset: vocalPresetSchema.default('female'),
  customLowMidi: z.number().int().min(21).max(108).default(57),
  customHighMidi: z.number().int().min(21).max(108).default(76),
  metronome: z.boolean().default(true),
  tempoRatio: z.number().min(0.5).max(1.2).default(1),
  showSolfa: z.boolean().default(true),
})

const songProgressSchema = z.object({
  completed: z.boolean().default(false),
  practiceCount: z.number().int().min(0).default(0),
  lastPracticedAt: z.string().nullable().default(null),
  /** 直前に使ったキー（原調からの半音差）。同じキーが続かないようにする */
  lastShift: z.number().int().nullable().default(null),
})

const storeSchema = z.object({
  // prefault は「入力側の既定値」。各フィールドに既定があるので {} から埋まる
  settings: settingsSchema.prefault({}),
  songs: z.record(z.string(), songProgressSchema).default({}),
})

export type Settings = z.infer<typeof settingsSchema>
export type SongProgress = z.infer<typeof songProgressSchema>
export type Store = z.infer<typeof storeSchema>

export const DEFAULT_STORE: Store = storeSchema.parse({})

export function loadStore(): Store {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_STORE
    const parsed = storeSchema.safeParse(JSON.parse(raw))
    // 読めなければ既定値に戻す。古い形を無理に移行しない
    return parsed.success ? parsed.data : DEFAULT_STORE
  } catch {
    return DEFAULT_STORE
  }
}

export function saveStore(store: Store): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch {
    // 保存できない環境（プライベートウィンドウ等）でも動作は続ける
  }
}

export function progressOf(store: Store, songId: string): SongProgress {
  return store.songs[songId] ?? songProgressSchema.parse({})
}

export function withProgress(
  store: Store,
  songId: string,
  update: (p: SongProgress) => SongProgress,
): Store {
  return { ...store, songs: { ...store.songs, [songId]: update(progressOf(store, songId)) } }
}

export function markCompleted(store: Store, songId: string): Store {
  return withProgress(store, songId, (p) => ({
    ...p,
    completed: true,
    practiceCount: p.practiceCount + 1,
    lastPracticedAt: new Date().toISOString(),
  }))
}

export function rememberShift(store: Store, songId: string, shift: number): Store {
  return withProgress(store, songId, (p) => ({ ...p, lastShift: shift }))
}
