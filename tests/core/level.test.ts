import { describe, expect, it } from 'vitest'
import { parsePitch } from '../../src/core/pitch'
import { solfaOf, type Key } from '../../src/core/solfa'
import { computeLevel } from '../../src/core/level'

const level = (notes: string[], key: Key) =>
  computeLevel(notes.map((n) => solfaOf(parsePitch(n), key)), key.mode)

const C: Key = { tonic: parsePitch('C4'), mode: 'major' }
const Am: Key = { tonic: parsePitch('A3'), mode: 'minor' }

describe('レベル自動算出', () => {
  it('so-mi だけなら Lv1', () => {
    expect(level(['G4', 'E4', 'G4', 'E4'], C)).toBe(1)
  })

  it('la が加わると Lv2', () => {
    expect(level(['G4', 'E4', 'A4'], C)).toBe(2)
  })

  it('do が加わると Lv3', () => {
    expect(level(['G4', 'E4', 'A4', 'C4'], C)).toBe(3)
  })

  it('mi-re-do は Lv4（re を含むため）', () => {
    expect(level(['E4', 'D4', 'C4'], C)).toBe(4)
  })

  it('do-ペンタトニックは Lv4', () => {
    expect(level(['C4', 'D4', 'E4', 'G4', 'A4'], C)).toBe(4)
  })

  it('下の so, la に降りると Lv5', () => {
    expect(level(['C4', 'D4', 'E4', 'G3', 'A3'], C)).toBe(5)
  })

  it('上の do まで伸びても Lv5', () => {
    expect(level(['C4', 'E4', 'G4', 'A4', 'C5'], C)).toBe(5)
  })

  it('fa か ti が入ると Lv6', () => {
    expect(level(['C4', 'D4', 'E4', 'F4', 'G4'], C)).toBe(6)
    expect(level(['C4', 'E4', 'G4', 'B4'], C)).toBe(6)
  })

  it('短調は音の集合によらず Lv7', () => {
    expect(level(['A3', 'C4', 'E4'], Am)).toBe(7)
  })

  it('都節（さくらさくら）は Lv7', () => {
    expect(level(['A3', 'B3', 'C4', 'E4', 'F4'], Am)).toBe(7)
  })

  it('派生音があれば Lv8（短調より優先）', () => {
    expect(level(['A3', 'B3', 'C4', 'G#4'], Am)).toBe(8)
    expect(level(['C4', 'E4', 'F#4', 'G4'], C)).toBe(8)
  })
})
