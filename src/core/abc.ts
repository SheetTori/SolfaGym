import abcjs from 'abcjs'
import { STEP_LETTERS, toMidi, type Pitch, type Step } from './pitch'
import { solfaOf, type Key, type SolfaToken } from './solfa'
import { transposePitch, transposerBetween } from './transpose'

/**
 * 曲データの正本は ABC 記法テキスト。ここではそれを一度だけ解析して
 * 中立な音符列にし、そこから2種類の楽譜（リズム譜／実音譜）と
 * 再生用のイベント列を生成する。
 *
 * 対応する ABC の範囲は意図的に狭く保ってある（単旋律・和音なし・
 * 連符なし・装飾音なし）。範囲外の記法に出会ったら例外を投げるので、
 * 曲データ検証テストが必ず捕まえる。
 */

/** abcjs の pitch は C4 を 0 とする全音階上の位置。こちらの基準に合わせる */
const ABC_PITCH_ORIGIN = 4 * 7

const ACC_TO_ALTER: Record<string, number> = {
  sharp: 1,
  flat: -1,
  natural: 0,
  dblsharp: 2,
  dblflat: -2,
}

export interface ParsedNote {
  kind: 'note' | 'rest'
  /** 原調での実音。休符なら undefined */
  pitch?: Pitch
  /** 全音符を 1 とする音価 */
  duration: number
  /** 曲頭からの位置（全音符単位） */
  time: number
  startTie: boolean
  endTie: boolean
  /**
   * 発音する音符の通し番号。休符とタイの継続は null。
   * カーソル位置と階名の対応づけに使う。
   */
  soundingIndex: number | null
}

export interface ParsedBar {
  kind: 'bar'
  type: string
  startEnding?: string
  endEnding?: boolean
}

export type ParsedElement = ParsedNote | ParsedBar

export interface ParsedSong {
  meter: { num: number; den: number }
  elements: ParsedElement[]
  /** 発音する音符の数 */
  soundingCount: number
  minMidi: number
  maxMidi: number
  /** 全音符単位の総長 */
  totalDuration: number
}

function stepOf(diatonic: number): Step {
  return (((diatonic % 7) + 7) % 7) as Step
}

function octaveOf(diatonic: number): number {
  return Math.floor(diatonic / 7)
}

/** K: フィールドが宣言する調号を、音名ごとの変化量に開く */
function keySignatureAlters(signature: { accidentals?: Array<{ acc: string; note: string }> }) {
  const alters = [0, 0, 0, 0, 0, 0, 0]
  for (const a of signature.accidentals ?? []) {
    const step = STEP_LETTERS.indexOf(a.note.toUpperCase() as (typeof STEP_LETTERS)[number])
    if (step < 0) continue
    const alter = ACC_TO_ALTER[a.acc]
    if (alter === undefined) throw new Error(`未対応の調号記号: ${a.acc}`)
    alters[step] = alter
  }
  return alters
}

export function parseAbc(abc: string): ParsedSong {
  const tunes = abcjs.parseOnly(abc)
  if (tunes.length !== 1) throw new Error(`ABC には曲がちょうど1つ必要: ${tunes.length} 個`)
  const tune = tunes[0]

  const meterValue = tune.getMeter?.()?.value?.[0]
  const meter = meterValue
    ? { num: Number(meterValue.num), den: Number(meterValue.den) }
    : { num: 4, den: 4 }

  const ksAlters = keySignatureAlters(tune.getKeySignature?.() ?? {})

  const elements: ParsedElement[] = []
  let time = 0
  let soundingIndex = 0
  let minMidi = Infinity
  let maxMidi = -Infinity
  /** 小節内で有効な臨時記号。オクターブごとに独立させる（記譜の標準） */
  let barAccidentals = new Map<number, number>()

  for (const line of tune.lines) {
    for (const staff of line.staff ?? []) {
      for (const voice of staff.voices ?? []) {
        for (const el of voice) {
          if (el.el_type === 'bar') {
            barAccidentals = new Map()
            elements.push({
              kind: 'bar',
              type: el.type,
              startEnding: el.startEnding,
              endEnding: el.endEnding,
            })
            continue
          }
          if (el.el_type !== 'note') {
            throw new Error(`未対応の ABC 要素: ${el.el_type}`)
          }

          if (el.rest) {
            elements.push({
              kind: 'rest',
              duration: el.duration,
              time,
              startTie: false,
              endTie: false,
              soundingIndex: null,
            })
            time += el.duration
            continue
          }

          if (!el.pitches || el.pitches.length !== 1) {
            throw new Error('単旋律のみ対応（和音は不可）')
          }
          const p = el.pitches[0]
          const diatonic = p.pitch + ABC_PITCH_ORIGIN
          const step = stepOf(diatonic)

          let alter: number
          if (p.accidental) {
            const a = ACC_TO_ALTER[p.accidental]
            if (a === undefined) throw new Error(`未対応の臨時記号: ${p.accidental}`)
            alter = a
            barAccidentals.set(diatonic, a)
          } else if (barAccidentals.has(diatonic)) {
            alter = barAccidentals.get(diatonic)!
          } else {
            alter = ksAlters[step]
          }

          const pitch: Pitch = { step, alter, octave: octaveOf(diatonic) }
          const midi = toMidi(pitch)
          minMidi = Math.min(minMidi, midi)
          maxMidi = Math.max(maxMidi, midi)

          const endTie = Boolean(p.endTie)
          elements.push({
            kind: 'note',
            pitch,
            duration: el.duration,
            time,
            startTie: Boolean(p.startTie),
            endTie,
            soundingIndex: endTie ? null : soundingIndex++,
          })
          time += el.duration
        }
      }
    }
  }

  if (!Number.isFinite(minMidi)) throw new Error('音符が1つも無い')

  return {
    meter,
    elements,
    soundingCount: soundingIndex,
    minMidi,
    maxMidi,
    totalDuration: time,
  }
}

