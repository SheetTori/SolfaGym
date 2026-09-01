import type * as ToneNS from 'tone'
import {
  buildTonicCue,
  isDownbeat,
  tonicCueLengthBeats,
  type PlaybackPlan,
} from '../core/playback'
import type { Mode } from '../core/solfa'

/**
 * Tone.js をこのファイル1枚に閉じ込める。アプリ本体は Tone.js を知らない。
 *
 * 「いつ・どの音を」は core/playback.ts が拍で決めており、ここは拍を
 * ティックに直して Tone に渡すだけ。判断をここに持たせない。
 *
 * React に AudioContext のライフサイクルを持たせない。StrictMode の二重
 * マウントでシンセが2回作られ、2回目のクリーンアップで dispose されて
 * 無音になる事故を避けるため、エンジンはモジュールスコープの単一実体に
 * する。アンマウント時は dispose せず stop / cancel に留めること。
 */

type Tone = typeof ToneNS

export interface PlayScoreOptions {
  plan: PlaybackPlan
  baseBpm: number
  /** 0.5〜1.2 */
  tempoRatio: number
  withMelody: boolean
  withAccompaniment: boolean
  metronome: boolean
  onCursor: (index: number | null) => void
  onEnd?: () => void
}

export interface PlaybackHandle {
  setTempo(ratio: number): void
  stop(): void
}

let tonePromise: Promise<Tone> | null = null
let engine: AudioEngine | null = null

/** 動的 import で Tone.js（約 80 KB gzip）を初期バンドルから外す */
function loadTone(): Promise<Tone> {
  tonePromise ??= import('tone')
  return tonePromise
}

/**
 * モジュールの取得だけ先に済ませておく。
 *
 * `Tone.start()` はユーザー操作の「一時的アクティベーション」の間に
 * 呼ばないと AudioContext が suspended のままになる。クリックしてから
 * 取得を始めると、回線が遅いときに取得の間にアクティベーションが切れて
 * 無音になる。読み込みだけ先に済ませておけば、クリック時には
 * `Tone.start()` を即座に呼べる。
 */
export function preloadAudio(): void {
  void loadTone().catch(() => {
    // 事前読み込みの失敗は無視する。再生時に改めて取得して報告する
    tonePromise = null
  })
}

/**
 * 必ずユーザー操作のハンドラの中から呼ぶこと。
 * Promise はキャッシュしない — `Tone.start()` が（アクティベーションが
 * 無いなどで）解決しなかったときに、次のクリックで再試行できるようにする。
 */
export async function getEngine(): Promise<AudioEngine> {
  const Tone = await loadTone()
  await Tone.start() // 既に running なら即座に解決する
  engine ??= new AudioEngine(Tone)
  return engine
}

interface MelodyEvent {
  time: string
  midi: number
  durationBeats: number
  index: number
}

interface ChordAudioEvent {
  time: string
  midis: number[]
  durationBeats: number
}

interface InternalPlayback {
  parts: Array<ToneNS.Part<unknown>>
  onCursor: (index: number | null) => void
}

class AudioEngine {
  private readonly tone: Tone
  private readonly melody: ToneNS.PolySynth
  private readonly accompaniment: ToneNS.PolySynth
  private readonly click: ToneNS.MembraneSynth
  private current: InternalPlayback | null = null

