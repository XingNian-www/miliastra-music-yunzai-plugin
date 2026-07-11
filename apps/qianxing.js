import plugin from "../../../lib/plugins/plugin.js"
import config from "../config/index.js"

const ACTIONS = [
  action("帮助", ["帮助", "help"]),
  action("列表", ["列表", "后端"]),
  action("状态", ["状态"]),
  action("监控", ["监控"]),
  action("队列", ["队列"]),
  action("截图", ["截图"]),
  action("健康", ["健康", "health"])
]
const ACTION_ALIASES = ACTIONS
  .flatMap((item) => item.aliases.map((alias) => ({ alias, action: item })))
  .sort((left, right) => right.alias.length - left.alias.length)
const READ_ONLY_PATHS = new Set(["/status", "/monitor", "/queue", "/health", "/screenshot"])
const SELECTOR_TTL_MS = 60_000
const pendingSelections = new Map()

export class qianxing extends plugin {
  constructor() {
    super({
      name: "千星点歌监控",
      dsc: "Miliastra Wonderland Music 只读监控插件",
      event: "message",
      priority: 5000,
      rule: [
        {
          reg: "^#千星.*$",
          fnc: "handleQianxing"
        },
        {
          reg: "^[1-9][0-9]*$",
          fnc: "handleSelection"
        }
      ]
    })
  }

  async handleQianxing(e = this.e) {
    const parsed = parseCommand(messageText(e))
    if (!parsed) {
      return false
    }

    if (parsed.action === "帮助") {
      await this.replyMessage(e, formatHelp())
      return true
    }

    if (parsed.action === "列表") {
      await this.replyMessage(e, formatBackendList())
      return true
    }

    if (parsed.backendKey) {
      const backend = findBackend(parsed.backendKey)
      if (!backend) {
        await this.replyMessage(e, `未找到千星后端：${parsed.backendKey}`)
        return true
      }
      await this.runSingle(e, backend, parsed)
      return true
    }

    if (parsed.action === "截图") {
      await this.startScreenshotSelector(e, parsed)
      return true
    }

    await this.runBroadcast(e, parsed)
    return true
  }

  async handleSelection(e = this.e) {
    const key = selectionKey(e)
    const selection = pendingSelections.get(key)
    if (!selection || Date.now() > selection.expiresAt) {
      pendingSelections.delete(key)
      return false
    }

    const index = Number(messageText(e).trim()) - 1
    const backend = normalizedBackends()[index]
    if (!backend) {
      await this.replyMessage(e, "选择无效，请重新发送 #千星截图")
      return true
    }

    pendingSelections.delete(key)
    await this.runSingle(e, backend, selection.parsed)
    return true
  }

  async startScreenshotSelector(e, parsed) {
    const backends = normalizedBackends()
    if (backends.length === 0) {
      await this.replyMessage(e, "未配置千星后端")
      return
    }
    if (backends.length === 1) {
      await this.runSingle(e, backends[0], parsed)
      return
    }

    const summaries = await Promise.all(backends.map((backend) => statusLine(backend)))
    pendingSelections.set(selectionKey(e), {
      parsed,
      expiresAt: Date.now() + SELECTOR_TTL_MS
    })

    await this.replyMessage(e, [
      "请选择要查看截图的千星后端：",
      ...summaries.map((line, index) => `${index + 1}. ${line}`),
      "",
      `回复 1-${backends.length} 获取对应截图`
    ].join("\n"))
  }

  async runBroadcast(e, parsed) {
    const backends = normalizedBackends()
    if (backends.length === 0) {
      await this.replyMessage(e, "未配置千星后端")
      return
    }

    const results = await Promise.all(backends.map(async (backend) => {
      try {
        return await runAction(backend, parsed)
      } catch (error) {
        return formatActionError(backend, error)
      }
    }))
    await this.replyMessage(e, results.join("\n\n"))
  }

  async runSingle(e, backend, parsed) {
    try {
      if (parsed.action === "截图") {
        const image = await requestScreenshot(backend)
        await this.replyMessage(e, [`${backend.name} 截图：`, image])
        return
      }
      await this.replyMessage(e, await runAction(backend, parsed))
    } catch (error) {
      await this.replyMessage(e, formatActionError(backend, error))
    }
  }

  async replyMessage(e, message) {
    if (e?.reply) {
      return e.reply(message)
    }
    return this.reply(message)
  }
}