/** 発音する音符だけを、曲順に取り出す */
export function soundingNotes(song: ParsedSong): ParsedNote[] {
  return song.elements.filter((e): e is ParsedNote => e.kind === 'note' && e.soundingIndex !== null)
}

/** タイでつながった音符の合計長。再生時はタイ全体で1音として鳴らす */
export function tiedDuration(song: ParsedSong, startAt: number): number {
  let total = 0
  for (let i = startAt; i < song.elements.length; i++) {
    const e = song.elements[i]
    if (e.kind === 'bar') continue
    if (i === startAt) {
      total += e.duration
      if (!e.startTie) break
      continue
    }
    if (e.kind !== 'note') break
    total += e.duration
    if (!e.startTie) break
  }
  return total
}

/**
 * 発音する音符の通し番号 → 譜面上の要素位置（休符とタイ継続を含む通し番号）。
 * 描画後の SVG を DOM 順に引いた配列と、この位置で対応が取れる。
 */
export function soundingToElementIndex(song: ParsedSong): number[] {
  const out: number[] = []
  let elementIndex = 0
  for (const el of song.elements) {
    if (el.kind === 'bar') continue
    if (el.soundingIndex !== null) out[el.soundingIndex] = elementIndex
    elementIndex++
  }
  return out
}

/** 繰り返し記号（`|:` `:|` `::`）を含むか */
export function hasRepeats(song: ParsedSong): boolean {
  return song.elements.some((e) => e.kind === 'bar' && e.type.includes('repeat'))
}

/**
 * ヴォルタ（1番括弧・2番括弧）を含むか。
 *
 * 単純な繰り返しは走査で扱えるが、ヴォルタは周回数による分岐が要る。
 * 今は未対応なので、含む曲はデータ検証で弾く。
 */
export function hasVoltas(song: ParsedSong): boolean {
  return song.elements.some((e) => e.kind === 'bar' && e.startEnding !== undefined)
}

/**
 * 再生時にたどる要素インデックスの列。
 *
 * 繰り返しを**譜面上は展開せず**、走査の順序としてだけ開く。こうすると
 * 譜面は実際の楽譜どおり短いまま、再生とカーソルは繰り返しに追従する。
 *
 * 規則:
 *  - `|:` はそこから先を「繰り返す区間の先頭」にする
 *  - `:|` は初回のみ区間の先頭へ戻る。2回目は素通りする
 *  - `::` は「戻る」と「新しい区間の先頭」を兼ねる
 *  - `|:` が無いまま `:|` に出会ったら曲頭へ戻る（記譜の慣習どおり）
 */
export function traversalOrder(song: ParsedSong): number[] {
  const out: number[] = []
  const consumed = new Set<number>()
  let sectionStart = 0
  let i = 0
  // 壊れた繰り返し構造で無限ループしないための保険
  const limit = song.elements.length * 8 + 64

  while (i < song.elements.length) {
    if (out.length > limit) throw new Error('繰り返しの構造を解決できない')
    out.push(i)
    const el = song.elements[i]

    if (el.kind === 'bar') {
      if (el.type === 'bar_left_repeat') {
        sectionStart = i + 1
      } else if (el.type === 'bar_right_repeat' || el.type === 'bar_dbl_repeat') {
        if (!consumed.has(i)) {
          consumed.add(i)
          i = sectionStart
          continue
        }
        // 2周目。`::` はここから次の区間が始まる
        if (el.type === 'bar_dbl_repeat') sectionStart = i + 1
      }
    }
    i++
  }
  return out
}

