import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Song } from '../../src/core/schema'

// jsdom には matchMedia が無い。1行あたりの小節数の判定で使う
window.matchMedia = ((query: string) => ({
  matches: false,
  media: query,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
})) as unknown as typeof window.matchMedia

/** 曲名が入った最小の曲。ここに出てくる文字列が画面に漏れないことを見る */
const SECRET_TITLE = 'ヒミツの旋律'
const SONG: Song = {
  id: 'secret-1',
  title: SECRET_TITLE,
  source: 'テスト',
  mode: 'major',
  tonicMidi: 60,
  baseBpm: 96,
  unit: 'kodaly',
  chords: [],
  abc: `X:1\nT:${SECRET_TITLE}\nM:2/4\nL:1/8\nK:C clef=treble\nG2 G2 | E2 G2 | G2 E2 | G4 |\nG2 G2 | E2 G2 | G2 E2 | E4 |]\n`,
} as Song

vi.mock('../../src/data/songs', () => ({
  loadSong: () => Promise.resolve(SONG),
  loadSongIndex: () => Promise.resolve({ songs: [] }),
}))

// 音は鳴らさない。abcjs は SVG を作るだけなので、ABC の中身が見える形に差し替える
vi.mock('../../src/audio/engine', () => ({
  getEngine: () => Promise.resolve({}),
  preloadAudio: () => undefined,
}))
vi.mock('../../src/score/AbcScore', () => ({
  AbcScore: ({ abc }: { abc: string }) => <pre data-testid="abc">{abc}</pre>,
}))

const { Practice } = await import('../../src/screens/Practice')
const { StoreProvider } = await import('../../src/store')

function open(query: string) {
  return render(
    <StoreProvider>
      <MemoryRouter initialEntries={[`/practice/secret-1${query}`]}>
        <Routes>
          <Route path="/practice/:id" element={<Practice />} />
        </Routes>
      </MemoryRouter>
    </StoreProvider>,
  )
}

describe('ランダム出題（blind）での曲名', () => {
  beforeEach(() => localStorage.clear())
  // 自動 cleanup が入っていないので、前のテストの DOM を自分で片付ける
  afterEach(cleanup)

  it('最初のステップでは画面のどこにも曲名が出ない', async () => {
    open('?blind=1')
    // 楽譜が描かれるまで待つ
    await screen.findByTestId('abc')
    // ヘッダーだけでなく、楽譜の T: 行にも曲名が出てはいけない
    expect(document.body.textContent).not.toContain(SECRET_TITLE)
  })

  it('最後のステップで曲名を明かす', async () => {
    const { container } = open('?blind=1')
    await screen.findByTestId('abc')
    const steps = container.querySelectorAll('nav button')
    ;(steps[steps.length - 1] as HTMLButtonElement).click()
    expect(await screen.findByText(SECRET_TITLE)).toBeTruthy()
  })

  it('一覧から開いたときは最初から曲名が見える', async () => {
    open('')
    await screen.findByTestId('abc')
    expect(document.body.textContent).toContain(SECRET_TITLE)
  })
})
