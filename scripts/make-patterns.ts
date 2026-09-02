import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Song } from '../src/core/schema'
import { analyzeSong } from '../src/core/song'

/**
 * コダーイの初期段階（Lv1〜3）の練習パターンを生成する。
 *
 * この段階に使える曲を含む、ライセンスがクリーンな機械可読コーパスは
 * 存在しない（適合するものは全て NC か教材への埋め込み禁止）。
 * 伝承曲を記憶から書き起こすと旋律が怪しくなるので、
 * **各レベルの階名集合から明示的にパターンを構成する**。
 * 構成物なので旋律の正確さは定義上保証される。
 *
 * so-mi の段階には do が無いため、パターンは mi や so で終止する。
 * 主音は旋律から導けないので曲データで宣言する（取り込み曲とは違う点）。
 */

const SONGS_DIR = join(process.cwd(), 'public', 'songs')

interface PatternSpec {
  id: string
  title: string
  /** 4/4 か 2/4。L:1/8 固定で書く */
  meter: '2/4' | '4/4' | '3/4'
  /** ABC の音符列（小節線込み）。do = C4 で書く */
  body: string
  chords: Array<{ bar: number; beat: number; degree: string }>
  bpm: number
}

/** do = C4 で書く。移調はアプリが担当する */
const TONIC_MIDI = 60

const PATTERNS: PatternSpec[] = [
  // --- Lv1: so-mi ---------------------------------------------------------
  {
    id: 'pattern-so-mi-1',
    title: '練習 so-mi ①',
    meter: '2/4',
    body: [
      'G2 G2 | E2 G2 | G2 E2 | G4 |',
      'G2 G2 | E2 G2 | G2 E2 | E4 |]',
    ].join('\n'),
    chords: Array.from({ length: 8 }, (_, i) => ({ bar: i + 1, beat: 0, degree: 'I' })),
    bpm: 96,
  },
  {
    id: 'pattern-so-mi-2',
    title: '練習 so-mi ②',
    meter: '2/4',
    body: [
      'G G G2 | E E E2 | G G E E | G4 |',
      'G G G2 | E E E2 | G E G E | E4 |]',
    ].join('\n'),
    chords: Array.from({ length: 8 }, (_, i) => ({ bar: i + 1, beat: 0, degree: 'I' })),
    bpm: 88,
  },
  {
    id: 'pattern-so-mi-3',
    title: '練習 so-mi ③',
    meter: '4/4',
    body: [
      'G2 E2 G2 E2 | G2 G2 E4 | E2 G2 E2 G2 | G2 E2 E4 |',
      'G2 E2 G2 E2 | G2 G2 E4 | G G E E G2 E2 | E8 |]',
    ].join('\n'),
    chords: Array.from({ length: 8 }, (_, i) => ({ bar: i + 1, beat: 0, degree: 'I' })),
    bpm: 92,
  },

  // --- Lv2: so-mi-la ------------------------------------------------------
  {
    id: 'pattern-so-mi-la-1',
    title: '練習 so-mi-la ①',
    meter: '2/4',
    body: [
      'G2 G2 | A2 G2 | E2 G2 | G4 |',
      'G2 A2 | G2 E2 | G2 E2 | E4 |]',
    ].join('\n'),
    chords: Array.from({ length: 8 }, (_, i) => ({ bar: i + 1, beat: 0, degree: 'I' })),
    bpm: 96,
  },
  {
    id: 'pattern-so-mi-la-2',
    title: '練習 so-mi-la ②',
    meter: '2/4',
    body: [
      'A2 G2 | E2 G2 | A2 A2 | G4 |',
      'G G A A | G2 E2 | G E G E | E4 |]',
    ].join('\n'),
    chords: Array.from({ length: 8 }, (_, i) => ({ bar: i + 1, beat: 0, degree: 'I' })),
    bpm: 92,
  },
  {
    id: 'pattern-so-mi-la-3',
    title: '練習 so-mi-la ③',
    meter: '4/4',
    body: [
      'G2 A2 G2 E2 | G2 G2 A4 | A2 G2 E2 G2 | G2 E2 E4 |',
      'G G A2 G2 E2 | A2 G2 G4 | G2 E2 A2 G2 | E8 |]',
    ].join('\n'),
    chords: Array.from({ length: 8 }, (_, i) => ({ bar: i + 1, beat: 0, degree: 'I' })),
    bpm: 96,
  },

  // --- Lv3: do-mi-so-la（re はまだ出さない） ------------------------------
  {
    id: 'pattern-do-mi-so-la-1',
    title: '練習 do-mi-so-la ①',
    meter: '2/4',
    body: [
      'C2 E2 | G2 E2 | C2 E2 | G4 |',
      'A2 G2 | E2 C2 | E2 G2 | C4 |]',
    ].join('\n'),
    chords: [
      { bar: 1, beat: 0, degree: 'I' },
      { bar: 2, beat: 0, degree: 'I' },
      { bar: 3, beat: 0, degree: 'I' },
      { bar: 4, beat: 0, degree: 'I' },
      { bar: 5, beat: 0, degree: 'vi' },
      { bar: 6, beat: 0, degree: 'I' },
      { bar: 7, beat: 0, degree: 'I' },
      { bar: 8, beat: 0, degree: 'I' },
    ],
    bpm: 96,
  },
  {
    id: 'pattern-do-mi-so-la-2',
    title: '練習 do-mi-so-la ②',
    meter: '2/4',
    body: [
      'C C E E | G2 G2 | A A G G | E4 |',
      'G G E E | C C E E | G2 E2 | C4 |]',
    ].join('\n'),
    chords: [
      { bar: 1, beat: 0, degree: 'I' },
      { bar: 2, beat: 0, degree: 'I' },
      { bar: 3, beat: 0, degree: 'vi' },
      { bar: 4, beat: 0, degree: 'I' },
      { bar: 5, beat: 0, degree: 'I' },
      { bar: 6, beat: 0, degree: 'I' },
      { bar: 7, beat: 0, degree: 'I' },
      { bar: 8, beat: 0, degree: 'I' },
    ],
    bpm: 92,
  },
  {
    id: 'pattern-do-mi-so-la-3',
    title: '練習 do-mi-so-la ③',
    meter: '4/4',
    body: [
      'C2 E2 G2 A2 | G2 E2 C4 | E2 G2 A2 G2 | E2 C2 C4 |',
      'G2 A2 G2 E2 | C2 E2 G4 | A2 G2 E2 C2 | C8 |]',
    ].join('\n'),
    chords: [
      { bar: 1, beat: 0, degree: 'I' },
      { bar: 2, beat: 0, degree: 'I' },
      { bar: 3, beat: 0, degree: 'vi' },
      { bar: 4, beat: 0, degree: 'I' },
      { bar: 5, beat: 0, degree: 'I' },
      { bar: 6, beat: 0, degree: 'I' },
      { bar: 7, beat: 0, degree: 'vi' },
      { bar: 8, beat: 0, degree: 'I' },
    ],
    bpm: 96,
  },
]

