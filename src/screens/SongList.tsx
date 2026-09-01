import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { levelInfo } from '../core/level'
import type { SongIndexEntry } from '../core/schema'
import { loadSongIndex } from '../data/songs'
import { progressOf } from '../storage/progress'
import { useStore } from '../storeContext'

export function SongList() {
  const { store } = useStore()
  const [songs, setSongs] = useState<SongIndexEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadSongIndex()
      .then((index) => setSongs(index.songs))
      .catch((e: Error) => setError(e.message))
  }, [])

  if (error) return <p className="p-4 text-red-600 dark:text-red-400">{error}</p>
  if (!songs) return <p className="p-4 text-slate-500">読み込み中…</p>

  const kodaly = songs.filter((s) => s.unit === 'kodaly')
  const japanese = songs.filter((s) => s.unit === 'japanese')

  const byLevel = new Map<number, SongIndexEntry[]>()
  for (const s of kodaly) {
    const list = byLevel.get(s.level) ?? []
    list.push(s)
    byLevel.set(s.level, list)
  }

  const done = songs.filter((s) => progressOf(store, s.id).completed).length

  return (
    <div className="mx-auto max-w-3xl p-4 pb-16">
      <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
        {songs.length} 曲中 {done} 曲クリア
      </p>

      {[...byLevel.keys()]
        .sort((a, b) => a - b)
        .map((level) => (
          <section key={level} className="mb-8">
            <h2 className="mb-2 flex items-baseline gap-2 border-b border-slate-200 pb-1 dark:border-slate-700">
              <span className="text-xs font-bold text-sky-700 dark:text-sky-400">Lv{level}</span>
              <span className="font-semibold">{levelInfo(level).label}</span>
              <span className="text-xs text-slate-500">{levelInfo(level).description}</span>
            </h2>
            <ul>
              {byLevel.get(level)!.map((song) => (
                <SongRow key={song.id} song={song} />
              ))}
            </ul>
          </section>
        ))}

      {japanese.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-2 flex items-baseline gap-2 border-b border-slate-200 pb-1 dark:border-slate-700">
            <span className="font-semibold">日本の音階</span>
            <span className="text-xs text-slate-500">
              都節。西洋のペンタトニックとは別の音組織
            </span>
          </h2>
          <ul>
            {japanese.map((song) => (
              <SongRow key={song.id} song={song} />
            ))}
          </ul>
        </section>
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
        className="flex items-center gap-3 rounded px-2 py-2.5 hover:bg-sky-50 dark:hover:bg-slate-800"
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
          <span className="block">{song.title}</span>
          <span className="block text-xs text-slate-500">{song.syllables.join(' ')}</span>
        </span>
        {progress.practiceCount > 0 && (
          <span className="text-xs text-slate-400">{progress.practiceCount} 回</span>
        )}
      </Link>
    </li>
  )
}