  constructor(tone: Tone) {
    this.tone = tone

    this.melody = new tone.PolySynth(tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.01, decay: 0.15, sustain: 0.7, release: 0.25 },
    }).toDestination()
    this.melody.volume.value = -6

    this.accompaniment = new tone.PolySynth(tone.Synth, {
      oscillator: { type: 'sine' },
      envelope: { attack: 0.02, decay: 0.3, sustain: 0.4, release: 0.5 },
    }).toDestination()
    this.accompaniment.volume.value = -18

    this.click = new tone.MembraneSynth({
      envelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.02 },
    }).toDestination()
    this.click.volume.value = -12
  }

  /**
   * Step 0: 調のセンターを耳に置くための提示。
   *
   * 主和音をアルペジオで1音ずつ鳴らし、1拍おいてから三音を同時に鳴らす
   * （何を・いつ鳴らすかは core/playback.ts が決める）。
   */
  async playTonicChord(tonicMidi: number, mode: Mode, bpm: number): Promise<void> {
    this.stop()

    const cue = buildTonicCue(tonicMidi, mode)
    const beat = 60 / bpm
    const start = this.tone.now() + 0.1

    // 提示の間だけ和音を前に出す。復帰は必ず finally で行う
    this.accompaniment.volume.value = -8

    try {
      for (const event of cue) {
        const at = start + event.startBeat * beat
        const length = event.durationBeats * beat
        // 単音は旋律の音色で高さを明瞭に、三音同時は和音の音色で響かせる
        const synth = event.midis.length === 1 ? this.melody : this.accompaniment
        synth.triggerAttackRelease(
          event.midis.map((m) => this.freq(m)),
          length,
          at,
        )
      }

      const totalSeconds = tonicCueLengthBeats(cue) * beat + 0.4
      await new Promise((resolve) => setTimeout(resolve, totalSeconds * 1000))
    } finally {
      this.accompaniment.volume.value = -18
    }
  }

  playScore(opts: PlayScoreOptions): PlaybackHandle {
    this.stop()

    const { tone } = this
    const { plan } = opts
    const transport = tone.getTransport()
    const draw = tone.getDraw()
    const ppq = transport.PPQ
    const ticks = (beats: number) => `${Math.round(beats * ppq)}i`

    transport.bpm.value = opts.baseBpm * opts.tempoRatio

    const parts: Array<ToneNS.Part<unknown>> = []

    if (plan.melody.length > 0) {
      const events: MelodyEvent[] = plan.melody.map((n) => ({
        time: ticks(n.startBeat),
        midi: n.midi,
        durationBeats: n.durationBeats,
        index: n.index,
      }))
      const part = new tone.Part<MelodyEvent>((time, ev) => {
        if (opts.withMelody) {
          this.melody.triggerAttackRelease(
            this.freq(ev.midi),
            ticks(Math.max(0.1, ev.durationBeats * 0.95)),
            time,
          )
        }
        // 音の発火と描画は必ず分ける。Draw は requestAnimationFrame 上で
        // 呼び、タブ復帰時に遅れて届いた古いイベントは捨ててくれる。
        draw.schedule(() => opts.onCursor(ev.index), time)
      }, events)
      part.start(0)
      parts.push(part as ToneNS.Part<unknown>)
    }

    if (opts.withAccompaniment && plan.accompaniment.length > 0) {
      const events: ChordAudioEvent[] = plan.accompaniment.map((c) => ({
        time: ticks(c.startBeat),
        midis: c.midis,
        durationBeats: c.durationBeats,
      }))
      const part = new tone.Part<ChordAudioEvent>((time, ev) => {
        this.accompaniment.triggerAttackRelease(
          ev.midis.map((m) => this.freq(m)),
          ticks(ev.durationBeats * 0.95),
          time,
        )
      }, events)
      part.start(0)
      parts.push(part as ToneNS.Part<unknown>)
    }

    if (opts.metronome || plan.countInBeats > 0) {
      transport.scheduleRepeat(
        (time) => {
          const beat = Math.round(transport.getTicksAtTime(time) / ppq)
          if (!opts.metronome && beat >= plan.countInBeats) return
          const accent = isDownbeat(beat, plan.beatsPerBar)
          this.click.triggerAttackRelease(accent ? 'C3' : 'C2', '32n', time)
        },
        '4n',
        0,
      )
    }

    // 後片付けは Draw 経由で音声コールバックの外に出す。
    // Transport のコールバック内で Part を止めると、時刻計算がごく僅かに
    // 負になって Tone 側の範囲チェックが投げることがある。
    transport.scheduleOnce(
      () => {
        draw.schedule(() => {
          this.stop()
          opts.onEnd?.()
        }, this.tone.now())
      },
      ticks(plan.endBeat + 1),
    )

    transport.position = 0
    // Wiki の推奨どおり、少し先の時刻から開始してスケジューリング誤差を避ける
    transport.start('+0.1')

    this.current = { parts, onCursor: opts.onCursor }

    return {
      setTempo: (ratio: number) => {
        // スケジュール済みのイベントもこれだけで追従する
        transport.bpm.value = opts.baseBpm * ratio
      },
      stop: () => this.stop(),
    }
  }

  stop(): void {
    const transport = this.tone.getTransport()
    transport.stop()
    transport.cancel(0)
    transport.position = 0
    if (this.current) {
      for (const part of this.current.parts) {
        // stop() は呼ばない。現在時刻との差が僅かに負になると投げる
        part.clear()
        part.dispose()
      }
      this.current.onCursor(null)
      this.current = null
    }
    this.melody.releaseAll()
    this.accompaniment.releaseAll()
  }

  private freq(midi: number): number {
    return this.tone.Frequency(midi, 'midi').toFrequency()
  }
}

export type { AudioEngine }
