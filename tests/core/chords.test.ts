import { describe, expect, it } from 'vitest'
import { chordMidi, parseDegree, tonicChordMidi } from '../../src/core/chords'
import { fromMidi, parsePitch, toMidi } from '../../src/core/pitch'
import { solfaOf } from '../../src/core/solfa'

describe('度数表記のパース', () => {
  it('大文字は長三和音、小文字は短三和音', () => {
    expect(parseDegree('I', 'major')).toEqual({ rootSemitone: 0, intervals: [0, 4, 7] })
    expect(parseDegree('vi', 'major')).toEqual({ rootSemitone: 9, intervals: [0, 3, 7] })
  })

  it('V7 は属七', () => {
    expect(parseDegree('V7', 'major')).toEqual({ rootSemitone: 7, intervals: [0, 4, 7, 10] })
  })

  it('vii° は減三和音', () => {
    expect(parseDegree('vii°', 'major')).toEqual({ rootSemitone: 11, intervals: [0, 3, 6] })
  })

  it('短調は自然短音階の度数を使う', () => {
    expect(parseDegree('i', 'minor').rootSemitone).toBe(0)
    expect(parseDegree('iv', 'minor').rootSemitone).toBe(5)
    expect(parseDegree('VII', 'minor').rootSemitone).toBe(10) // 自然短音階の ♭VII
  })

  it('変化記号の前置を受け付ける', () => {
    expect(parseDegree('bVI', 'major').rootSemitone).toBe(8)
  })
})

describe('短調の V7 は導音 si を含む', () => {
  it('イ短調の V7 は E G# B D になる', () => {
    // la = A3 (MIDI 57)
    const notes = chordMidi('V7', 57, 'minor')
    const pcs = notes.map((n) => ((n % 12) + 12) % 12).sort((a, b) => a - b)
    expect(pcs).toEqual([2, 4, 8, 11]) // D, E, G#, B

    // G# を階名にすると si
    const key = { tonic: parsePitch('A3'), mode: 'minor' as const }
    expect(solfaOf(parsePitch('G#4'), key).syllable).toBe('si')
  })
})

describe('伴奏の音域', () => {
  it('根音は C3〜B3 に畳まれる', () => {
    for (let tonic = 45; tonic <= 76; tonic++) {
      for (const d of ['I', 'IV', 'V7', 'vi']) {
        const root = chordMidi(d, tonic, 'major')[0]
        expect(root, `tonic=${tonic} ${d}`).toBeGreaterThanOrEqual(48)
        expect(root, `tonic=${tonic} ${d}`).toBeLessThan(60)
      }
    }
  })
})

describe('主和音', () => {
  it('長調は do-mi-so、短調は la-do-mi', () => {
    expect(tonicChordMidi(60, 'major').map((n) => toMidi(fromMidi(n)))).toHaveLength(3)
    expect(parseDegree('I', 'major').intervals).toEqual([0, 4, 7])
    expect(parseDegree('i', 'minor').intervals).toEqual([0, 3, 7])
  })
})
