import { describe, expect, it } from 'vitest'
import { analyzeSolfa, parseAbc, soundingNotes, type ParsedSong } from '../../src/core/abc'
import {
  emitAbc,
  importedKey,
  importedSongSchema,
  toParsedSong,
  type ImportedSong,
} from '../../src/core/abcSource'
import { pitchName, toMidi } from '../../src/core/pitch'
import { spellTonic } from '../../src/core/transpose'

/**
 * 取り込みパイプラインの要。
 *
 * 外部コーパスから起こした音符列を ABC にして、それを読み直したときに
 * **元の音高・音価・タイ・小節線に戻る**ことを固定する。ここが通っていれば、
 * 以降の取り込みで壊れるとしたら Python 側の抽出だけに絞り込める。
 */

const PROVENANCE = {
  source: 'test',
  sourceId: 'x',
  license: 'PD',
  spellingInferred: false,
  keyConfidence: null,
  skylineUsed: false,
  chordsFromSource: false,
}

function song(partial: Partial<ImportedSong>): ImportedSong {
  return {
    id: 'test-song',
    title: 'テスト',
    meter: { num: 4, den: 4 },
    tonicMidi: 60,
    mode: 'major',
    baseBpm: 96,
    elements: [],
    chords: [],
    provenance: PROVENANCE,
    ...partial,
  } as ImportedSong
}

const N = (step: number, alter: number, octave: number, ql: number, tie: 'start' | 'stop' | null = null) =>
  ({ kind: 'note', step, alter, octave, ql, tie }) as const
const R = (ql: number) => ({ kind: 'rest', ql }) as const
const BAR = (type: 'normal' | 'final' | 'repeat-start' | 'repeat-end' | 'double' = 'normal') =>
  ({ kind: 'bar', type }) as const

/** 往復した結果から、比較しやすい形を取り出す */
function shapeOf(parsed: ParsedSong) {
  return {
    notes: parsed.elements
      .filter((e) => e.kind !== 'bar')
      .map((e) =>
        e.kind === 'rest'
          ? { rest: true, duration: e.duration }
          : {
              name: pitchName(e.pitch!),
              duration: e.duration,
              startTie: e.startTie,
              endTie: e.endTie,
            },
      ),
    bars: parsed.elements.filter((e) => e.kind === 'bar').map((e) => e.type),
    meter: parsed.meter,
  }
}

describe('往復（音符列 → ABC → 音符列）', () => {
  it('全音階が戻る', () => {
    const s = song({
      elements: [
        N(0, 0, 4, 1), N(1, 0, 4, 1), N(2, 0, 4, 1), N(3, 0, 4, 1), BAR(),
        N(4, 0, 4, 1), N(5, 0, 4, 1), N(6, 0, 4, 1), N(0, 0, 5, 1), BAR('final'),
      ],
    })
    expect(shapeOf(parseAbc(emitAbc(s)))).toEqual(shapeOf(toParsedSong(s)))
  })

  it('臨時記号の綴りが戻る（Di と Ra を取り違えない）', () => {
    const s = song({
      elements: [
        N(0, 1, 4, 1), // C#4 = Di
        N(1, -1, 4, 1), // Db4 = Ra — MIDI では同じ 61
        N(3, 1, 4, 1), // F#4
        N(6, -1, 4, 1), // Bb4
        BAR('final'),
      ],
    })
    const back = parseAbc(emitAbc(s))
    expect(soundingNotes(back).map((n) => pitchName(n.pitch!))).toEqual([
      'C#4', 'Db4', 'F#4', 'Bb4',
    ])
    // 同じ音高クラスなのに別の綴りとして戻っていること
    expect(toMidi(soundingNotes(back)[0].pitch!)).toBe(toMidi(soundingNotes(back)[1].pitch!))
  })

  it('重変化記号が戻る', () => {
    const s = song({ elements: [N(0, 2, 4, 2), N(6, -2, 4, 2), BAR('final')] })
    expect(soundingNotes(parseAbc(emitAbc(s))).map((n) => pitchName(n.pitch!))).toEqual([
      'C##4', 'Bbb4',
    ])
  })

  it('オクターブが戻る（下加線から上加線まで）', () => {
    const s = song({
      elements: [
        N(0, 0, 2, 1), N(0, 0, 3, 1), N(0, 0, 4, 1), N(0, 0, 5, 1), BAR(),
        N(0, 0, 6, 1), N(5, 0, 2, 1), N(5, 0, 6, 2), BAR('final'),
      ],
    })
    expect(soundingNotes(parseAbc(emitAbc(s))).map((n) => pitchName(n.pitch!))).toEqual([
      'C2', 'C3', 'C4', 'C5', 'C6', 'A2', 'A6',
    ])
  })

  it('音価が戻る（付点・全音符・16分）', () => {
    const s = song({
      elements: [
        N(0, 0, 4, 0.25), N(1, 0, 4, 0.5), N(2, 0, 4, 0.75), N(3, 0, 4, 1),
        N(4, 0, 4, 1.5), BAR(), N(5, 0, 4, 4), BAR('final'),
      ],
    })
    const back = parseAbc(emitAbc(s))
    expect(back.elements.filter((e) => e.kind !== 'bar').map((e) => e.duration)).toEqual(
      [0.25, 0.5, 0.75, 1, 1.5, 4].map((ql) => ql / 4),
    )
  })

  it('休符が戻る', () => {
    const s = song({
      elements: [N(0, 0, 4, 1), R(1), N(2, 0, 4, 1), R(1), BAR('final')],
    })
    expect(shapeOf(parseAbc(emitAbc(s)))).toEqual(shapeOf(toParsedSong(s)))
  })

  it('タイが戻り、鳴る音の数が変わらない', () => {
    const s = song({
      elements: [N(0, 0, 4, 1), N(1, 0, 4, 1, 'start'), N(1, 0, 4, 1, 'stop'), N(2, 0, 4, 1), BAR('final')],
    })
    const back = parseAbc(emitAbc(s))
    expect(back.soundingCount).toBe(3)
    expect(shapeOf(back)).toEqual(shapeOf(toParsedSong(s)))
  })

  it('繰り返し記号が戻る', () => {
    const s = song({
      elements: [
        BAR('repeat-start'),
        N(0, 0, 4, 2), N(1, 0, 4, 2), BAR('repeat-end'),
        N(2, 0, 4, 2), N(3, 0, 4, 2), BAR('final'),
      ],
    })
    expect(shapeOf(parseAbc(emitAbc(s))).bars).toEqual([
      'bar_left_repeat', 'bar_right_repeat', 'bar_thin_thick',
    ])
  })

  it('拍子が戻る', () => {
    for (const meter of [
      { num: 2, den: 4 }, { num: 3, den: 4 }, { num: 4, den: 4 }, { num: 6, den: 8 },
    ]) {
      const s = song({ meter, elements: [N(0, 0, 4, 1), BAR('final')] })
      expect(parseAbc(emitAbc(s)).meter, JSON.stringify(meter)).toEqual(meter)
    }
  })
})

