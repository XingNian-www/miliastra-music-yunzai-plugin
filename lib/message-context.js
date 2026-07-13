export function isPrivateMessage(event = {}) {
  if (typeof event.isPrivate === "boolean") {
    return event.isPrivate
  }
  if (event.message_type === "private" || event.detail_type === "private") {
    return true
  }
  if (event.message_type === "group" || event.detail_type === "group") {
    return false
  }
  if (typeof event.isGroup === "boolean") {
    return !event.isGroup
  }
  return false
}

export function conversationKey(event = {}) {
  const adapter = firstIdentity(
    event.adapter,
    event.adapter?.name,
    event.adapter?.id,
    event.platform,
    event.bot?.adapter?.name,
    event.bot?.adapter?.id,
    event.bot?.adapter
  ) || "unknown-adapter"
  const selfId = firstIdentity(
    event.self_id,
    event.bot_id,
    event.bot?.self_id,
    event.bot?.uin
  ) || "unknown-bot"
  const groupId = firstIdentity(event.group_id)
  const scope = groupId ? `group:${groupId}` : "private"
  const userId = firstIdentity(event.user_id, event.sender?.user_id) || "unknown-user"
  return `${adapter}:${selfId}:${scope}:${userId}`
}

export function senderDisplayName(event = {}) {
  const name = firstIdentity(
    event.sender?.card,
    event.sender?.nickname,
    event.sender?.name,
    event.nickname,
    event.user_name,
    event.user_id,
    event.sender?.user_id
  ) || "未知用户"
  return name.replace(/\s+/g, " ").trim()
}

function firstIdentity(...values) {
  for (const value of values) {
    if ((typeof value === "string" || typeof value === "number") && String(value).trim()) {
      return String(value).trim()
    }
  }
  return ""
}
