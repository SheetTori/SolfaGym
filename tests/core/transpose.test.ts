import { describe, expect, it } from 'vitest'
import { parsePitch, pitchName, toMidi } from '../../src/core/pitch'
import {
  VOCAL_PRESETS,
  candidateKeys,
  chooseKey,
  spellTonic,
  transposePitch,
  transposerBetween,
} from '../../src/core/transpose'

describe('綴りを保った移調', () => {
  it('長2度上げると音名が1つ進む', () => {
    expect(pitchName(transposePitch(parsePitch('C4'), 1, 2))).toBe('D4')
    expect(pitchName(transposePitch(parsePitch('E4'), 1, 2))).toBe('F#4')
  })

  it('オクターブをまたぐ', () => {
    expect(pitchName(transposePitch(parsePitch('B3'), 1, 1))).toBe('C4')
  })

  it('主音間の移調が旋律全体に効く', () => {
    const move = transposerBetween(parsePitch('C4'), parsePitch('Eb4'))
    expect(['C4', 'D4', 'E4', 'F4', 'G4'].map((n) => pitchName(move(parsePitch(n))))).toEqual([
      'Eb4', 'F4', 'G4', 'Ab4', 'Bb4',
    ])
  })
})

describe('主音の綴り', () => {
  it('長調は調号が7つ以内に収まる綴りを選ぶ', () => {
    expect(pitchName(spellTonic(61, 'major'))).toBe('Db4') // C# 長調(7#)ではなく
    expect(pitchName(spellTonic(63, 'major'))).toBe('Eb4')
    expect(pitchName(spellTonic(70, 'major'))).toBe('Bb4')
  })

  it('短調は短調で慣用的な綴りを選ぶ', () => {
    expect(pitchName(spellTonic(61, 'minor'))).toBe('C#4') // Db 短調(8b)ではなく
    expect(pitchName(spellTonic(68, 'minor'))).toBe('G#4')
  })

  it('綴りと MIDI が往復する', () => {
    for (let midi = 45; midi <= 80; midi++) {
      expect(toMidi(spellTonic(midi, 'major'))).toBe(midi)
      expect(toMidi(spellTonic(midi, 'minor'))).toBe(midi)
    }
  })
})

describe('音域に収まるキーの選択', () => {
  // ふるさと相当: 原調 F(do=F4=65)、旋律 C4(60)〜D5(74)
  const song = { tonicMidi: 65, mode: 'major' as const, minMidi: 60, maxMidi: 74 }

  it('候補はすべて音域に収まる', () => {
    const range = VOCAL_PRESETS.female
    for (const c of candidateKeys({ ...song, range })) {
      expect(song.minMidi + c.semitoneShift).toBeGreaterThanOrEqual(range.lowMidi)
      expect(song.maxMidi + c.semitoneShift).toBeLessThanOrEqual(range.highMidi)
    }
  })

  it('候補は音高クラスで重複しない', () => {
    const cs = candidateKeys({ ...song, range: VOCAL_PRESETS.female })
    const pcs = cs.map((c) => (((song.tonicMidi + c.semitoneShift) % 12) + 12) % 12)
    expect(new Set(pcs).size).toBe(pcs.length)
  })

  it('選ばれたキーは必ず音域内', () => {
    const range = VOCAL_PRESETS.female
    for (let i = 0; i < 200; i++) {
      const r = chooseKey({ ...song, range })
      expect(r.outOfRange).toBe(false)
      expect(song.minMidi + r.semitoneShift).toBeGreaterThanOrEqual(range.lowMidi)
      expect(song.maxMidi + r.semitoneShift).toBeLessThanOrEqual(range.highMidi)
    }
  })

  it('直前と同じキーは選ばない', () => {
    const range = VOCAL_PRESETS.female
    const first = chooseKey({ ...song, range })
    for (let i = 0; i < 200; i++) {
      expect(chooseKey({ ...song, range }, first.semitoneShift).semitoneShift).not.toBe(
        first.semitoneShift,
      )
    }
  })

  it('rng を注入すると決定的になる', () => {
    const range = VOCAL_PRESETS.female
    const a = chooseKey({ ...song, range }, null, () => 0)
    const b = chooseKey({ ...song, range }, null, () => 0)
    expect(a.semitoneShift).toBe(b.semitoneShift)
  })

  it('どの移調でも収まらない曲でも例外を投げず最善を返す', () => {
    // 2オクターブ超の旋律 vs 狭い音域
    const wide = { tonicMidi: 60, mode: 'major' as const, minMidi: 48, maxMidi: 84 }
    const r = chooseKey({ ...wide, range: VOCAL_PRESETS.male })
    expect(r.outOfRange).toBe(true)
    expect(Number.isFinite(r.semitoneShift)).toBe(true)
    expect(candidateKeys({ ...wide, range: VOCAL_PRESETS.male })).toHaveLength(0)
  })
})
