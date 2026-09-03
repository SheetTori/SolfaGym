/**
 * ビルド時刻の表示。
 *
 * デプロイしたはずなのに古い画面が見えている、という状況を自分で切り分けられるように
 * ページ下部へ出す。見る人はひとりなので、表示は日本時間に固定する。
 */

const FORMATTER = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

/** ISO 8601 の時刻を `2026/09/03 12:47` の形にする。読めなければ null */
export function formatBuildTime(iso: string): string | null {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return FORMATTER.format(date).replace(/\s+/, ' ')
}
