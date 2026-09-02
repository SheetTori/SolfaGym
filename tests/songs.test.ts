import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { noteEvents, renderAbcSource, resolveChordBeats } from '../src/core/abc'
import { chordMidi } from '../src/core/chords'
import { songIndexSchema, songSchema, type Song } from '../src/core/schema'
import { ALL_SYLLABLES } from '../src/core/solfa'
import { analyzeSong, tonicMatchesAbcKey, tonicOctaveLooksRight } from '../src/core/song'
import { VOCAL_PRESETS, candidateKeys, spellTonic } from '../src/core/transpose'

const SONGS_DIR = join(process.cwd(), 'public', 'songs')

const files = readdirSync(SONGS_DIR)
  .filter((f) => f.endsWith('.json') && f !== 'index.json')
  .sort()

const songs: Array<{ file: string; song: Song }> = files.map((file) => ({
  file,
  song: songSchema.parse(JSON.parse(readFileSync(join(SONGS_DIR, file), 'utf8'))),
}))

/**
 * 12 キーへの移調テストは 1 曲あたり 23 回の再解析が要る。数千曲に掛けると
 * 分単位になるので、決定的な標本だけに掛ける。移動ドの不変条件そのものは
 * tests/core/solfa.test.ts と abcSource.test.ts で網羅的に固めてあるので、
 * ここは「取り込んだ実データでも成り立つ」ことの抜き取り確認でよい。
 */
const HEAVY_SAMPLE_SIZE = 60
const heavySample = new Set(
  songs
    .map((s, i) => ({ s, i }))
    .filter(({ i }) => i % Math.max(1, Math.ceil(songs.length / HEAVY_SAMPLE_SIZE)) === 0)
    .map(({ s }) => s.file),
)

it('曲が1曲以上ある', () => {
  expect(songs.length).toBeGreaterThan(0)
})

describe.each(songs)('$file', ({ file, song }) => {
  const analyzed = analyzeSong(song)

  it('id とファイル名が一致する', () => {
    expect(song.id).toBe(file.replace(/\.json$/, ''))
  })

  it('tonicMidi と ABC の K: が食い違わない', () => {
    expect(tonicMatchesAbcKey(song)).toBe(true)
  })

  it('tonicMidi のオクターブが旋律の音域と整合する', () => {
    expect(tonicOctaveLooksRight(analyzed)).toBe(true)
  })

  it('階名がすべて既知の綴り', () => {
    for (const s of analyzed.distinctSyllables) {
      expect(ALL_SYLLABLES as readonly string[]).toContain(s)
    }
  })

  it('和音がすべて曲の中に収まり、解釈できる', () => {
    const resolved = resolveChordBeats(analyzed.parsed, song.chords)
    for (const c of resolved) {
      expect(() => chordMidi(c.degree, song.tonicMidi, song.mode)).not.toThrow()
      expect(c.timeBeats).toBeGreaterThanOrEqual(0)
      expect(c.timeBeats).toBeLessThan(analyzed.parsed.totalDuration * 4)
    }
  })

  it('少なくとも片方の音域プリセットで歌えるキーがある', () => {
    const base = {
      tonicMidi: song.tonicMidi,
      mode: song.mode,
      minMidi: analyzed.minMidi,
      maxMidi: analyzed.maxMidi,
    }
    const female = candidateKeys({ ...base, range: VOCAL_PRESETS.female })
    const male = candidateKeys({ ...base, range: VOCAL_PRESETS.male })
    expect(female.length + male.length).toBeGreaterThan(0)
  })

  it.skipIf(!heavySample.has(file))('12 キーどこに移調しても階名列が変わらない', () => {
    for (let shift = -11; shift <= 11; shift++) {
      const targetKey = {
        tonic: spellTonic(song.tonicMidi + shift, song.mode),
        mode: song.mode,
      }
      const abc = renderAbcSource(analyzed.parsed, {
        variant: 'pitch',
        originalKey: analyzed.originalKey,
        targetKey,
        syllables: analyzed.syllables,
      })
      const again = analyzeSong({ ...song, abc, tonicMidi: song.tonicMidi + shift })
      expect(again.syllables, `shift=${shift}`).toEqual(analyzed.syllables)
      expect(again.level, `shift=${shift}`).toBe(analyzed.level)
    }
  })

  it('リズム譜は調に依存しない', () => {
    const make = (shift: number) =>
      renderAbcSource(analyzed.parsed, {
        variant: 'rhythm',
        originalKey: analyzed.originalKey,
        targetKey: { tonic: spellTonic(song.tonicMidi + shift, song.mode), mode: song.mode },
        syllables: analyzed.syllables,
      })
    expect(make(0)).toBe(make(5))
  })

  it('再生イベントが階名と1対1に対応する', () => {
    const events = noteEvents(analyzed.parsed, analyzed.originalKey, analyzed.originalKey)
    expect(events).toHaveLength(analyzed.syllables.length)
    expect(events.map((e) => e.index)).toEqual(analyzed.syllables.map((_, i) => i))
    // 時間が単調増加する
    for (let i = 1; i < events.length; i++) {
      expect(events[i].timeBeats).toBeGreaterThanOrEqual(events[i - 1].timeBeats)
    }
  })
})

describe('index.json', () => {
  it('スキーマを満たし、曲ファイルと一致する', () => {
    const index = songIndexSchema.parse(
      JSON.parse(readFileSync(join(SONGS_DIR, 'index.json'), 'utf8')),
    )
    expect(index.songs.map((s) => s.id).sort()).toEqual(songs.map((s) => s.song.id).sort())
  })

  it('レベルが再計算しても一致する（index が古くなっていない）', () => {
    const index = songIndexSchema.parse(
      JSON.parse(readFileSync(join(SONGS_DIR, 'index.json'), 'utf8')),
    )
    for (const entry of index.songs) {
      const found = songs.find((s) => s.song.id === entry.id)!
      const analyzed = analyzeSong(found.song)
      expect(entry.level, entry.id).toBe(analyzed.level)
      expect(entry.syllables, entry.id).toEqual(analyzed.distinctSyllables)
    }
  })
})
