import { describe, expect, it } from 'vitest'
import { chooseRandomSong } from '../../src/core/pickSong'
import type { SongIndexEntry } from '../../src/core/schema'

const song = (id: string): SongIndexEntry => ({
  id,
  title: id,
  source: 'test',
  mode: 'major',
  unit: 'kodaly',
  level: 4,
  hasChords: false,
  syllables: ['do'],
})

describe('ランダム出題の選曲', () => {
  const pool = [song('a'), song('b'), song('c')]

  it('空なら null', () => {
    expect(chooseRandomSong([], () => false)).toBeNull()
  })

  it('未クリアの曲を優先する', () => {
    const completed = new Set(['a', 'b'])
    for (let i = 0; i < 50; i++) {
      expect(chooseRandomSong(pool, (id) => completed.has(id))?.id).toBe('c')
    }
  })

  it('全部クリア済みなら全体から選ぶ', () => {
    const picked = new Set<string>()
    for (let i = 0; i < 200; i++) {
      picked.add(chooseRandomSong(pool, () => true)!.id)
    }
    expect(picked.size).toBe(3)
  })

  it('rng を差し込めば決定的になる', () => {
    expect(chooseRandomSong(pool, () => false, () => 0)?.id).toBe('a')
    expect(chooseRandomSong(pool, () => false, () => 0.99)?.id).toBe('c')
  })

  it('rng が 1 を返しても範囲外にならない', () => {
    expect(chooseRandomSong(pool, () => false, () => 1)?.id).toBe('c')
  })
})
