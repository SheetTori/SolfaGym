import { describe, expect, it } from 'vitest'
import { beatsPerBar, parseAbc, pickupBeats } from '../../src/core/abc'
import { buildPlaybackPlan, isDownbeat } from '../../src/core/playback'
import { parsePitch, toMidi } from '../../src/core/pitch'
import type { Key } from '../../src/core/solfa'

const cKey: Key = { tonic: parsePitch('C4'), mode: 'major' }
const fKey: Key = { tonic: parsePitch('F4'), mode: 'major' }

/** 弱起なし・4/4 */
const SQUARE = parseAbc('X:1\nM:4/4\nL:1/4\nK:C\nC D E F | G A B c |]\n')
/** 弱起 1拍・3/4 */
const PICKUP = parseAbc('X:1\nM:3/4\nL:1/4\nK:F\nC | F F G | A2 A |]\n')

describe('カウントインと小節頭', () => {
  it('弱起がなければ1小節分', () => {
    expect(pickupBeats(SQUARE)).toBe(0)
    expect(buildPlaybackPlan({
      song: SQUARE, originalKey: cKey, targetKey: cKey, mode: 'major', chords: [],
    }).countInBeats).toBe(4)
  })

  it('弱起があるとその分だけ伸ばす', () => {
    expect(pickupBeats(PICKUP)).toBe(1)
    // 3拍 + (3 - 1) = 5拍。弱起はカウントイン2小節目の3拍目に入る
    expect(buildPlaybackPlan({
      song: PICKUP, originalKey: fKey, targetKey: fKey, mode: 'major', chords: [],
    }).countInBeats).toBe(5)
  })

  it('どちらの場合も、曲の小節線が beatsPerBar の倍数に乗る', () => {
    for (const song of [SQUARE, PICKUP]) {
      const plan = buildPlaybackPlan({
        song, originalKey: cKey, targetKey: cKey, mode: 'major', chords: [],
      })
      const perBar = beatsPerBar(song)
      // 曲の最初の小節線 = カウントイン + 弱起
      const firstBarline = plan.countInBeats + pickupBeats(song)
      expect(firstBarline % perBar, `perBar=${perBar}`).toBe(0)
      expect(isDownbeat(firstBarline, perBar)).toBe(true)
    }
  })
})

describe('旋律の配置', () => {
  it('すべての音がカウントインの後に来る', () => {
    const plan = buildPlaybackPlan({
      song: SQUARE, originalKey: cKey, targetKey: cKey, mode: 'major', chords: [],
    })
    expect(plan.melody).toHaveLength(8)
    expect(plan.melody[0].startBeat).toBe(4)
    expect(plan.melody.map((n) => n.startBeat)).toEqual([4, 5, 6, 7, 8, 9, 10, 11])
    expect(plan.melody.every((n) => n.startBeat >= plan.countInBeats)).toBe(true)
  })

  it('index が抜けなく 0 から並ぶ（カーソルの対応づけ）', () => {
    const plan = buildPlaybackPlan({
      song: SQUARE, originalKey: cKey, targetKey: cKey, mode: 'major', chords: [],
    })
    expect(plan.melody.map((n) => n.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
  })

  it('移調が音高に反映される', () => {
    const target: Key = { tonic: parsePitch('Eb4'), mode: 'major' }
    const plan = buildPlaybackPlan({
      song: SQUARE, originalKey: cKey, targetKey: target, mode: 'major', chords: [],
    })
    expect(plan.melody[0].midi).toBe(toMidi(parsePitch('Eb4')))
    // 拍の位置は移調で変わらない
    expect(plan.melody.map((n) => n.startBeat)).toEqual([4, 5, 6, 7, 8, 9, 10, 11])
  })
})

describe('伴奏', () => {
  it('和音は次の和音まで伸び、最後は曲の終わりまで', () => {
    const plan = buildPlaybackPlan({
      song: SQUARE,
      originalKey: cKey,
      targetKey: cKey,
      mode: 'major',
      chords: [
        { bar: 1, beat: 0, degree: 'I' },
        { bar: 1, beat: 2, degree: 'V' },
        { bar: 2, beat: 0, degree: 'I' },
      ],
    })
    expect(plan.accompaniment.map((c) => [c.startBeat, c.durationBeats])).toEqual([
      [4, 2],
      [6, 2],
      [8, 4],
    ])
  })

  it('和音を持たない曲は主音のドローンになる', () => {
    const plan = buildPlaybackPlan({
      song: SQUARE, originalKey: cKey, targetKey: cKey, mode: 'major', chords: [],
    })
    expect(plan.accompaniment).toHaveLength(1)
    expect(plan.accompaniment[0].midis).toEqual([48, 60]) // C3 と C4
    expect(plan.accompaniment[0].startBeat).toBe(4)
    expect(plan.accompaniment[0].durationBeats).toBe(8)
  })

  it('ドローンも移調に追従する', () => {
    const target: Key = { tonic: parsePitch('A3'), mode: 'major' }
    const plan = buildPlaybackPlan({
      song: SQUARE, originalKey: cKey, targetKey: target, mode: 'major', chords: [],
    })
    expect(plan.accompaniment[0].midis).toEqual([45, 57]) // A2 と A3
  })

  it('短調の V7 は導音を含む（自然短音階の so ではなく si）', () => {
    const minorSong = parseAbc('X:1\nM:4/4\nL:1/4\nK:Am\nA B c d |]\n')
    const aMinor: Key = { tonic: parsePitch('A3'), mode: 'minor' }
    const plan = buildPlaybackPlan({
      song: minorSong,
      originalKey: aMinor,
      targetKey: aMinor,
      mode: 'minor',
      chords: [{ bar: 1, beat: 0, degree: 'V7' }],
    })
    const pcs = plan.accompaniment[0].midis.map((m) => m % 12).sort((a, b) => a - b)
    expect(pcs).toEqual([2, 4, 8, 11]) // D, E, G#, B
  })
})

describe('終了位置', () => {
  it('最後の音が鳴り終わる拍', () => {
    const plan = buildPlaybackPlan({
      song: SQUARE, originalKey: cKey, targetKey: cKey, mode: 'major', chords: [],
    })
    expect(plan.endBeat).toBe(12) // カウントイン4 + 8拍
  })

  it('タイでつながった音符は1つとして最後まで数える', () => {
    const tied = parseAbc('X:1\nM:4/4\nL:1/4\nK:C\nC D E F- | F3 z |]\n')
    const plan = buildPlaybackPlan({
      song: tied, originalKey: cKey, targetKey: cKey, mode: 'major', chords: [],
    })
    expect(plan.melody).toHaveLength(4)
    expect(plan.melody[3]).toMatchObject({ startBeat: 7, durationBeats: 4 })
    expect(plan.endBeat).toBe(11)
  })
})
