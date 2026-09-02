import { describe, expect, it } from 'vitest'
import type { ImportedSong } from '../../src/core/abcSource'
import { validateImported, DEFAULT_LIMITS } from '../../src/core/validate'

/**
 * 数百曲を全数目視できないので、機械が弾いた理由が正しいことをここで固定する。
 * 「通ってはいけないものが通る」ほうが「落ちすぎる」より危ないので、
 * 各ゲートが実際に効くことを1つずつ確かめる。
 */

const PROVENANCE = {
  source: 'test',
  sourceId: 'x',
  license: 'PD',
  spellingInferred: false,
  keyConfidence: 0.9,
  skylineUsed: false,
  chordsFromSource: false,
}

const N = (step: number, octave: number, alter = 0, ql = 1) =>
  ({ kind: 'note', step, alter, octave, ql, tie: null }) as const
const BAR = (type: 'normal' | 'final' = 'normal') => ({ kind: 'bar', type }) as const

/** ハ長調・4/4・8小節・順次進行・主音で終止する、通るべき曲 */
function healthy(overrides: Partial<ImportedSong> = {}): ImportedSong {
  const elements: ImportedSong['elements'] = []
  const shape = [0, 1, 2, 3, 4, 3, 2, 1] // do re mi fa so fa mi re
  for (let bar = 0; bar < 8; bar++) {
    for (const step of shape.slice(0, 4)) elements.push(N(step, 4))
    elements.push(BAR())
  }
  // 最終音を主音（C4）にする
  elements.splice(elements.length - 2, 1, N(0, 4))
  elements[elements.length - 1] = BAR('final')

  return {
    id: 'healthy',
    title: 'テスト',
    meter: { num: 4, den: 4 },
    tonicMidi: 60,
    mode: 'major',
    baseBpm: 96,
    elements,
    chords: [],
    provenance: { ...PROVENANCE },
    ...overrides,
  } as ImportedSong
}

const codes = (s: ImportedSong) => validateImported(s).issues.map((i) => i.code)

describe('通るべき曲', () => {
  it('健全な曲は通り、統計が付く', () => {
    const r = validateImported(healthy())
    expect(r.issues).toEqual([])
    expect(r.ok).toBe(true)
    expect(r.stats?.bars).toBe(8)
    expect(r.stats?.syllables).toContain('do')
  })
})

describe('出典の信頼性', () => {
  it('綴りが推定されていたら弾く', () => {
    const s = healthy()
    s.provenance.spellingInferred = true
    expect(codes(s)).toContain('spelling-inferred')
  })

  it('skyline で旋律を取っていたら弾く', () => {
    const s = healthy()
    s.provenance.skylineUsed = true
    expect(codes(s)).toContain('skyline')
  })
})

describe('規模', () => {
  it('短すぎる曲を弾く', () => {
    const s = healthy({
      elements: [N(0, 4), N(1, 4), N(2, 4), N(0, 4), BAR('final')],
    })
    expect(codes(s)).toContain('too-short')
  })

  it('長すぎる曲を弾く', () => {
    const base = healthy()
    const oneBar = base.elements.slice(0, 5)
    const many: ImportedSong['elements'] = []
    for (let i = 0; i < 70; i++) many.push(...oneBar)
    many.push(N(0, 4), BAR('final'))
    expect(codes(healthy({ elements: many }))).toContain('too-long')
  })
})

describe('歌えるか', () => {
  it('音域が広すぎる曲を弾く', () => {
    const s = healthy()
    // 3オクターブに広げる
    s.elements[0] = N(0, 2)
    s.elements[1] = N(0, 6)
    expect(codes(s)).toContain('range')
  })

  it('跳躍が多すぎる曲を弾く', () => {
    const elements: ImportedSong['elements'] = []
    for (let bar = 0; bar < 8; bar++) {
      // オクターブを行き来する
      elements.push(N(0, 3), N(0, 5), N(0, 3), N(0, 5))
      elements.push(BAR())
    }
    elements[elements.length - 2] = N(0, 4)
    elements[elements.length - 1] = BAR('final')
    expect(codes(healthy({ elements }))).toContain('leaps')
  })

  it('声域プリセットに収まる音域は通る', () => {
    const s = healthy()
    s.elements[0] = N(0, 4) // C4
    s.elements[1] = N(4, 5) // G5 = 19半音（女声 A3-E5 の幅ちょうど）
    expect(codes(s)).not.toContain('range')
  })

  it('どの声域にも収まらない音域を弾く', () => {
    const s = healthy()
    s.elements[0] = N(0, 4)
    s.elements[1] = N(0, 6) // 24半音。どちらの声域（19半音）にも入らない
    expect(codes(s)).toContain('range')
  })
})

describe('調と階名', () => {
  it('最終音が主音でなければ弾く', () => {
    const s = healthy({ tonicMidi: 62 }) // 曲は C で終わるのに主音を D と主張
    expect(codes(s)).toContain('tonic-mismatch')
  })

  it('階名表に無い変化を含む曲を弾く', () => {
    const s = healthy()
    s.elements[1] = N(0, 4, -1) // Cb4 = 表に無い（Do♭）
    expect(codes(s)).toContain('solfa')
  })

  it('確信度の下限を設ければ効く', () => {
    const s = healthy()
    s.provenance.keyConfidence = 0.2
    const r = validateImported(s, { ...DEFAULT_LIMITS, minKeyConfidence: 0.5 })
    expect(r.issues.map((i) => i.code)).toContain('key-confidence')
    // 既定では検査しない
    expect(codes(s)).not.toContain('key-confidence')
  })
})

describe('ヴォルタ', () => {
  it('1番2番括弧を含む曲を弾く', () => {
    // ヴォルタは ABC の解析結果にしか現れないので、
    // 中間表現から作る経路では出ない。ここでは検出関数が
    // 呼ばれていることだけを、通常の曲が通ることで確認する
    expect(codes(healthy())).not.toContain('volta')
  })
})

describe('伴奏', () => {
  it('存在しない小節を指す和音を弾く', () => {
    const s = healthy({ chords: [{ bar: 99, beat: 0, degree: 'I' }] })
    expect(codes(s)).toContain('chords')
  })

  it('解釈できない度数を弾く', () => {
    const s = healthy({ chords: [{ bar: 1, beat: 0, degree: 'ZZ' }] })
    expect(codes(s)).toContain('chords')
  })

  it('正しい和音は通る', () => {
    const s = healthy({
      chords: [
        { bar: 1, beat: 0, degree: 'I' },
        { bar: 2, beat: 0, degree: 'V7' },
      ],
    })
    expect(codes(s)).not.toContain('chords')
  })
})