function action(name, aliases) {
  return { name, aliases }
}

function parseCommand(message) {
  const text = String(message || "").trim()
  if (!text.startsWith("#千星")) {
    return null
  }

  const rest = text.slice("#千星".length).trim()
  if (!rest) {
    return { action: "状态", backendKey: "" }
  }

  const direct = matchActionAtStart(rest)
  if (direct) {
    return direct
  }

  const withBackend = matchActionWithBackend(rest)
  if (withBackend) {
    return withBackend
  }

  if (findBackend(rest)) {
    return { action: "状态", backendKey: rest }
  }

  return null
}

function matchActionAtStart(text) {
  for (const { alias, action: item } of ACTION_ALIASES) {
    if (text === alias) {
      return { action: item.name, backendKey: "" }
    }
  }
  return null
}

function matchActionWithBackend(text) {
  for (const { alias, action: item } of ACTION_ALIASES) {
    if (!text.endsWith(alias)) {
      continue
    }
    const backendKey = text.slice(0, -alias.length).trim()
    if (backendKey) {
      return { action: item.name, backendKey }
    }
  }
  return null
}

function normalizedBackends() {
  return (config.backends || [])
    .map((backend, index) => ({
      key: String(backend.key || index + 1),
      name: backend.name || `${backend.key || index + 1}号千星`,
      baseUrl: String(backend.baseUrl || "").replace(/\/+$/, ""),
      accessToken: firstNonEmpty(backend.accessToken, config.accessToken),
      screenshotQuality: backend.screenshotQuality ?? config.screenshotQuality
    }))
    .filter((backend) => backend.baseUrl)
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const text = String(value ?? "").trim()
    if (text) {
      return text
    }
  }
  return ""
}

function findBackend(key) {
  const needle = String(key || "").toLowerCase()
  return normalizedBackends().find((backend) =>
    backend.key.toLowerCase() === needle || backend.name.toLowerCase() === needle
  )
}

function formatBackendList() {
  const backends = normalizedBackends()
  if (backends.length === 0) {
    return "未配置千星后端"
  }
  return [
    "千星后端：",
    ...backends.map((backend, index) => {
      const token = backend.accessToken ? "，已配置访问令牌" : ""
      return `${index + 1}. ${backend.name}（${backend.key}）${backend.baseUrl}${token}`
    })
  ].join("\n")
}

function formatHelp() {
  return [
    "千星点歌监控命令：",
    "#千星状态 / #千星监控 / #千星队列 / #千星健康",
    "#千星截图 / #千星列表",
    "指定后端：#千星A状态、#千星A监控、#千星A队列、#千星A截图"
  ].join("\n")
}

async function runAction(backend, parsed) {
  switch (parsed.action) {
    case "状态":
      return statusSummary(backend)
    case "监控":
      return monitorSummary(backend)
    case "队列":
      return queueSummary(backend)
    case "健康":
      return healthSummary(backend)
    default:
      throw new Error(`Unsupported read-only action: ${parsed.action}`)
  }
}

async function statusSummary(backend) {
  const [status, queue] = await Promise.all([
    apiJson(backend, "/status"),
    apiJson(backend, "/queue")
  ])
  const queueItems = Array.isArray(queue) ? queue : []
  return [
    `${backend.name}：在线`,
    `播放：${formatPlayerStatus(status)}`,
    formatQueue(queueItems)
  ].join("\n")
}

async function monitorSummary(backend) {
  const monitor = await apiJson(backend, "/monitor")
  return [
    `${backend.name}：${monitor.status || "状态未知"}`,
    formatPlaybackController(monitor.playbackController),
    formatQueue(Array.isArray(monitor.queue) ? monitor.queue : []),
    formatPendingTasks(monitor.pendingTasks),
    formatChatListener(monitor.chatListener)
  ].filter(Boolean).join("\n")
}

async function queueSummary(backend) {
  const queue = await apiJson(backend, "/queue")
  return [`${backend.name}：`, formatQueue(Array.isArray(queue) ? queue : [])].join("\n")
}

async function healthSummary(backend) {
  const text = await apiText(backend, "/health")
  return `${backend.name}：${text || "OK"}`
}

async function statusLine(backend) {
  try {
    const status = await apiJson(backend, "/status")
    return `${backend.name}：在线，${formatPlayerStatus(status)}`
  } catch (error) {
    return formatActionError(backend, error)
  }
}

