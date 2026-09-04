import { describe, expect, it } from 'vitest'
import { TEMPO_RATIO_MAX, TEMPO_RATIO_MIN, bpmRange, ratioFromBpm } from '../../src/core/tempo'

describe('bpmRange', () => {
  it('倍率を基準テンポに掛けて BPM にする', () => {
    expect(bpmRange(96, 1).bpm).toBe(96)
    expect(bpmRange(96, 0.75).bpm).toBe(72)
  })

  it('端を内側に丸めるので、戻した倍率が保存できる範囲を出ない', () => {
    for (const base of [61, 96, 100, 127, 144]) {
      const { minBpm, maxBpm } = bpmRange(base, 1)
      expect(minBpm / base).toBeGreaterThanOrEqual(TEMPO_RATIO_MIN)
      expect(maxBpm / base).toBeLessThanOrEqual(TEMPO_RATIO_MAX)
    }
  })

  it('可動域の外の倍率でも表示は可動域に収まる', () => {
    const { bpm, minBpm, maxBpm } = bpmRange(96, 3)
    expect(bpm).toBe(maxBpm)
    expect(bpmRange(96, 0.1).bpm).toBe(minBpm)
  })
})

describe('ratioFromBpm', () => {
  it('BPM を倍率に戻す', () => {
    expect(ratioFromBpm(96, 72)).toBeCloseTo(0.75)
  })

  it('保存できる範囲に収める', () => {
    expect(ratioFromBpm(96, 500)).toBe(TEMPO_RATIO_MAX)
    expect(ratioFromBpm(96, 1)).toBe(TEMPO_RATIO_MIN)
  })

  it('BPM と倍率を往復しても値が動かない', () => {
    const base = 96
    for (let bpm = bpmRange(base, 1).minBpm; bpm <= bpmRange(base, 1).maxBpm; bpm++) {
      expect(bpmRange(base, ratioFromBpm(base, bpm)).bpm).toBe(bpm)
    }
  })
})
