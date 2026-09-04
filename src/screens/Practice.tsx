import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { renderAbcSource, soundingToElementIndex } from '../core/abc'
import { buildPlaybackPlan } from '../core/playback'
import { pitchName, toMidi } from '../core/pitch'
import type { Key } from '../core/solfa'
import { bpmRange, ratioFromBpm } from '../core/tempo'
import { analyzeSong, type AnalyzedSong } from '../core/song'
import { chooseKey, type ChooseKeyResult } from '../core/transpose'
import { getEngine, preloadAudio, type PlaybackHandle } from '../audio/engine'
import { loadSong } from '../data/songs'
import { AbcScore } from '../score/AbcScore'
import { markCompleted, progressOf, rememberShift } from '../storage/progress'
import { useStore } from '../storeContext'

/**
 * 狭い画面では1行あたりの小節数を減らす。matchMedia は要素サイズではなく
 * ビューポートを見るので、SVG の大きさとの間で振動する余地がない。
 */
function useBarsPerLine(): number {
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)')
    const onChange = () => setNarrow(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return narrow ? 2 : 4
}

interface StepDef {
  title: string
  hint: string
  variant: 'rhythm' | 'pitch'
  melody: boolean
  accompaniment: boolean
  /** 伴奏だけを頼りに歌うステップ。和音を持たない曲では出さない */
  accompanimentOnly?: boolean
}

const ALL_STEPS: StepDef[] = [
  {
    title: '自力で歌う',
    hint: 'リズムと階名だけを見て、音の助けなしで歌う。ここが訓練の本体。調を見失ったら「調を鳴らす」で取り直す。',
    variant: 'rhythm',
    melody: false,
    accompaniment: false,
  },
  {
    title: 'お手本を聴く',
    hint: '旋律が鳴る。自分が歌ったものと照らし合わせる。',
    variant: 'rhythm',
    melody: true,
    accompaniment: false,
  },
  {
    title: '伴奏で歌う',
    hint: '旋律は鳴らない。和声の支えだけを頼りに歌う。',
    variant: 'rhythm',
    melody: false,
    accompaniment: true,
    accompanimentOnly: true,
  },
  {
    title: '楽譜を見て歌う',
    hint: '実際に鳴っている高さの五線譜。階名と五線を結びつける。',
    variant: 'pitch',
    melody: true,
    accompaniment: true,
  },
]

/**
 * ステップは曲ごとに組み立てる。
 *
 * コード進行を持たない曲では「伴奏で歌う」を出さない。根拠のないドローンを
 * 鳴らすより、そのステップ自体を畳むほうが筋が通る（5ステップが4ステップになる）。
 */
function buildSteps(hasChords: boolean): StepDef[] {
  return hasChords ? ALL_STEPS : ALL_STEPS.filter((s) => !s.accompanimentOnly)
}

