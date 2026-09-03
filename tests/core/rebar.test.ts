import { describe, expect, it } from 'vitest'
import { barQuarterLength, rebar, type ImportedSong } from '../../src/core/abcSource'

/** 音価だけ与えて、最小の取り込み曲を組み立てる */
function song(
  meter: { num: number; den: number },
  spec: Array<number | 'bar' | 'repeat-start' | 'repeat-end'>,
): ImportedSong {
  return {
    id: 'x',
    title: 'x',
    titleEn: null,
    language: null,
    meter,
    tonicMidi: 60,
    mode: 'major',
    baseBpm: 96,
    elements: spec.map((s) =>
      typeof s === 'number'
        ? ({ kind: 'note', step: 0, alter: 0, octave: 4, ql: s, tie: null } as const)
        : s === 'bar'
          ? ({ kind: 'bar', type: 'normal' } as const)
          : ({ kind: 'bar', type: s } as const),
    ),
    chords: [],
    provenance: {
      source: 'hand',
      sourceId: 'x',
      sourceUrl: 'x',
      license: 'PD',
      spellingInferred: false,
      keyConfidence: 1,
      skylineUsed: false,
      chordsFromSource: false,
    },
  } as ImportedSong
}

/** 引き直した結果の各小節の長さ */
function barLengths(s: ImportedSong): number[] {
  const out: number[] = []
  let current = 0
  for (const el of s.elements) {
    if (el.kind === 'bar') {
      out.push(current)
      current = 0
    } else {
      current += el.ql
    }
  }
  if (current > 0) out.push(current)
  return out
}

describe('barQuarterLength', () => {
  it('拍子から1小節の長さを出す', () => {
    expect(barQuarterLength({ num: 4, den: 4 })).toBe(4)
    expect(barQuarterLength({ num: 6, den: 8 })).toBe(3)
    expect(barQuarterLength({ num: 2, den: 2 })).toBe(4)
  })
})

describe('rebar', () => {
  it('正しい楽譜はそのままの小節割りを保つ', () => {
    const s = rebar(song({ num: 4, den: 4 }, [1, 1, 1, 1, 'bar', 2, 2, 'bar']))
    expect(barLengths(s!)).toEqual([4, 4])
  })

  it('割れてしまった小節をつなぎ直す', () => {
    // 3/4 の 1 小節が 2.0 + 1.0 に割れている
    const s = rebar(song({ num: 3, den: 4 }, [1, 1, 1, 'bar', 2, 'bar', 1, 'bar', 3, 'bar']))
    expect(barLengths(s!)).toEqual([3, 3, 3])
  })

  it('ずれた小節線を引き直す', () => {
    // 4/4 が 3.0 + 5.0 に割れている
    const s = rebar(song({ num: 4, den: 4 }, [4, 'bar', 3, 'bar', 1, 4, 'bar']))
    expect(barLengths(s!)).toEqual([4, 4, 4])
  })

  it('弱起を保ち、対になる最終小節も残す', () => {
    const s = rebar(song({ num: 4, den: 4 }, [1, 'bar', 4, 'bar', 3, 'bar']))
    expect(barLengths(s!)).toEqual([1, 4, 3])
  })

  it('繰り返し記号は位置を動かさない', () => {
    const s = rebar(song({ num: 4, den: 4 }, ['repeat-start', 4, 'bar', 4, 'repeat-end', 4, 'bar']))
    expect(s!.elements[0]).toEqual({ kind: 'bar', type: 'repeat-start' })
    expect(s!.elements.filter((e) => e.kind === 'bar').map((e) => e.type)).toEqual([
      'repeat-start',
      'normal',
      'repeat-end',
      'final',
    ])
  })

  it('弱起と対になる短い小節の繰り返し記号を認める', () => {
    // 弱起 1.0 + 段落末 3.0 で 1 小節
    const s = rebar(song({ num: 4, den: 4 }, [1, 'bar', 4, 'bar', 3, 'repeat-end', 4, 'bar']))
    expect(barLengths(s!)).toEqual([1, 4, 3, 4])
  })

  it('小節の途中に来る繰り返し記号は直せないので諦める', () => {
    expect(rebar(song({ num: 4, den: 4 }, [4, 'bar', 2, 'repeat-end', 2, 4, 'bar']))).toBeNull()
  })

  it('小節線をまたぐ音符は直せないので諦める（タイが要る）', () => {
    expect(rebar(song({ num: 4, den: 4 }, [3, 'bar', 2, 3, 'bar']))).toBeNull()
  })

  it('小節の長さが拍子と桁違いの楽譜は諦める', () => {
    // 2/2 と書いてあるのに 1 小節が 4 分音符 1 つ分。音価が 4 倍細かい
    const s = song({ num: 2, den: 2 }, [0.5, 0.5, 'bar', 0.5, 0.5, 'bar', 0.5, 0.5, 'bar'])
    expect(rebar(s)).toBeNull()
  })

  it('末尾は必ず終止線で終わる', () => {
    const s = rebar(song({ num: 4, den: 4 }, [4, 'bar', 4]))
    expect(s!.elements[s!.elements.length - 1]).toEqual({ kind: 'bar', type: 'final' })
  })
})