function main() {
  for (const spec of PATTERNS) {
    const song: Song = {
      id: spec.id,
      title: spec.title,
      source: '練習パターン（本アプリ作成・CC0）',
      mode: 'major',
      tonicMidi: TONIC_MIDI,
      baseBpm: spec.bpm,
      unit: 'kodaly',
      chords: spec.chords,
      abc: `X:1\nT:${spec.title}\nM:${spec.meter}\nL:1/8\nK:C clef=treble\n${spec.body}\n`,
    }

    // 意図したレベルに落ちることを、書き出す前に確かめる
    const analyzed = analyzeSong(song)
    const expected = spec.id.startsWith('pattern-so-mi-la')
      ? 2
      : spec.id.startsWith('pattern-so-mi')
        ? 1
        : 3
    if (analyzed.level !== expected) {
      throw new Error(
        `${spec.id}: Lv${expected} のつもりが Lv${analyzed.level} になった（階名 ${analyzed.distinctSyllables.join(' ')}）`,
      )
    }

    writeFileSync(join(SONGS_DIR, `${song.id}.json`), JSON.stringify(song, null, 2) + '\n', 'utf8')
    console.log(`  Lv${analyzed.level} ${song.title} — ${analyzed.distinctSyllables.join(' ')}`)
  }
  console.log(`${PATTERNS.length} 件の練習パターンを書き出しました`)
}

main()
