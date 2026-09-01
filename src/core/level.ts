import { isNatural, tokenKey, type Mode, type SolfaToken } from './solfa'

export const MAX_LEVEL = 8

export interface LevelInfo {
  level: number
  label: string
  description: string
}

export const LEVELS: readonly LevelInfo[] = [
  { level: 1, label: 'so-mi', description: '下行3度だけ' },
  { level: 2, label: 'so-mi-la', description: '3音' },
  { level: 3, label: 'do-mi-so-la', description: 'do の登場' },
  { level: 4, label: 'do-re-mi-so-la', description: 'ペンタトニック' },
  { level: 5, label: '音域拡張', description: '下の so, la と上の do' },
  { level: 6, label: '長音階', description: 'fa と ti が加わる' },
  { level: 7, label: '短調（la 基準）', description: 'la-ti-do-re-mi-fa-so' },
  { level: 8, label: '派生音', description: '転調・借用' },
]

/**
 * 各レベルで許される階名トークン（`${階名}${register}`）。
 * レベル 6 以降は register を問わないので表に持たない。
 */
const LEVEL_TOKENS: ReadonlyArray<readonly [number, ReadonlySet<string>]> = [
  [1, new Set(['so0', 'mi0'])],
  [2, new Set(['so0', 'mi0', 'la0'])],
  [3, new Set(['so0', 'mi0', 'la0', 'do0'])],
  [4, new Set(['so0', 'mi0', 'la0', 'do0', 're0'])],
  [
    5,
    new Set([
      'so0', 'mi0', 'la0', 'do0', 're0',
      'so-1', 'la-1', 'mi-1',
      'do1', 're1', 'mi1',
    ]),
  ],
]

/**
 * 曲中に現れた階名の集合からレベルを決める。手でタグ付けはしない。
 *
 * 判定は上から順に:
 *   派生音があれば 8 / 短調なら 7 / それ以外は包含する最小のレベル
 */
export function computeLevel(tokens: readonly SolfaToken[], mode: Mode): number {
  if (tokens.some((t) => !isNatural(t.syllable))) return 8
  if (mode === 'minor') return 7

  const used = new Set(tokens.map(tokenKey))
  for (const [level, allowed] of LEVEL_TOKENS) {
    let fits = true
    for (const token of used) {
      if (!allowed.has(token)) {
        fits = false
        break
      }
    }
    if (fits) return level
  }
  return 6
}

export function levelInfo(level: number): LevelInfo {
  return LEVELS[level - 1] ?? LEVELS[LEVELS.length - 1]
}