describe('調号の往復', () => {
  // 全音階を1オクターブ、どの調でも
  const scale = [0, 1, 2, 3, 4, 5, 6]

  it('12 の長調すべてで、綴りと音高が戻る', () => {
    for (let shift = -11; shift <= 11; shift++) {
      const tonicMidi = 60 + shift
      const tonic = spellTonic(tonicMidi, 'major')
      // その調の全音階を、綴りを保ったまま作る
      const degrees = [0, 2, 4, 5, 7, 9, 11]
      const elements = scale.map((d) => {
        const diatonic = tonic.octave * 7 + tonic.step + d
        const octave = Math.floor(diatonic / 7)
        const step = diatonic - octave * 7
        const naturalMidi = (octave + 1) * 12 + [0, 2, 4, 5, 7, 9, 11][step]
        return N(step, tonicMidi + degrees[d] - naturalMidi, octave, 1)
      })
      const s = song({
        tonicMidi,
        mode: 'major',
        elements: [...elements, BAR('final')],
      })
      const expected = toParsedSong(s)
      const back = parseAbc(emitAbc(s))
      expect(shapeOf(back), `do=${pitchName(tonic)}`).toEqual(shapeOf(expected))
      // 階名も全12調で同じ（移動ドの不変条件）
      expect(analyzeSolfa(back, importedKey(s)).syllables, `do=${pitchName(tonic)}`).toEqual([
        'do', 're', 'mi', 'fa', 'so', 'la', 'ti',
      ])
    }
  })

  it('短調でも綴りと階名が戻る', () => {
    for (let shift = -11; shift <= 11; shift++) {
      const tonicMidi = 57 + shift
      const tonic = spellTonic(tonicMidi, 'minor')
      const degrees = [0, 2, 3, 5, 7, 8, 10]
      const elements = scale.map((d) => {
        const diatonic = tonic.octave * 7 + tonic.step + d
        const octave = Math.floor(diatonic / 7)
        const step = diatonic - octave * 7
        const naturalMidi = (octave + 1) * 12 + [0, 2, 4, 5, 7, 9, 11][step]
        return N(step, tonicMidi + degrees[d] - naturalMidi, octave, 1)
      })
      const s = song({ tonicMidi, mode: 'minor', elements: [...elements, BAR('final')] })
      const back = parseAbc(emitAbc(s))
      expect(shapeOf(back), `la=${pitchName(tonic)}`).toEqual(shapeOf(toParsedSong(s)))
      expect(analyzeSolfa(back, importedKey(s)).syllables, `la=${pitchName(tonic)}`).toEqual([
        'la', 'ti', 'do', 're', 'mi', 'fa', 'so',
      ])
    }
  })
})

describe('スキーマ', () => {
  const valid = song({ elements: [N(0, 0, 4, 1), BAR('final')] })

  it('正しい形は通る', () => {
    expect(importedSongSchema.safeParse(valid).success).toBe(true)
  })

  it('id の形式を強制する', () => {
    expect(importedSongSchema.safeParse({ ...valid, id: 'Bad Id' }).success).toBe(false)
    expect(importedSongSchema.safeParse({ ...valid, id: 'good-id-2' }).success).toBe(true)
  })

  it('範囲外の音高を弾く', () => {
    const bad = { ...valid, elements: [{ kind: 'note', step: 7, alter: 0, octave: 4, ql: 1 }] }
    expect(importedSongSchema.safeParse(bad).success).toBe(false)
  })

  it('音価 0 を弾く', () => {
    const bad = { ...valid, elements: [{ kind: 'note', step: 0, alter: 0, octave: 4, ql: 0 }] }
    expect(importedSongSchema.safeParse(bad).success).toBe(false)
  })

  it('provenance を必須にする', () => {
    const { provenance: _omitted, ...withoutProvenance } = valid
    expect(importedSongSchema.safeParse(withoutProvenance).success).toBe(false)
  })

  it('音符が無ければ例外', () => {
    expect(() => toParsedSong(song({ elements: [BAR('final')] }))).toThrow(/音符が1つも無い/)
  })
})
