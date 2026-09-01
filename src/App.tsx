import { Suspense, lazy } from 'react'
import { HashRouter, Link, Route, Routes } from 'react-router'
import { Settings } from './screens/Settings'
import { SongList } from './screens/SongList'
import { StoreProvider } from './store'

// abcjs（約 512 KB）は練習画面でしか要らないので、曲一覧の初期表示から外す
const Practice = lazy(() => import('./screens/Practice').then((m) => ({ default: m.Practice })))

/**
 * GitHub Pages はサーバ側のリライトができず、SPA のパスを扱えない。
 * ハッシュルーティングならサーバへ新規リクエストが飛ばないので、
 * 404 フォールバックの小細工なしで直接リンクと戻るボタンが両立する。
 */
export function App() {
  return (
    <StoreProvider>
      <HashRouter>
        <div className="min-h-dvh bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
          <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="mx-auto flex max-w-3xl items-center justify-between p-3">
              <Link to="/" className="font-semibold tracking-tight">
                SolfaGym
              </Link>
              <Link
                to="/settings"
                className="text-sm text-slate-500 hover:text-sky-600 dark:hover:text-sky-400"
              >
                設定
              </Link>
            </div>
          </header>
          <Suspense fallback={<p className="p-4 text-slate-500">読み込み中…</p>}>
            <Routes>
              <Route path="/" element={<SongList />} />
              <Route path="/practice/:id" element={<Practice />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<SongList />} />
            </Routes>
          </Suspense>
        </div>
      </HashRouter>
    </StoreProvider>
  )
}
