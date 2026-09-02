import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import type { SongIndexEntry } from '../core/schema'
import { loadSongIndex } from '../data/songs'

/**
 * 出典とライセンスの表示。
 *
 * CC BY 系のコーパスを使う以上、帰属表示はライセンスの条件そのもの。
 * 曲単位の出典は練習画面（曲名を明かすタイミング）に出し、
 * ここにはコーパス単位でまとめる。
 */

interface Corpus {
  name: string
  url: string
  license: string
  licenseUrl?: string
  note: string
}

const CORPORA: Corpus[] = [
  {
    name: 'Mutopia Project',
    url: 'https://www.mutopiaproject.org/',
    license: 'Public Domain / CC BY',
    licenseUrl: 'https://www.mutopiaproject.org/legal.html',
    note: 'LilyPond で組まれた楽譜。曲ごとにライセンスが明示されている。本アプリでは Public Domain と CC BY のもののみを取り込み、ShareAlike のものは除外している。',
  },
  {
    name: 'PDMX',
    url: 'https://zenodo.org/records/14648209',
    license: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    note: 'MuseScore の投稿から公有部分を集めたデータセット（Long et al.）。ライセンスは投稿者の自己申告なので、本アプリでは作曲者が伝承・匿名のものだけを採り、さらに単旋律であること・音域・跳躍などの自動検証を通したものだけを収録している。',
  },
  {
    name: '自前エンコード',
    url: 'https://github.com/SheetTori/SolfaGym',
    license: 'Public Domain の楽曲',
    note: 'パブリックドメインが確実な楽曲を、既存の符号化データを流用せず書き起こしたもの。コダーイの初期段階に使える曲は、ライセンスがクリーンな機械可読コーパスに存在しないため。',
  },
]

export function Credits() {
  const [songs, setSongs] = useState<SongIndexEntry[] | null>(null)

  useEffect(() => {
    loadSongIndex()
      .then((index) => setSongs(index.songs))
      .catch(() => setSongs([]))
  }, [])

  const counts = useMemo(() => {
    const map = new Map<string, number>()
    for (const s of songs ?? []) {
      const key = s.source.split(' — ')[0]
      map.set(key, (map.get(key) ?? 0) + 1)
    }
    return map
  }, [songs])

  return (
    <div className="mx-auto max-w-2xl p-4 pb-16">
      <Link to="/" className="text-sm text-sky-600 hover:underline dark:text-sky-400">
        ← 曲一覧
      </Link>
      <h1 className="mb-2 mt-1 text-xl font-semibold">出典とライセンス</h1>
      <p className="mb-6 text-sm text-slate-600 dark:text-slate-400">
        収録している楽曲は、すべてパブリックドメイン、または再配布と改変が認められた
        ライセンスのものです。
      </p>

      {CORPORA.map((c) => {
        const n = counts.get(c.name) ?? 0
        return (
          <section key={c.name} className="mb-6">
            <h2 className="font-medium">
              <a
                href={c.url}
                target="_blank"
                rel="noreferrer"
                className="text-sky-600 hover:underline dark:text-sky-400"
              >
                {c.name}
              </a>
              {n > 0 && <span className="ml-2 text-xs text-slate-500">{n} 曲</span>}
            </h2>
            <p className="text-sm text-slate-500">
              ライセンス:{' '}
              {c.licenseUrl ? (
                <a
                  href={c.licenseUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sky-600 hover:underline dark:text-sky-400"
                >
                  {c.license}
                </a>
              ) : (
                c.license
              )}
            </p>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{c.note}</p>
          </section>
        )
      })}

      <section className="mt-8 border-t border-slate-200 pt-4 text-sm text-slate-500 dark:border-slate-700">
        <h2 className="mb-2 font-medium text-slate-700 dark:text-slate-300">使っているもの</h2>
        <ul className="list-inside list-disc space-y-1">
          <li>
            楽譜の描画:{' '}
            <a href="https://www.abcjs.net/" target="_blank" rel="noreferrer" className="text-sky-600 hover:underline">
              abcjs
            </a>{' '}
            (MIT)
          </li>
          <li>
            音の再生:{' '}
            <a href="https://tonejs.github.io/" target="_blank" rel="noreferrer" className="text-sky-600 hover:underline">
              Tone.js
            </a>{' '}
            (MIT)
          </li>
          <li>
            楽譜の解析:{' '}
            <a href="https://music21.org/" target="_blank" rel="noreferrer" className="text-sky-600 hover:underline">
              music21
            </a>{' '}
            (BSD-3) — 取り込み時のみ
          </li>
        </ul>
      </section>
    </div>
  )
}