/**
 * 走査上の位置 t から始まるタイの合計長（全音符単位）。
 *
 * 繰り返しをまたぐタイは想定しないが、走査の順序で見ているので
 * 同じ音符が2周目に現れても正しく数えられる。
 */
export function tiedDurationInTraversal(
  song: ParsedSong,
  traversal: readonly number[],
  t: number,
): number {
  let total = 0
  for (let k = t; k < traversal.length; k++) {
    const e = song.elements[traversal[k]]
    if (e.kind === 'bar') continue
    if (k === t) {
      total += e.duration
      if (!e.startTie) break
      continue
    }
    if (e.kind !== 'note') break
    total += e.duration
    if (!e.startTie) break
  }
  return total
}

export interface SolfaAnalysis {
  tokens: SolfaToken[]
  /** 発音する音符と同じ並び。カーソルの index で引ける */
  syllables: string[]
}

export function analyzeSolfa(song: ParsedSong, key: Key): SolfaAnalysis {
  const tokens = soundingNotes(song).map((n) => solfaOf(n.pitch!, key))
  return { tokens, syllables: tokens.map((t) => t.syllable) }
}

// --- ABC の生成 ---------------------------------------------------------

const UNIT_CANDIDATES = [1 / 4, 1 / 8, 1 / 16, 1 / 32, 1 / 64]

function chooseUnitLength(song: ParsedSong): number {
  for (const unit of UNIT_CANDIDATES) {
    const ok = song.elements.every((e) => {
      if (e.kind === 'bar') return true
      const n = e.duration / unit
      return Math.abs(n - Math.round(n)) < 1e-9
    })
    if (ok) return unit
  }
  throw new Error('音価を 1/64 単位で表せない（連符は未対応）')
}

function durationSuffix(duration: number, unit: number): string {
  const n = Math.round(duration / unit)
  return n === 1 ? '' : String(n)
}

const ALTER_GLYPH: Record<number, string> = {
  [-2]: '__',
  [-1]: '_',
  0: '=',
  1: '^',
  2: '^^',
}

const OCTAVE_UP = String.fromCharCode(39) // アポストロフィ

function abcPitchText(p: Pitch, accidental: string): string {
  const letter = STEP_LETTERS[p.step]
  if (p.octave >= 5) return accidental + letter.toLowerCase() + OCTAVE_UP.repeat(p.octave - 5)
  return accidental + letter + ','.repeat(Math.max(0, 4 - p.octave))
}

function barText(bar: ParsedBar): string {
  switch (bar.type) {
    case 'bar_left_repeat':
      return '|:'
    case 'bar_right_repeat':
      return ':|'
    case 'bar_dbl_repeat':
      return '::'
    case 'bar_double':
    case 'bar_thin_thin':
      return '||'
    case 'bar_thin_thick':
      return '|]'
    default:
      return '|'
  }
}

/** 調から ABC の K: フィールド文字列を作る */
export function keyFieldName(key: Key): string {
  const acc = key.tonic.alter > 0 ? '#'.repeat(key.tonic.alter) : 'b'.repeat(-key.tonic.alter)
  return `${STEP_LETTERS[key.tonic.step]}${acc}${key.mode === 'minor' ? 'm' : ''}`
}

/** その調の調号が、各音名に与える変化量 */
export function alterFromKeySignature(key: Key): number[] {
  const degrees = key.mode === 'major' ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10]
  const alters = [0, 0, 0, 0, 0, 0, 0]
  for (let d = 0; d < 7; d++) {
    const p = transposePitch(key.tonic, d, degrees[d])
    alters[p.step] = p.alter
  }
  return alters
}

export type ScoreVariant = 'rhythm' | 'pitch'

export interface RenderOptions {
  variant: ScoreVariant
  /** 原調。階名の算出に使う */
  originalKey: Key
  /** 実際に鳴らす調。実音譜の調号になる */
  targetKey: Key
  syllables?: readonly string[] | null
  title?: string
  barsPerLine?: number
}

/** リズム譜で符頭を置く位置: ト音記号の第2間の A */
const RHYTHM_PITCH: Pitch = { step: 5, alter: 0, octave: 4 }

