import { describe, expect, it } from 'vitest'
import { formatBuildTime } from '../../src/core/buildTime'

describe('formatBuildTime', () => {
  it('日本時間に直して分まで出す', () => {
    // UTC 2026-09-03T03:47Z = JST 同日 12:47
    expect(formatBuildTime('2026-09-03T03:47:12.000Z')).toBe('2026/09/03 12:47')
  })

  it('日付をまたぐ時刻も日本時間で数える', () => {
    // UTC 2026-09-02T16:30Z = JST 翌日 01:30
    expect(formatBuildTime('2026-09-02T16:30:00.000Z')).toBe('2026/09/03 01:30')
  })

  it('読めない値では何も出さない', () => {
    expect(formatBuildTime('')).toBeNull()
    expect(formatBuildTime('まだビルドしていない')).toBeNull()
  })
})