function formatPlayerStatus(status) {
  const state = status.status || "未知"
  const title = [status.name, status.singer].filter(Boolean).join(" - ") || "无当前歌曲"
  const progress = formatTime(status.progress)
  const duration = formatTime(status.duration)
  const volume = Number.isFinite(Number(status.volume)) ? `，音量 ${status.volume}` : ""
  if (duration) {
    return `${state}，${title}（${progress || "0:00"}/${duration}${volume}）`
  }
  return `${state}，${title}${volume}`
}

function formatPlaybackController(controller = {}) {
  const parts = [
    controller.state ? `控制器：${controller.state}` : "",
    controller.pauseReason ? `暂停原因 ${controller.pauseReason}` : "",
    controller.activeKeyword ? `活动歌曲 ${controller.activeKeyword}` : "",
    controller.lastObservationReliability ? `观测 ${controller.lastObservationReliability}` : ""
  ].filter(Boolean)
  return parts.join("，")
}

function formatPendingTasks(tasks) {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return "待执行任务：空"
  }
  const limit = Number(config.queuePreviewLimit || 5)
  return [`待执行任务：${tasks.length} 个`, ...tasks.slice(0, limit).map((task, index) => `${index + 1}. ${task}`)].join("\n")
}

function formatChatListener(listener = {}) {
  const mode = listenerModeLabel(listener.mode)
  const pending = listenerModeLabel(listener.pendingMode)
  if (!mode && !pending) {
    return ""
  }
  return `监听：${mode || "未知"}${pending ? `，切换中 ${pending}` : ""}`
}

function listenerModeLabel(value) {
  if (value === "primary" || value === "一级监听") {
    return "一级监听"
  }
  if (value === "secondary" || value === "二级监听") {
    return "二级监听"
  }
  return value || ""
}

function formatQueue(queue) {
  const limit = Number(config.queuePreviewLimit || 5)
  if (queue.length === 0) {
    return "队列：空"
  }
  const preview = queue.slice(0, limit).map((item, index) => {
    const source = item.source ? ` [${item.source}]` : ""
    const accompaniment = item.preferAccompaniment || item.prefer_accompaniment ? " 伴奏" : ""
    return `${index + 1}. ${item.keyword || item.uri || "未命名"}${source}${accompaniment}`
  })
  return [`队列：${queue.length} 首`, ...preview].join("\n")
}

function formatTime(value) {
  const seconds = Math.floor(Number(value || 0))
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return ""
  }
  const minutes = Math.floor(seconds / 60)
  const rest = String(seconds % 60).padStart(2, "0")
  return `${minutes}:${rest}`
}

function formatActionError(backend, error) {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return `${backend.name}：访问令牌无效或缺失`
    }
    const message = error.body.replace(/^错误:\s*/, "").trim()
    return `${backend.name}：${message || `接口返回 HTTP ${error.status}`}`
  }
  return `${backend.name}：千星机器人未在线或接口不可用`
}

async function requestScreenshot(backend) {
  const quality = String(backend.screenshotQuality || config.screenshotQuality || 88)
  const response = await apiFetch(backend, "/screenshot", { quality })
  const arrayBuffer = await response.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  return segment.image(buffer)
}

async function apiJson(backend, path) {
  const text = await apiText(backend, path)
  if (!text) {
    return {}
  }
  return JSON.parse(text)
}

async function apiText(backend, path) {
  const response = await apiFetch(backend, path)
  return response.text()
}

async function apiFetch(backend, path, query = {}) {
  if (!READ_ONLY_PATHS.has(path)) {
    throw new Error(`Blocked non-monitoring API path: ${path}`)
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), Number(config.requestTimeoutMs || 5000))
  const url = new URL(`${backend.baseUrl}${path}`)
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value)
    }
  }

  const headers = {}
  if (backend.accessToken) {
    headers["X-Miliastra-Token"] = backend.accessToken
  }

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers
    })
    if (!response.ok) {
      const body = await response.text().catch(() => "")
      throw new ApiError(response.status, body)
    }
    return response
  } finally {
    clearTimeout(timeout)
  }
}

function selectionKey(e) {
  return `${e.group_id || "private"}:${e.user_id || "unknown"}`
}

function messageText(e) {
  return String(e?.msg || e?.message || "")
}

class ApiError extends Error {
  constructor(status, body) {
    super(`HTTP ${status}`)
    this.status = status
    this.body = body || ""
  }
}