/**
 * ABC 文字列を組み立てる。
 *
 * - `rhythm`: 全音高を A に潰し、調号なし。音高の手がかりを消して
 *   階名だけで歌わせるための譜。
 * - `pitch`: 実際に鳴っているキーに移調し、調号を付ける。
 *
 * 階名は `w:` 歌詞行で与える。abcjs は歌詞を音符に紐づけて保持するので、
 * 折り返しがあっても対応がずれない。休符とタイの継続は `*` でスロットを
 * 空読みさせる（abcjs はこの2つにも歌詞スロットを割り当てるため）。
 */
export function renderAbcSource(song: ParsedSong, opts: RenderOptions): string {
  const unit = chooseUnitLength(song)
  const barsPerLine = opts.barsPerLine ?? 4
  const isRhythm = opts.variant === 'rhythm'
  const move = isRhythm ? null : transposerBetween(opts.originalKey.tonic, opts.targetKey.tonic)
  const ksAlters = isRhythm ? [0, 0, 0, 0, 0, 0, 0] : alterFromKeySignature(opts.targetKey)

  const header = [
    'X:1',
    opts.title ? `T:${opts.title}` : null,
    `M:${song.meter.num}/${song.meter.den}`,
    `L:1/${Math.round(1 / unit)}`,
    `K:${isRhythm ? 'C' : keyFieldName(opts.targetKey)} clef=treble`,
  ].filter((x): x is string => x !== null)

  const lines: string[] = []
  let music: string[] = []
  let lyrics: string[] = []
  let barsOnLine = 0
  let barAccidentals = new Map<number, number>()

  const flush = () => {
    if (music.length === 0) return
    lines.push(music.join(' '))
    if (opts.syllables && lyrics.some((s) => s !== '*')) lines.push(`w:${lyrics.join(' ')}`)
    music = []
    lyrics = []
    barsOnLine = 0
  }

  for (const el of song.elements) {
    if (el.kind === 'bar') {
      music.push(barText(el))
      barAccidentals = new Map()
      barsOnLine++
      if (barsOnLine >= barsPerLine && el.type !== 'bar_left_repeat') flush()
      continue
    }

    if (el.kind === 'rest') {
      music.push(`z${durationSuffix(el.duration, unit)}`)
      lyrics.push('*')
      continue
    }

    const shown = isRhythm ? RHYTHM_PITCH : move!(el.pitch!)

    let accidental = ''
    if (!isRhythm) {
      const diatonic = shown.octave * 7 + shown.step
      const effective = barAccidentals.has(diatonic)
        ? barAccidentals.get(diatonic)!
        : ksAlters[shown.step]
      if (shown.alter !== effective) {
        const glyph = ALTER_GLYPH[shown.alter]
        if (glyph === undefined) throw new Error(`未対応の変化量: ${shown.alter}`)
        accidental = glyph
        barAccidentals.set(diatonic, shown.alter)
      }
    }

    const tie = el.startTie ? '-' : ''
    music.push(abcPitchText(shown, accidental) + durationSuffix(el.duration, unit) + tie)
    lyrics.push(
      el.soundingIndex !== null && opts.syllables?.[el.soundingIndex]
        ? opts.syllables[el.soundingIndex]
        : '*',
    )
  }
  flush()

  return [...header, ...lines].join('\n') + '\n'
}

// --- 再生用イベント -----------------------------------------------------

export interface NoteEvent {
  /** カーソルの対応づけに使う、発音する音符の通し番号 */
  index: number
  midi: number
  /** 曲頭からの位置（拍） */
  timeBeats: number
  durationBeats: number
}

/**
 * 再生用のイベント列。タイでつながった音符は1つにまとめる。
 * 拍は「4分音符 = 1拍」で数える。
 */
export function noteEvents(song: ParsedSong, originalKey: Key, targetKey: Key): NoteEvent[] {
  const move = transposerBetween(originalKey.tonic, targetKey.tonic)
  const events: NoteEvent[] = []
  for (let i = 0; i < song.elements.length; i++) {
    const el = song.elements[i]
    if (el.kind !== 'note' || el.soundingIndex === null) continue
    events.push({
      index: el.soundingIndex,
      midi: toMidi(move(el.pitch!)),
      timeBeats: el.time * 4,
      durationBeats: tiedDuration(song, i) * 4,
    })
  }
  return events
}

export function beatsPerBar(song: ParsedSong): number {
  return (song.meter.num / song.meter.den) * 4
}

