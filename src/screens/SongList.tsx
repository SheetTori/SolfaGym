import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { LEVELS, levelInfo } from '../core/level'
import { chooseRandomSong } from '../core/pickSong'
import type { SongIndexEntry } from '../core/schema'
import { loadSongIndex } from '../data/songs'
import { progressOf } from '../storage/progress'
import { useStore } from '../storeContext'

/**
 * ランダム出題を主たる導線にする。
 *
 * 曲名が分かると旋律も分かってしまい、階名を読む訓練にならない。
 * ランダムで開いた曲は最後のステップまで曲名を伏せる（`?blind=1`）。
 * 一覧からも開けるが、そちらは自分で選んだ以上、曲名が見えるのを承知の上とする。
 */
export function SongList() {
  const { store } = useStore()
  const navigate = useNavigate()
  const [songs, setSongs] = useState<SongIndexEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showList, setShowList] = useState(false)

  useEffect(() => {
    loadSongIndex()
      .then((index) => setSongs(index.songs))
      .catch((e: Error) => setError(e.message))
  }, [])

  const byLevel = useMemo(() => {
    const map = new Map<number, SongIndexEntry[]>()
    for (const s of songs ?? []) {
      const list = map.get(s.level) ?? []
      list.push(s)
      map.set(s.level, list)
    }
    return map
  }, [songs])

  if (error) return <p className="p-4 text-red-600 dark:text-red-400">{error}</p>
  if (!songs) return <p className="p-4 text-slate-500">読み込み中…</p>

  const done = songs.filter((s) => progressOf(store, s.id).completed).length

  const pickRandom = (level: number) => {
    const song = chooseRandomSong(byLevel.get(level) ?? [], (id) => progressOf(store, id).completed)
    if (song) navigate(`/practice/${song.id}?blind=1`)
  }

  return (
    <div className="mx-auto max-w-3xl p-4 pb-16">
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        {songs.length} 曲中 {done} 曲クリア
      </p>

      <h2 className="mb-1 font-semibold">レベルを選んで出題</h2>
      <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
        曲名は伏せられます。初見で階名を読む練習になります。
      </p>

      <div className="mb-8 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {LEVELS.map((info) => {
          const pool = byLevel.get(info.level) ?? []
          const cleared = pool.filter((s) => progressOf(store, s.id).completed).length
          return (
            <button
              key={info.level}
              type="button"
              disabled={pool.length === 0}
              onClick={() => pickRandom(info.level)}
              className="rounded border border-slate-200 p-3 text-left enabled:hover:border-sky-400 enabled:hover:bg-sky-50 disabled:opacity-40 dark:border-slate-700 dark:enabled:hover:bg-slate-800"
            >
              <span className="block text-xs font-bold text-sky-700 dark:text-sky-400">
                Lv{info.level}
              </span>
              <span className="block text-sm font-medium">{info.label}</span>
              <span className="block text-xs text-slate-500">
                {pool.length === 0 ? '曲がありません' : `${cleared} / ${pool.length} クリア`}
              </span>
            </button>
          )
        })}
      </div>

      <button
        type="button"
        onClick={() => setShowList((v) => !v)}
        className="mb-4 text-sm text-sky-600 hover:underline dark:text-sky-400"
      >
        {showList ? '一覧を閉じる' : `曲を選んで練習する（${songs.length} 曲）`}
      </button>

      {showList && (
        <div>
          <p className="mb-4 text-xs text-slate-500">
            一覧から選ぶと曲名が見えます。初見の練習にはランダム出題を使ってください。
          </p>
          {[...byLevel.keys()]
            .sort((a, b) => a - b)
            .map((level) => (
              <section key={level} className="mb-6">
                <h3 className="mb-1 flex items-baseline gap-2 border-b border-slate-200 pb-1 dark:border-slate-700">
                  <span className="text-xs font-bold text-sky-700 dark:text-sky-400">
                    Lv{level}
                  </span>
                  <span className="font-medium">{levelInfo(level).label}</span>
                </h3>
                <ul>
                  {byLevel.get(level)!.map((song) => (
                    <SongRow key={song.id} song={song} />
                  ))}
                </ul>
              </section>
            ))}
        </div>
      )}
    </div>
  )
}

function SongRow({ song }: { song: SongIndexEntry }) {
  const { store } = useStore()
  const progress = progressOf(store, song.id)

  return (
    <li>
      <Link
        to={`/practice/${song.id}`}
        className="flex items-center gap-3 rounded px-2 py-2 hover:bg-sky-50 dark:hover:bg-slate-800"
      >
        <span
          className={
            progress.completed
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-slate-300 dark:text-slate-600'
          }
          aria-label={progress.completed ? 'クリア済み' : '未クリア'}
        >
          {progress.completed ? '✓' : '○'}
        </span>
        <span className="flex-1">
          <span className="block text-sm">
            {song.title}
            {song.language && (
              <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500 dark:bg-slate-800">
                {song.language}
              </span>
            )}
          </span>
          <span className="block text-xs text-slate-500">{song.syllables.join(' ')}</span>
        </span>
        {progress.practiceCount > 0 && (
          <span className="text-xs text-slate-400">{progress.practiceCount} 回</span>
        )}
      </Link>
    </li>
  )
}