export function Practice() {
  const { id } = useParams<{ id: string }>()
  // ランダム出題で開いたときは、曲名から旋律が割れないよう Step 4 まで伏せる
  const [searchParams] = useSearchParams()
  const blind = searchParams.get('blind') === '1'
  const { store, update, vocalRange } = useStore()

  const [analyzed, setAnalyzed] = useState<AnalyzedSong | null>(null)
  const [choice, setChoice] = useState<ChooseKeyResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState(0)
  const [cursor, setCursor] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const [cueing, setCueing] = useState(false)

  const handleRef = useRef<PlaybackHandle | null>(null)
  const tempoRatio = store.settings.tempoRatio
  const barsPerLine = useBarsPerLine()

  // 曲を開くたびにキーを選び直す。絶対音高の記憶が固定されるのを防ぐため、
  // 直前と同じキーは避ける。
  useEffect(() => {
    if (!id) return
    let cancelled = false
    setAnalyzed(null)
    setChoice(null)
    setError(null)
    setStep(0)

    loadSong(id)
      .then((meta) => {
        if (cancelled) return
        const a = analyzeSong(meta)
        const picked = chooseKey(
          {
            tonicMidi: meta.tonicMidi,
            mode: meta.mode,
            minMidi: a.minMidi,
            maxMidi: a.maxMidi,
            range: vocalRange,
          },
          progressOf(store, id).lastShift,
        )
        setAnalyzed(a)
        setChoice(picked)
        update((s) => rememberShift(s, id, picked.semitoneShift))
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message)
      })

    return () => {
      cancelled = true
    }
    // vocalRange / store を依存に入れると設定変更のたびにキーが振り直される。
    // 曲を開いたときにだけ選び直したいので id のみを見る。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // 再生ボタンを押した瞬間に Tone.start() を呼べるよう、取得だけ先に済ませる
  useEffect(() => {
    preloadAudio()
  }, [])

  // 画面を離れるときは音を止める。dispose はしない（エンジンは使い回す）
  useEffect(() => {
    return () => {
      handleRef.current?.stop()
      handleRef.current = null
    }
  }, [])

  // コード進行を持たない曲では「伴奏で歌う」を出さない
  const steps = useMemo(() => buildSteps((analyzed?.meta.chords.length ?? 0) > 0), [analyzed])

  // キーと曲名は最後のステップで初めて明かす
  const revealed = step === steps.length - 1
  // 楽譜には T: 行として曲名が出る。ヘッダーだけ伏せても、そこから割れてしまう
  const hideTitle = blind && !revealed

  const derived = useMemo(() => {
    if (!analyzed || !choice) return null
    const targetKey: Key = choice.key
    const parsed = analyzed.parsed
    const syllables = store.settings.showSolfa ? analyzed.syllables : null
    const title = hideTitle ? `Lv${analyzed.level} の曲` : analyzed.meta.title

    return {
      targetKey,
      targetTonicMidi: toMidi(targetKey.tonic),
      rhythmAbc: renderAbcSource(parsed, {
        variant: 'rhythm',
        originalKey: analyzed.originalKey,
        targetKey,
        syllables,
        title,
        barsPerLine,
      }),
      pitchAbc: renderAbcSource(parsed, {
        variant: 'pitch',
        originalKey: analyzed.originalKey,
        targetKey,
        syllables,
        title,
        barsPerLine,
      }),
      soundingToElement: soundingToElementIndex(parsed),
      plan: buildPlaybackPlan({
        song: parsed,
        originalKey: analyzed.originalKey,
        targetKey,
        mode: analyzed.meta.mode,
        chords: analyzed.meta.chords,
      }),
    }
  }, [analyzed, choice, store.settings.showSolfa, barsPerLine, hideTitle])

  const stop = useCallback(() => {
    handleRef.current?.stop()
    handleRef.current = null
    setPlaying(false)
    setCursor(null)
  }, [])

  const play = useCallback(async () => {
    if (!analyzed || !derived) return
    const def = steps[step]
    setPlaying(true)
    setError(null)

    try {
      // Tone.start() をユーザー操作のハンドラ内で await する。
      // これを外すと自動再生ポリシーにより無音になる。
      const engine = await getEngine()

      handleRef.current = engine.playScore({
        plan: derived.plan,
        baseBpm: analyzed.meta.baseBpm,
        tempoRatio,
        withMelody: def.melody,
        withAccompaniment: def.accompaniment,
        metronome: store.settings.metronome,
        onCursor: setCursor,
        onEnd: () => {
          handleRef.current = null
          setPlaying(false)
        },
      })
    } catch (e) {
      // 音が出ない原因を黙って飲み込まない
      setError(`音を鳴らせませんでした: ${(e as Error).message}`)
      setPlaying(false)
    }
  }, [analyzed, derived, step, steps, tempoRatio, store.settings.metronome])

  /**
   * 主和音を鳴らす。どのステップからでも押せる。
   *
   * 自力で歌っている最中に調のセンターを見失うことがよくあるので、
   * 「調を聴く」を独立したステップにせず、いつでも聴き直せるボタンにした。
   */
  const playTonic = useCallback(async () => {
    if (!analyzed || !derived) return
    stop()
    setCueing(true)
    setError(null)
    try {
      const engine = await getEngine()
      await engine.playTonicChord(
        derived.targetTonicMidi,
        analyzed.meta.mode,
        analyzed.meta.baseBpm * tempoRatio,
      )
    } catch (e) {
      setError(`音を鳴らせませんでした: ${(e as Error).message}`)
    } finally {
      setCueing(false)
    }
  }, [analyzed, derived, stop, tempoRatio])

  const changeStep = (next: number) => {
    stop()
    setStep(next)
  }

  if (error) {
    return (
      <div className="mx-auto max-w-3xl p-4">
        <p className="text-red-600 dark:text-red-400">{error}</p>
        <Link to="/" className="text-sky-600 underline">
          曲一覧に戻る
        </Link>
      </div>
    )
  }
  if (!analyzed || !derived || !choice) {
    return <p className="p-4 text-slate-500">読み込み中…</p>
  }

  const def = steps[step]
  const progress = progressOf(store, analyzed.meta.id)
  // 速さは曲ごとの基準テンポに対する倍率として持つが、表示と操作は BPM で行う。
  // 「85%」より「82 BPM」のほうが、実際に何拍で歌うのかが分かる。
  const tempo = bpmRange(analyzed.meta.baseBpm, tempoRatio)

  return (
    <div className="mx-auto max-w-3xl p-4 pb-24">
      <header className="mb-4">
        <Link to="/" className="text-sm text-sky-600 hover:underline dark:text-sky-400">
          ← 曲一覧
        </Link>
        {blind && !revealed ? (
          <>
            <h1 className="mt-1 text-xl font-semibold text-slate-400 dark:text-slate-500">
              Lv{analyzed.level} の曲
            </h1>
            <p className="text-xs text-slate-500">
              曲名は最後のステップで明かされます（曲名から旋律が分かってしまうため）
            </p>
          </>
        ) : (
          <>
            <h1 className="mt-1 text-xl font-semibold">{analyzed.meta.title}</h1>
            <p className="text-xs text-slate-500">
              {analyzed.meta.titleEn && analyzed.meta.titleEn !== analyzed.meta.title
                ? `${analyzed.meta.titleEn} · `
                : ''}
              {analyzed.meta.source}
            </p>
          </>
        )}
      </header>

      <nav className="mb-4 flex flex-wrap gap-1">
        {steps.map((s, i) => (
          <button
            key={s.title}
            type="button"
            onClick={() => changeStep(i)}
            className={`rounded px-2.5 py-1 text-xs ${
              i === step
                ? 'bg-sky-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
            }`}
          >
            {i}. {s.title}
          </button>
        ))}
      </nav>

      <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">{def.hint}</p>

      {choice.outOfRange && (
        <p className="mb-3 rounded bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          この曲は設定した音域に収まりません。いちばん近いキーで鳴らします。
        </p>
      )}

      <div className="score mb-4 rounded border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
        <AbcScore
          abc={def.variant === 'pitch' ? derived.pitchAbc : derived.rhythmAbc}
          cursorIndex={cursor}
          soundingToElement={derived.soundingToElement}
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={playing ? stop : play}
          className="rounded bg-sky-600 px-4 py-2 font-medium text-white hover:bg-sky-700"
        >
          {playing ? '停止' : '再生'}
        </button>

        <button
          type="button"
          onClick={playTonic}
          disabled={cueing}
          className="rounded border border-sky-600 px-3 py-2 text-sm font-medium text-sky-700 hover:bg-sky-50 disabled:opacity-50 dark:text-sky-400 dark:hover:bg-sky-950"
        >
          {cueing ? '鳴らしています…' : '調を鳴らす'}
        </button>

        <label className="flex items-center gap-2 text-sm">
          <span className="text-slate-500">速さ</span>
          <input
            type="range"
            min={tempo.minBpm}
            max={tempo.maxBpm}
            step={2}
            value={tempo.bpm}
            onChange={(e) => {
              const ratio = ratioFromBpm(analyzed.meta.baseBpm, Number(e.target.value))
              update((s) => ({ ...s, settings: { ...s.settings, tempoRatio: ratio } }))
              // 再生中でもスケジュール済みのイベントごと追従する
              handleRef.current?.setTempo(ratio)
            }}
          />
          <span className="w-16 tabular-nums text-slate-500">{tempo.bpm} BPM</span>
        </label>

        <label className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-400">
          <input
            type="checkbox"
            checked={store.settings.metronome}
            onChange={(e) =>
              update((s) => ({ ...s, settings: { ...s.settings, metronome: e.target.checked } }))
            }
          />
          メトロノーム
        </label>

        <label className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-400">
          <input
            type="checkbox"
            checked={store.settings.showSolfa}
            onChange={(e) =>
              update((s) => ({ ...s, settings: { ...s.settings, showSolfa: e.target.checked } }))
            }
          />
          階名を表示
        </label>
      </div>

      <p className="mb-6 text-xs text-slate-400">
        {revealed
          ? `キー: ${analyzed.meta.mode === 'major' ? 'do' : 'la'} = ${pitchName(choice.key.tonic).replace(/-?\d+$/, '')}`
          : `キーは曲を開くたびにランダムに変わります（「${steps[steps.length - 1].title}」で判明）`}
      </p>

      {revealed && (
        <button
          type="button"
          onClick={() => update((s) => markCompleted(s, analyzed.meta.id))}
          className={`rounded px-4 py-2 font-medium ${
            progress.completed
              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200'
              : 'bg-emerald-600 text-white hover:bg-emerald-700'
          }`}
        >
          {progress.completed ? `できた（${progress.practiceCount} 回）` : 'できた'}
        </button>
      )}
    </div>
  )
}