/** アウフタクト（弱起）の長さ。カウントインの拍数を決めるのに使う */
export function pickupBeats(song: ParsedSong): number {
  const barLength = beatsPerBar(song)
  let firstBarAt = 0
  for (const el of song.elements) {
    if (el.kind === 'bar') break
    firstBarAt += el.duration * 4
  }
  const remainder = firstBarAt % barLength
  return Math.abs(remainder) < 1e-9 ? 0 : remainder
}

/**
 * カウントインの拍数。
 *
 * 「1小節分のクリック」を基本としつつ、弱起があるときは曲の小節線が
 * 絶対拍の beatsPerBar の倍数にちょうど乗るよう調整する。こうすると
 * カウントイン中も本編中も `beat % beatsPerBar === 0` が小節頭になり、
 * アクセントの計算が1つの式で済む。
 */
export function countInBeatsFor(song: ParsedSong): number {
  const perBar = beatsPerBar(song)
  return perBar + ((perBar - pickupBeats(song)) % perBar)
}

export interface BarOccurrence {
  /** 譜面上の小節番号。弱起の不完全小節は 0 番、最初の完全小節が 1 番 */
  bar: number
  /** 再生上の開始位置（拍）。繰り返しがあれば同じ小節が複数回現れる */
  startBeat: number
}

/**
 * 走査順に見た小節の出現。伴奏和音を置く位置の算出に使う。
 *
 * 繰り返しがあると **同じ譜面上の小節が複数回鳴る**ので、Map ではなく
 * 出現の配列を返す。和音は譜面上の小節に紐づくので、その全出現で鳴る。
 */
/**
 * 各要素が譜面上の何小節目に属するか、およびその小節の先頭かどうか。
 *
 * **小節番号は譜面上の位置で決まる**。走査の途中で数えると、繰り返しの
 * 2周目で番号が増え続けてしまい、譜面上の小節に紐づけた和音と対応しなくなる。
 */
function barLayout(song: ParsedSong): { barOf: number[]; isFirstOfBar: boolean[] } {
  const barOf = new Array<number>(song.elements.length).fill(0)
  const isFirstOfBar = new Array<boolean>(song.elements.length).fill(false)
  let barNumber = pickupBeats(song) > 0 ? 0 : 1
  let seenNote = false
  let expectingFirst = true

  for (let i = 0; i < song.elements.length; i++) {
    const el = song.elements[i]
    if (el.kind === 'bar') {
      barOf[i] = barNumber
      // 曲頭の反復記号など、音符より前の小節線は数えない
      if (seenNote) {
        barNumber++
        expectingFirst = true
      }
      continue
    }
    barOf[i] = barNumber
    if (expectingFirst) {
      isFirstOfBar[i] = true
      expectingFirst = false
    }
    seenNote = true
  }
  return { barOf, isFirstOfBar }
}

export function barOccurrences(song: ParsedSong, traversal?: readonly number[]): BarOccurrence[] {
  const order = traversal ?? traversalOrder(song)
  const { barOf, isFirstOfBar } = barLayout(song)
  const occurrences: BarOccurrence[] = []
  let beat = 0

  for (const index of order) {
    const el = song.elements[index]
    // 小節線そのものは時間を進めない
    if (el.kind === 'bar') continue
    // 「その小節の最初の音」に来るたびに1回の出現とする。
    // 繰り返しで同じ小節に戻ったときも、ここで正しく新しい出現になる
    if (isFirstOfBar[index]) occurrences.push({ bar: barOf[index], startBeat: beat })
    beat += el.duration * 4
  }
  return occurrences
}

/**
 * 伴奏和音の位置（拍）を解決する。
 * 繰り返しがあれば、その小節が鳴るたびに和音も鳴る。
 */
export function resolveChordBeats(
  song: ParsedSong,
  chords: ReadonlyArray<{ bar: number; beat: number; degree: string }>,
  traversal?: readonly number[],
): Array<{ timeBeats: number; degree: string }> {
  const occurrences = barOccurrences(song, traversal)
  const perBar = beatsPerBar(song)
  const knownBars = new Set(occurrences.map((o) => o.bar))

  const out: Array<{ timeBeats: number; degree: string }> = []
  for (const c of chords) {
    if (!knownBars.has(c.bar)) {
      throw new Error(`和音が存在しない小節を指している: bar=${c.bar}`)
    }
    if (c.beat >= perBar) {
      throw new Error(`和音の拍が小節をはみ出している: bar=${c.bar} beat=${c.beat}`)
    }
    for (const o of occurrences) {
      if (o.bar === c.bar) out.push({ timeBeats: o.startBeat + c.beat, degree: c.degree })
    }
  }
  return out.sort((a, b) => a.timeBeats - b.timeBeats)
}
