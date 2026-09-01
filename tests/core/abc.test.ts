import abcjs from 'abcjs'
import { describe, expect, it } from 'vitest'
import {
  analyzeSolfa,
  noteEvents,
  parseAbc,
  pickupBeats,
  renderAbcSource,
  soundingNotes,
  type ParsedNote,
} from '../../src/core/abc'
import { parsePitch, pitchName, toMidi } from '../../src/core/pitch'
import type { Key } from '../../src/core/solfa'
import { spellTonic } from '../../src/core/transpose'

/** ふるさと 冒頭。ヨナ抜き長音階 = do-ペンタトニック。弱起。 */
const FURUSATO = `X:1
M:3/4
L:1/4
K:F
C | F F G | A2 A | G G A | F2
`

const fKey: Key = { tonic: parsePitch('F4'), mode: 'major' }

/**
 * abcjs の型定義に `lyric` が無いので、必要な形だけをここで宣言する。
 * 実際の構造は `parseOnly` の出力で確認済み。
 */
interface RawNote {
  el_type: string
  duration: number
  rest?: unknown
  pitches?: Array<{ name: string }>
  lyric?: Array<{ syllable: string }>
}

/** 生成した ABC を読み直して、音符と歌詞の対応を取り出す */
function readBack(abc: string) {
  const tune = abcjs.parseOnly(abc)[0]
  const out: Array<{ name: string; duration: number; lyric: string; rest: boolean }> = []
  for (const line of tune.lines) {
    for (const staff of line.staff ?? []) {
      for (const voice of staff.voices ?? []) {
        for (const raw of voice) {
          const el = raw as unknown as RawNote
          if (el.el_type !== 'note') continue
          out.push({
            name: el.rest ? 'z' : (el.pitches?.[0]?.name ?? '?'),
            duration: el.duration,
            lyric: el.lyric?.[0]?.syllable ?? '',
            rest: Boolean(el.rest),
          })
        }
      }
    }
  }
  return out
}

describe('ABC の解析', () => {
  it('調号を音符に適用する', () => {
    // K:F なので B は自動的に Bb になる
    const song = parseAbc('X:1\nM:4/4\nL:1/4\nK:F\nB A G F |]\n')
    const names = soundingNotes(song).map((n) => pitchName(n.pitch!))
    expect(names).toEqual(['Bb4', 'A4', 'G4', 'F4'])
  })

  it('臨時記号は小節内で持続し、小節線で解除される', () => {
    const song = parseAbc('X:1\nM:4/4\nL:1/4\nK:C\n^F F G A | F F G A |]\n')
    const names = soundingNotes(song).map((n) => pitchName(n.pitch!))
    expect(names.slice(0, 2)).toEqual(['F#4', 'F#4']) // 同じ小節内は持続
    expect(names[4]).toBe('F4') // 次の小節では解除
  })

  it('臨時記号はオクターブごとに独立している', () => {
    const song = parseAbc('X:1\nM:4/4\nL:1/4\nK:C\n^F f F f |]\n')
    const names = soundingNotes(song).map((n) => pitchName(n.pitch!))
    expect(names).toEqual(['F#4', 'F5', 'F#4', 'F5'])
  })

  it('タイの継続には soundingIndex を与えない', () => {
    const song = parseAbc('X:1\nM:4/4\nL:1/4\nK:C\nC D- D E |]\n')
    const notes = song.elements.filter((e): e is ParsedNote => e.kind === 'note')
    expect(notes.map((n) => n.soundingIndex)).toEqual([0, 1, null, 2])
    expect(song.soundingCount).toBe(3)
  })

  it('弱起を検出する', () => {
    expect(pickupBeats(parseAbc(FURUSATO))).toBe(1)
    expect(pickupBeats(parseAbc('X:1\nM:4/4\nL:1/4\nK:C\nC D E F |]\n'))).toBe(0)
  })

  it('未対応の記法は例外を投げる', () => {
    expect(() => parseAbc('X:1\nM:4/4\nL:1/4\nK:C\n[CEG]4 |]\n')).toThrow(/単旋律のみ/)
  })
})

describe('リズム譜', () => {
  const song = parseAbc(FURUSATO)
  const { syllables } = analyzeSolfa(song, fKey)
  const rhythm = renderAbcSource(song, {
    variant: 'rhythm',
    originalKey: fKey,
    targetKey: { tonic: parsePitch('D4'), mode: 'major' },
    syllables,
    title: 'ふるさと',
  })

  it('階名は do-ペンタトニックになる', () => {
    expect(syllables).toEqual(['so', 'do', 'do', 're', 'mi', 'mi', 're', 're', 'mi', 'do'])
  })

  it('符頭がすべて同じ高さ（ト音記号第2間の A）に並ぶ', () => {
    const back = readBack(rhythm)
    expect(back.every((n) => n.name === 'A')).toBe(true)
  })

  it('調号が付かない', () => {
    expect(rhythm).toContain('K:C clef=treble')
  })

  it('音価が保存される', () => {
    expect(readBack(rhythm).map((n) => n.duration)).toEqual(
      soundingNotes(song).map((n) => n.duration),
    )
  })

  it('階名が正しい音符に付く', () => {
    expect(readBack(rhythm).map((n) => n.lyric)).toEqual(syllables)
  })

  it('移調しても中身が変わらない（リズム譜は調に依存しない）', () => {
    const other = renderAbcSource(song, {
      variant: 'rhythm',
      originalKey: fKey,
      targetKey: { tonic: parsePitch('Bb3'), mode: 'major' },
      syllables,
      title: 'ふるさと',
    })
    expect(other).toBe(rhythm)
  })
})

