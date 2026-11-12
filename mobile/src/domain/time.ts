const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** 刚刚 / N 分钟前 / N 小时前 / 昨天 / M月D日 (YYYY年M月D日 for other years). Local time. */
export function formatRelative(ts: number, now: number): string {
  if (!Number.isFinite(ts) || ts <= 0) return '';
  const diff = now - ts;
  if (diff < MINUTE) return '刚刚';
  if (diff < HOUR) return Math.floor(diff / MINUTE) + ' 分钟前';
  const today = startOfDay(now);
  if (diff < 24 * HOUR && ts >= today) return Math.floor(diff / HOUR) + ' 小时前';
  const yesterday = startOfDay(today - 1);
  if (ts >= yesterday && ts < today) return '昨天';
  const date = new Date(ts);
  const md = (date.getMonth() + 1) + '月' + date.getDate() + '日';
  return date.getFullYear() === new Date(now).getFullYear() ? md : date.getFullYear() + '年' + md;
}
