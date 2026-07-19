const DEFAULT_MEMORY_TTL_MS = 60 * 60 * 1000
export const CHAT_RELAY_RULE = "^(?:[!！][\\s\\S]*|#发言)$"
export const CHAT_ALIAS_RULE = "^#发言昵称[\\s\\S]*$"

export class ChatBackendMemory {
  constructor(options = {}) {
    this.now = options.now || Date.now
    this.ttlMs = options.ttlMs || DEFAULT_MEMORY_TTL_MS
    this.selections = new Map()
  }

  remember(userKey, backendKey) {
    const key = requiredText(userKey, "用户标识")
    this.selections.set(key, {
      backendKey: requiredText(backendKey, "后端标识"),
      expiresAt: this.now() + this.ttlMs
    })
  }

  get(userKey) {
    const key = requiredText(userKey, "用户标识")
    const selection = this.selections.get(key)
    if (!selection) {
      return null
    }
    if (this.now() >= selection.expiresAt) {
      this.selections.delete(key)
      return null
    }
    return selection.backendKey
  }

  forget(userKey) {
    return this.selections.delete(requiredText(userKey, "用户标识"))
  }

  clear() {
    this.selections.clear()
  }
}

export function parseChatRelayCommand(message) {
  const text = String(message || "")
  if (text.trim() === "#发言") {
    return { type: "switch" }
  }
  if (!text.startsWith("!") && !text.startsWith("！")) {
    return null
  }
  const content = text.slice(1).replace(/\s+/g, " ").trim()
  return content ? { type: "send", content } : { type: "empty" }
}

export function parseChatAliasCommand(message) {
  const text = String(message || "").trim()
  if (text === "#发言昵称列表") {
    return { type: "list" }
  }

  const deleteMatch = text.match(/^#发言昵称删除\s+(\d+)$/)
  if (deleteMatch) {
    return { type: "delete", qq: deleteMatch[1] }
  }

  const setMatch = text.match(/^#发言昵称\s+(\d+)\s+([\s\S]+)$/)
  if (setMatch) {
    return {
      type: "set",
      qq: setMatch[1],
      nickname: setMatch[2].trim()
    }
  }

  return text.startsWith("#发言昵称") ? { type: "invalid" } : null
}

export function formatChatPrefix(identity) {
  return `[${requiredText(identity, "发言身份")}]:`
}

export function buildChatRelayQuery(content, identity) {
  return {
    text: requiredText(content, "发言内容"),
    usePrefix: 1,
    prefix: formatChatPrefix(identity)
  }
}

function requiredText(value, label) {
  const text = String(value || "").trim()
  if (!text) {
    throw new Error(`${label}不能为空`)
  }
  return text
}