describe('実音譜', () => {
  const song = parseAbc(FURUSATO)
  const { syllables } = analyzeSolfa(song, fKey)

  it('移調後の実音と調号になる', () => {
    const target: Key = { tonic: parsePitch('D4'), mode: 'major' }
    const abc = renderAbcSource(song, {
      variant: 'pitch',
      originalKey: fKey,
      targetKey: target,
      syllables,
    })
    expect(abc).toContain('K:D clef=treble')

    const back = readBack(abc)
    // F→D の移調（-3半音）
    const expected = soundingNotes(song).map((n) => toMidi(n.pitch!) - 3)
    const got = parseAbc(abc)
    expect(soundingNotes(got).map((n) => toMidi(n.pitch!))).toEqual(expected)
    expect(back.map((n) => n.lyric)).toEqual(syllables)
  })

  it('12 キーすべてで、読み直しても階名が一致する', () => {
    for (let shift = -11; shift <= 11; shift++) {
      const target: Key = { tonic: spellTonic(toMidi(fKey.tonic) + shift, 'major'), mode: 'major' }
      const abc = renderAbcSource(song, {
        variant: 'pitch',
        originalKey: fKey,
        targetKey: target,
        syllables,
      })
      const reparsed = parseAbc(abc)
      const again = analyzeSolfa(reparsed, target)
      expect(again.syllables, `do=${pitchName(target.tonic)}`).toEqual(syllables)
      expect(
        soundingNotes(reparsed).map((n) => toMidi(n.pitch!)),
        `do=${pitchName(target.tonic)}`,
      ).toEqual(soundingNotes(song).map((n) => toMidi(n.pitch!) + shift))
    }
  })

  it('派生音を含む短調でも往復する', () => {
    const src = 'X:1\nM:4/4\nL:1/4\nK:Am\nA c e d | c B ^G A |]\n'
    const song = parseAbc(src)
    const key: Key = { tonic: parsePitch('A3'), mode: 'minor' }
    const { syllables } = analyzeSolfa(song, key)
    expect(syllables).toEqual(['la', 'do', 'mi', 're', 'do', 'ti', 'si', 'la'])

    for (let shift = -11; shift <= 11; shift++) {
      const target: Key = { tonic: spellTonic(toMidi(key.tonic) + shift, 'minor'), mode: 'minor' }
      const abc = renderAbcSource(song, {
        variant: 'pitch',
        originalKey: key,
        targetKey: target,
        syllables,
      })
      const again = analyzeSolfa(parseAbc(abc), target)
      expect(again.syllables, `la=${pitchName(target.tonic)}`).toEqual(syllables)
    }
  })
})

describe('休符とタイの歌詞スロット', () => {
  const src = 'X:1\nM:4/4\nL:1/4\nK:C\nC z D- D | E F G2 |]\n'
  const song = parseAbc(src)
  const key: Key = { tonic: parsePitch('C4'), mode: 'major' }
  const { syllables } = analyzeSolfa(song, key)

  it('発音する音符にだけ階名が付く', () => {
    expect(syllables).toEqual(['do', 're', 'mi', 'fa', 'so'])

    const abc = renderAbcSource(song, {
      variant: 'rhythm',
      originalKey: key,
      targetKey: key,
      syllables,
    })
    const back = readBack(abc)
    expect(back.map((n) => n.lyric)).toEqual(['do', '', 're', '', 'mi', 'fa', 'so'])
    expect(back[1].rest).toBe(true)
  })
})

describe('再生イベント', () => {
  it('タイをまとめ、拍で位置を出す', () => {
    const song = parseAbc('X:1\nM:4/4\nL:1/4\nK:C\nC D- D E |]\n')
    const key: Key = { tonic: parsePitch('C4'), mode: 'major' }
    const events = noteEvents(song, key, key)
    expect(events).toEqual([
      { index: 0, midi: 60, timeBeats: 0, durationBeats: 1 },
      { index: 1, midi: 62, timeBeats: 1, durationBeats: 2 },
      { index: 2, midi: 64, timeBeats: 3, durationBeats: 1 },
    ])
  })

  it('移調が反映される', () => {
    const song = parseAbc(FURUSATO)
    const target: Key = { tonic: parsePitch('D4'), mode: 'major' }
    const events = noteEvents(song, fKey, target)
    expect(events[0].midi).toBe(toMidi(parsePitch('A3'))) // so = A3
    expect(events[1].midi).toBe(toMidi(parsePitch('D4'))) // do = D4
  })

  it('index が階名の並びと一致する', () => {
    const song = parseAbc(FURUSATO)
    const { syllables } = analyzeSolfa(song, fKey)
    const events = noteEvents(song, fKey, fKey)
    expect(events.map((e) => e.index)).toEqual(syllables.map((_, i) => i))
  })
})
