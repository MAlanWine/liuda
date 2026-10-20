function label(timestamp) {
  const value = Number(timestamp)
  if (!Number.isFinite(value) || value <= 0) return ''
  const elapsed = Math.max(0,Date.now()-value)
  if (elapsed < 60000) return '刚刚'
  if (elapsed < 3600000) return Math.floor(elapsed/60000) + ' 分钟前'
  if (elapsed < 86400000) return Math.floor(elapsed/3600000) + ' 小时前'
  const date = new Date(value)
  return (date.getMonth()+1) + '月' + date.getDate() + '日'
}
module.exports = { label }
