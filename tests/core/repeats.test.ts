import { describe, expect, it } from 'vitest'
import {
  barOccurrences,
  hasRepeats,
  hasVoltas,
  parseAbc,
  resolveChordBeats,
  soundingToElementIndex,
  traversalOrder,
} from '../../src/core/abc'
import { buildPlaybackPlan } from '../../src/core/playback'
import { parsePitch } from '../../src/core/pitch'
import type { Key } from '../../src/core/solfa'

/**
 * 繰り返しは譜面上では展開せず、走査の順序としてだけ開く。
 * 「譜面は1回、音は2回」でもカーソルが正しい音符を指すことがここの要。
 */

const cKey: Key = { tonic: parsePitch('C4'), mode: 'major' }

const plan = (abc: string, chords: Array<{ bar: number; beat: number; degree: string }> = []) => {
  const song = parseAbc(abc)
  return {
    song,
    ...buildPlaybackPlan({
      song,
      originalKey: cKey,
      targetKey: cKey,
      mode: 'major',
      chords,
    }),
  }
}

/** 鳴る順の階名相当（MIDI で見る） */
const midis = (p: ReturnType<typeof plan>) => p.melody.map((n) => n.midi)
/** カーソルが指す譜面上の音符の通し番号 */
const indices = (p: ReturnType<typeof plan>) => p.melody.map((n) => n.index)

describe('traversalOrder', () => {
  it('繰り返しが無ければ素通り', () => {
    const song = parseAbc('X:1\nM:4/4\nL:1/4\nK:C\nC D E F |]\n')
    expect(traversalOrder(song)).toEqual(song.elements.map((_, i) => i))
  })

  it('|: :| は区間を2回たどる', () => {
    const song = parseAbc('X:1\nM:4/4\nL:1/4\nK:C\n|: C D :| E F |]\n')
    const order = traversalOrder(song)
    const notes = order
      .map((i) => song.elements[i])
      .flatMap((e) => (e.kind === 'note' ? [e.soundingIndex] : []))
    expect(notes).toEqual([0, 1, 0, 1, 2, 3])
  })

  it('|: が無ければ曲頭へ戻る（記譜の慣習）', () => {
    const song = parseAbc('X:1\nM:4/4\nL:1/4\nK:C\nC D :| E F |]\n')
    const notes = traversalOrder(song)
      .map((i) => song.elements[i])
      .flatMap((e) => (e.kind === 'note' ? [e.soundingIndex] : []))
    expect(notes).toEqual([0, 1, 0, 1, 2, 3])
  })

  it('壊れた構造でも無限ループしない', () => {
    // 同じ :| を何度も踏んでも、2回目以降は素通りする
    const song = parseAbc('X:1\nM:4/4\nL:1/4\nK:C\n|: C :| |: D :| |: E :| F |]\n')
    expect(() => traversalOrder(song)).not.toThrow()
    expect(traversalOrder(song).length).toBeLessThan(song.elements.length * 8 + 64)
  })
})

describe('繰り返しの再生', () => {
  it('|: A :| B が A A B の順に鳴る', () => {
    const p = plan('X:1\nM:4/4\nL:1/4\nK:C\n|: C2 D2 :| E2 F2 |]\n')
    expect(midis(p)).toEqual([60, 62, 60, 62, 64, 65])
  })

  it('繰り返しても index は譜面上の通し番号のまま（カーソルが正しく光る）', () => {
    const p = plan('X:1\nM:4/4\nL:1/4\nK:C\n|: C2 D2 :| E2 F2 |]\n')
    expect(indices(p)).toEqual([0, 1, 0, 1, 2, 3])

    // その index は譜面上の音符に必ず解決できる。
    // soundingToElementIndex は「小節線を除いた通し番号」を返す
    // （描画後の SVG を DOM 順に引いた配列と揃える）
    const map = soundingToElementIndex(p.song)
    const drawn = p.song.elements.filter((e) => e.kind !== 'bar')
    for (const i of indices(p)) {
      expect(map[i], `index=${i}`).toBeTypeOf('number')
      expect(drawn[map[i]].kind, `index=${i}`).toBe('note')
    }
  })

  it('拍は繰り返しの分だけ進む', () => {
    const p = plan('X:1\nM:4/4\nL:1/4\nK:C\n|: C2 D2 :| E2 F2 |]\n')
    // カウントイン 4拍 + 各音2拍
    expect(p.melody.map((n) => n.startBeat)).toEqual([4, 6, 8, 10, 12, 14])
    expect(p.endBeat).toBe(16)
  })

  it(':: は「戻る」と「新しい区間の始まり」を兼ねる', () => {
    const p = plan('X:1\nM:4/4\nL:1/4\nK:C\n|: C4 :: D4 :|\n')
    // A A B B
    expect(midis(p)).toEqual([60, 60, 62, 62])
  })

  it('繰り返しの中のタイが、小節線をまたいで1音になる', () => {
    const p = plan('X:1\nM:4/4\nL:1/4\nK:C\n|: C2 D2- | D2 z2 :|\n')
    // 1周につき「C(2拍) と D(2+2=4拍のタイ)」の2音、それが2周
    expect(p.melody).toHaveLength(4)
    expect(p.melody.map((n) => n.durationBeats)).toEqual([2, 4, 2, 4])
    expect(indices(p)).toEqual([0, 1, 0, 1])
  })
})

describe('繰り返しと伴奏', () => {
  it('小節が2回鳴れば和音も2回鳴る', () => {
    const p = plan('X:1\nM:4/4\nL:1/4\nK:C\n|: C D E F | G A B c :|\n', [
      { bar: 1, beat: 0, degree: 'I' },
      { bar: 2, beat: 0, degree: 'V' },
    ])
    expect(p.accompaniment.map((c) => c.startBeat)).toEqual([4, 8, 12, 16])
  })

  it('小節の出現が走査に従う', () => {
    const song = parseAbc('X:1\nM:4/4\nL:1/4\nK:C\n|: C D E F :| G A B c |]\n')
    // 譜面上の小節1が2回、小節2が1回。番号は譜面上の位置で決まる
    expect(barOccurrences(song).map((o) => `${o.bar}@${o.startBeat}`)).toEqual([
      '1@0', '1@4', '2@8',
    ])
  })

  it('存在しない小節を指す和音は例外', () => {
    const song = parseAbc('X:1\nM:4/4\nL:1/4\nK:C\n|: C D E F :|\n')
    expect(() => resolveChordBeats(song, [{ bar: 9, beat: 0, degree: 'I' }])).toThrow(
      /存在しない小節/,
    )
  })
})

describe('ヴォルタの検出', () => {
  it('単純な繰り返しはヴォルタではない', () => {
    const song = parseAbc('X:1\nM:4/4\nL:1/4\nK:C\n|: C D E F :|\n')
    expect(hasRepeats(song)).toBe(true)
    expect(hasVoltas(song)).toBe(false)
  })

  it('1番2番括弧はヴォルタとして検出される', () => {
    const song = parseAbc('X:1\nM:4/4\nL:1/4\nK:C\n|: C D |[1 E F :|[2 G A |]\n')
    expect(hasVoltas(song)).toBe(true)
  })
})
