import { Link } from 'react-router'
import { fromMidi, pitchName } from '../core/pitch'
import { DEFAULT_STORE, type VocalPreset } from '../storage/progress'
import { useStore } from '../storeContext'

const PRESET_LABELS: Record<VocalPreset, string> = {
  female: '女声（A3–E5）',
  male: '男声（A2–E4）',
  custom: '自分で指定',
}

export function Settings() {
  const { store, update, vocalRange } = useStore()
  const { settings } = store

  const setSettings = (patch: Partial<typeof settings>) =>
    update((s) => ({ ...s, settings: { ...s.settings, ...patch } }))

  return (
    <div className="mx-auto max-w-2xl p-4 pb-16">
      <Link to="/" className="text-sm text-sky-600 hover:underline dark:text-sky-400">
        ← 曲一覧
      </Link>
      <h1 className="mb-6 mt-1 text-xl font-semibold">設定</h1>

      <section className="mb-8">
        <h2 className="mb-1 font-medium">歌唱音域</h2>
        <p className="mb-3 text-sm text-slate-500">
          曲を開くたびに、旋律がこの範囲に収まるキーからランダムに選びます。
        </p>
        <div className="flex flex-col gap-2">
          {(Object.keys(PRESET_LABELS) as VocalPreset[]).map((preset) => (
            <label key={preset} className="flex items-center gap-2">
              <input
                type="radio"
                name="vocalPreset"
                checked={settings.vocalPreset === preset}
                onChange={() => setSettings({ vocalPreset: preset })}
              />
              <span>{PRESET_LABELS[preset]}</span>
            </label>
          ))}
        </div>

        {settings.vocalPreset === 'custom' && (
          <div className="mt-3 flex items-center gap-3 text-sm">
            <label className="flex items-center gap-2">
              最低音
              <input
                type="number"
                min={21}
                max={108}
                value={settings.customLowMidi}
                onChange={(e) => setSettings({ customLowMidi: Number(e.target.value) })}
                className="w-20 rounded border border-slate-300 px-2 py-1 dark:border-slate-600 dark:bg-slate-800"
              />
              <span className="text-slate-500">{pitchName(fromMidi(settings.customLowMidi))}</span>
            </label>
            <label className="flex items-center gap-2">
              最高音
              <input
                type="number"
                min={21}
                max={108}
                value={settings.customHighMidi}
                onChange={(e) => setSettings({ customHighMidi: Number(e.target.value) })}
                className="w-20 rounded border border-slate-300 px-2 py-1 dark:border-slate-600 dark:bg-slate-800"
              />
              <span className="text-slate-500">{pitchName(fromMidi(settings.customHighMidi))}</span>
            </label>
          </div>
        )}

        <p className="mt-2 text-xs text-slate-400">
          現在の範囲: {pitchName(fromMidi(vocalRange.lowMidi))} –{' '}
          {pitchName(fromMidi(vocalRange.highMidi))}
          {vocalRange.lowMidi >= vocalRange.highMidi && (
            <span className="ml-2 text-amber-600">最低音が最高音以上になっています</span>
          )}
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 font-medium">練習</h2>
        <label className="mb-2 flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.metronome}
            onChange={(e) => setSettings({ metronome: e.target.checked })}
          />
          メトロノームを鳴らす
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.showSolfa}
            onChange={(e) => setSettings({ showSolfa: e.target.checked })}
          />
          楽譜に階名を表示する
        </label>
        <p className="mt-1 text-xs text-slate-400">
          最終的には階名なしで読めるのが目標なので、慣れたら消してみてください。
        </p>
      </section>

      <section>
        <h2 className="mb-3 font-medium">記録</h2>
        <p className="mb-2 text-sm text-slate-500">
          {Object.values(store.songs).filter((s) => s.completed).length} 曲クリア済み
        </p>
        <button
          type="button"
          onClick={() => {
            if (confirm('進捗と設定をすべて消します。よろしいですか？')) {
              update(() => DEFAULT_STORE)
            }
          }}
          className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-950"
        >
          進捗をリセット
        </button>
      </section>
    </div>
  )
}
