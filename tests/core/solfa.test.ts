import { describe, expect, it } from 'vitest'
import { parsePitch, pitchName, toMidi } from '../../src/core/pitch'
import { solfaOf, type Key } from '../../src/core/solfa'
import { spellTonic, transposerBetween } from '../../src/core/transpose'

const cMajor: Key = { tonic: parsePitch('C4'), mode: 'major' }
const aMinor: Key = { tonic: parsePitch('A3'), mode: 'minor' }

const syl = (name: string, key: Key) => solfaOf(parsePitch(name), key).syllable

describe('長調（do 基準）の全音階', () => {
  it.each([
    ['C4', 'do'], ['D4', 're'], ['E4', 'mi'], ['F4', 'fa'],
    ['G4', 'so'], ['A4', 'la'], ['B4', 'ti'],
  ])('%s → %s', (name, expected) => {
    expect(syl(name, cMajor)).toBe(expected)
  })
})

describe('派生音の綴り（ユーザー指定の表そのまま）', () => {
  it.each([
    ['C#4', 'di'], ['Db4', 'ra'], ['D#4', 'ri'], ['Eb4', 'ma'],
    ['F#4', 'fi'], ['Gb4', 'sa'], ['G#4', 'si'], ['Ab4', 'lo'],
    ['A#4', 'li'], ['Bb4', 'ta'],
  ])('%s → %s', (name, expected) => {
    expect(syl(name, cMajor)).toBe(expected)
  })

  it('同じ音高クラスでも綴りが違えば階名が違う', () => {
    // Do# と Re♭ はどちらも MIDI 61 だが、Di と Ra に分かれる
    expect(toMidi(parsePitch('C#4'))).toBe(toMidi(parsePitch('Db4')))
    expect(syl('C#4', cMajor)).toBe('di')
    expect(syl('Db4', cMajor)).toBe('ra')
  })
})

describe('短調は la 基準', () => {
  it.each([
    ['A3', 'la'], ['B3', 'ti'], ['C4', 'do'], ['D4', 're'],
    ['E4', 'mi'], ['F4', 'fa'], ['G4', 'so'],
  ])('%s → %s', (name, expected) => {
    expect(syl(name, aMinor)).toBe(expected)
  })

  it('和声的短音階の導音は si', () => {
    expect(syl('G#4', aMinor)).toBe('si')
  })
})

describe('都節音階（さくらさくら）は派生音を含まない', () => {
  it('la-ti-do-mi-fa になる', () => {
    const notes = ['A3', 'B3', 'C4', 'E4', 'F4']
    expect(notes.map((n) => syl(n, aMinor))).toEqual(['la', 'ti', 'do', 'mi', 'fa'])
  })
})

describe('register（オクターブの段）', () => {
  it('主音のオクターブが 0、その下が -1、上が +1', () => {
    expect(solfaOf(parsePitch('C4'), cMajor)).toEqual({ syllable: 'do', register: 0 })
    expect(solfaOf(parsePitch('C3'), cMajor)).toEqual({ syllable: 'do', register: -1 })
    expect(solfaOf(parsePitch('C5'), cMajor)).toEqual({ syllable: 'do', register: 1 })
  })

  it('主音より下の so, la は register -1（コダーイの下方拡張）', () => {
    expect(solfaOf(parsePitch('G3'), cMajor)).toEqual({ syllable: 'so', register: -1 })
    expect(solfaOf(parsePitch('A3'), cMajor)).toEqual({ syllable: 'la', register: -1 })
  })
})

describe('階名表に無い変化は例外を投げる', () => {
  it.each(['Cb4', 'E#4', 'Fb4', 'B#4'])('%s は未定義', (name) => {
    expect(() => syl(name, cMajor)).toThrow(/階名表に無い変化/)
  })
})

describe('移動ドの不変条件', () => {
  // ふるさと 冒頭（ヨナ抜き長音階 = do-ペンタトニック）を原調 F で
  const melody = ['C4', 'F4', 'A4', 'A4', 'G4', 'F4', 'G4', 'G4', 'A4', 'F4']
  const originalTonic = parsePitch('F4')

  it('12 キーすべてに移調しても階名列が完全に一致する', () => {
    const original = melody.map((n) =>
      solfaOf(parsePitch(n), { tonic: originalTonic, mode: 'major' }),
    )

    for (let shift = -11; shift <= 11; shift++) {
      const newTonic = spellTonic(toMidi(originalTonic) + shift, 'major')
      const move = transposerBetween(originalTonic, newTonic)
      const transposed = melody.map((n) =>
        solfaOf(move(parsePitch(n)), { tonic: newTonic, mode: 'major' }),
      )
      expect(transposed, `shift=${shift} (do=${pitchName(newTonic)})`).toEqual(original)
    }
  })

  it('短調でも同じ', () => {
    const tune = ['A3', 'C4', 'E4', 'D4', 'C4', 'B3', 'G#3', 'A3']
    const tonic = parsePitch('A3')
    const original = tune.map((n) => solfaOf(parsePitch(n), { tonic, mode: 'minor' }))

    for (let shift = -11; shift <= 11; shift++) {
      const newTonic = spellTonic(toMidi(tonic) + shift, 'minor')
      const move = transposerBetween(tonic, newTonic)
      const transposed = tune.map((n) =>
        solfaOf(move(parsePitch(n)), { tonic: newTonic, mode: 'minor' }),
      )
      expect(transposed, `shift=${shift} (la=${pitchName(newTonic)})`).toEqual(original)
    }
  })
})
