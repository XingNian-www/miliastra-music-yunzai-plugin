const SONG_SOURCES = [
  { marker: "#网易点歌", source: "netease", sourceName: "网易云" },
  { marker: "#B站点歌", source: "bilibili", sourceName: "B站" },
  { marker: "#QQ点歌", source: "qqmusic", sourceName: "QQ音乐" },
  { marker: "#点歌", source: "qqmusic", sourceName: "QQ音乐" }
]
const VALID_SOURCES = new Set(SONG_SOURCES.map((item) => item.source))

export const SONG_REQUEST_RULE = "^#(?:点歌|QQ点歌|网易点歌|B站点歌)(?:\\s[\\s\\S]*)?$"

export function parseSongRequestCommand(message) {
  const text = String(message || "")
  const selected = SONG_SOURCES.find((item) =>
    text === item.marker || (text.startsWith(item.marker) && /\s/.test(text[item.marker.length]))
  )
  if (!selected) {
    return null
  }
  return {
    keyword: text.slice(selected.marker.length).replace(/\s+/g, " ").trim(),
    source: selected.source,
    sourceName: selected.sourceName
  }
}

export function buildSongRequestQuery(keyword, source) {
  const normalized = String(keyword || "").replace(/\s+/g, " ").trim()
  if (!normalized) {
    throw new Error("点歌关键词不能为空")
  }
  if (normalized.length > 200) {
    throw new Error("点歌关键词不能超过 200 个字符")
  }
  if (!VALID_SOURCES.has(source)) {
    throw new Error("不支持的点歌平台")
  }
  return {
    keyword: normalized,
    source
  }
}

export function formatSongRequestReceipt(backendName, receipt = {}) {
  if (receipt.duplicate === true || receipt.queued === false) {
    return `${backendName}：相同点歌任务已在队列中`
  }
  const details = []
  if (receipt.taskId !== undefined && receipt.taskId !== null) {
    details.push(`任务 #${receipt.taskId}`)
  }
  if (Number(receipt.position) > 0) {
    details.push(`队列第 ${receipt.position} 位`)
  }
  return details.length
    ? `${backendName}：点歌已加入队列（${details.join("，")}）`
    : `${backendName}：点歌已加入队列`
}
