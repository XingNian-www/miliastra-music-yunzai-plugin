import plugin from "../../../lib/plugins/plugin.js"
import config, { reloadConfig } from "../config/index.js"
import {
  createCommandParser,
  extractTurtleSoupPreferences,
  QIANXING_MESSAGE_RULE
} from "../lib/command-parser.js"
import {
  conversationKey,
  isPrivateMessage,
  senderDisplayName
} from "../lib/message-context.js"
import {
  formatMonitorSnapshot,
  formatPlayerStatus,
  formatQueue,
  formatTurtleSoupSnapshot,
  formatUndercoverSnapshot
} from "../lib/monitor-format.js"
import { optimizeTurtleSoup } from "../lib/turtle-soup-ai.js"
import { submitTurtleSoupQuestion } from "../lib/turtle-soup-api.js"
import {
  formatTurtleSoupPreviewMessages,
  formatTurtleSoupReceipt
} from "../lib/turtle-soup-format.js"
import {
  TurtleSoupSubmissionWorkflow,
  TurtleSoupWorkflowError
} from "../lib/turtle-soup-workflow.js"

const STARTUP_ACTIONS = [
  {
    name: "启动原神",
    path: "/startup/game",
    reply: "正在启动原神",
    instruction: "启动对应后端的原神"
  },
  {
    name: "进入千星",
    path: "/startup/enter-wonderland",
    reply: "正在进入千星",
    instruction: "让对应后端进入千星"
  }
]
const READ_ACTIONS = [
  action("状态", ["状态"], ["/status", "/queue"], statusSummary),
  action("监控", ["监控"], ["/monitor"], monitorSummary),
  action("队列", ["队列"], ["/queue"], queueSummary),
  action("健康", ["健康", "health"], ["/health"], healthSummary),
  action("海龟汤状态", ["海龟汤状态", "海龟汤监控"], ["/turtle-soup"], turtleSoupSummary),
  action("卧底状态", ["卧底状态", "卧底监控", "谁是卧底状态"], ["/undercover"], undercoverSummary)
]
const ACTIONS = [
  action("帮助", ["帮助", "help"]),
  action("列表", ["列表", "后端"]),
  action("重载配置", ["重载配置", "reload"]),
  ...READ_ACTIONS,
  ...STARTUP_ACTIONS.map((item) => action(item.name, [item.name])),
  action("截图", ["截图"])
]
const API_METHODS = new Map([
  ["/screenshot", "GET"],
  ...READ_ACTIONS.flatMap((item) => item.paths.map((path) => [path, "GET"])),
  ...STARTUP_ACTIONS.map((item) => [item.path, "POST"])
])
const SELECTOR_TTL_MS = 60_000
const pendingSelections = new Map()
const parseCommand = createCommandParser(ACTIONS, (key) => Boolean(findBackend(key)))
const turtleSoupWorkflow = new TurtleSoupSubmissionWorkflow({
  optimize: (request) => optimizeTurtleSoup(request, config.turtleSoupAi),
  submit: (backend, draft, submission) => submitTurtleSoupQuestion(backend, draft, {
    contributorName: submission.contributorName,
    timeoutMs: config.requestTimeoutMs
  })
})

export class qianxing extends plugin {
  constructor() {
    super({
      name: "千星点歌监控",
      dsc: "Miliastra Wonderland Music 监控与启动插件",
      event: "message",
      priority: 5000,
      rule: [
        {
          reg: QIANXING_MESSAGE_RULE,
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

    if (isTurtleSoupWriteAction(parsed.action) && !isPrivateMessage(e)) {
      await this.replyMessage(e, "海龟汤投稿仅支持私聊")
      return true
    }

    if (parsed.action === "确认海龟汤投稿") {
      await this.confirmTurtleSoup(e)
      return true
    }
    if (parsed.action === "取消海龟汤投稿") {
      await this.cancelTurtleSoup(e)
      return true
    }
    if (parsed.action === "调整海龟汤投稿") {
      await this.adjustTurtleSoup(e, parsed.rawContent)
      return true
    }
    if (parsed.action === "提交海龟汤" && !parsed.rawContent) {
      await this.replyMessage(e, "请在 #千星海龟汤投稿 后提供标题、汤面和汤底初稿")
      return true
    }
    if (parsed.action === "提交海龟汤") {
      await this.startTurtleSoup(e, parsed)
      return true
    }

    if (parsed.action === "帮助") {
      await this.replyMessage(e, formatHelp())
      return true
    }

    if (parsed.action === "列表") {
      await this.replyMessage(e, formatBackendList())
      return true
    }

    if (parsed.action === "重载配置") {
      await this.reloadRuntimeConfig(e)
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

    if (isSelectorAction(parsed.action)) {
      await this.startSelector(e, parsed)
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
      await this.replyMessage(e, "选择无效，请重新发送原命令")
      return true
    }

    pendingSelections.delete(key)
    if (selection.type === "turtle-soup-submit") {
      const preview = turtleSoupWorkflow.getPreview(key)
      if (!preview || preview.revision !== selection.previewRevision) {
        await this.replyMessage(e, "海龟汤投稿预览已失效或发生变化，请重新确认投稿")
        return true
      }
      await this.submitTurtleSoup(e, backend)
      return true
    }

    await this.runSingle(e, backend, selection.parsed)
    return true
  }

  async startSelector(e, parsed) {
    const backends = normalizedBackends()
    if (backends.length === 0) {
      await this.replyMessage(e, "未配置千星后端")
      return
    }
    if (backends.length === 1 && parsed.action === "截图") {
      await this.runSingle(e, backends[0], parsed)
      return
    }

    const summaries = await Promise.all(backends.map((backend) => statusLine(backend)))
    pendingSelections.set(selectionKey(e), {
      type: "action",
      parsed,
      expiresAt: Date.now() + SELECTOR_TTL_MS
    })

    await this.replyMessage(e, [
      `请选择要${parsed.action}的千星后端：`,
      ...summaries.map((line, index) => `${index + 1}. ${line}`),
      "",
      `回复 1-${backends.length} ${selectorInstruction(parsed.action)}`
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

  async startTurtleSoup(e, parsed) {
    clearPendingSelection(e)
    try {
      await this.replyMessage(e, "正在进行海龟汤 AI 审查")
      const preferences = extractTurtleSoupPreferences(parsed.rawContent)
      const preview = await turtleSoupWorkflow.start(selectionKey(e), preferences)
      await this.replyTurtleSoupPreview(e, preview)
    } catch (error) {
      await this.replyMessage(e, `海龟汤预览生成失败：${turtleSoupWorkflowError(error)}`)
    }
  }

  async adjustTurtleSoup(e, adjustmentRequest) {
    clearPendingSelection(e)
    if (!String(adjustmentRequest || "").trim()) {
      await this.replyMessage(e, "请在 #千星调整投稿 后提供修改要求")
      return
    }
    try {
      await this.replyMessage(e, "正在调整海龟汤投稿预览")
      const preview = await turtleSoupWorkflow.adjust(selectionKey(e), adjustmentRequest)
      await this.replyTurtleSoupPreview(e, preview)
    } catch (error) {
      await this.replyMessage(e, `海龟汤投稿调整失败：${turtleSoupWorkflowError(error)}`)
    }
  }

  async confirmTurtleSoup(e) {
    clearPendingSelection(e)
    const key = selectionKey(e)
    const preview = turtleSoupWorkflow.getPreview(key)
    if (!preview) {
      await this.replyMessage(e, "海龟汤投稿失败：没有待确认的海龟汤投稿")
      return
    }

    const backends = normalizedBackends()
    if (backends.length === 0) {
      await this.replyMessage(e, "海龟汤投稿失败：未配置千星后端")
      return
    }
    if (backends.length === 1) {
      await this.submitTurtleSoup(e, backends[0])
      return
    }

    const summaries = await Promise.all(backends.map((backend) => statusLine(backend)))
    pendingSelections.set(key, {
      type: "turtle-soup-submit",
      previewRevision: preview.revision,
      expiresAt: Date.now() + SELECTOR_TTL_MS
    })
    await this.replyMessage(e, [
      "AI 审查已完成，请选择最终提交后端：",
      ...summaries.map((line, index) => `${index + 1}. ${line}`),
      "",
      `回复 1-${backends.length} 提交到对应题库`
    ].join("\n"))
  }

  async submitTurtleSoup(e, backend) {
    try {
      await this.replyMessage(e, `正在向${backend.name}提交海龟汤`)
      const result = await turtleSoupWorkflow.confirm(selectionKey(e), backend, {
        contributorName: senderDisplayName(e)
      })
      await this.replyMessage(e, formatTurtleSoupReceipt(result))
    } catch (error) {
      await this.replyMessage(e, `海龟汤投稿失败：${turtleSoupWorkflowError(error)}`)
    }
  }

  async cancelTurtleSoup(e) {
    clearPendingSelection(e)
    try {
      turtleSoupWorkflow.cancel(selectionKey(e))
      await this.replyMessage(e, "已取消海龟汤投稿")
    } catch (error) {
      await this.replyMessage(e, `无法取消海龟汤投稿：${turtleSoupWorkflowError(error)}`)
    }
  }

  async replyTurtleSoupPreview(e, preview) {
    for (const message of formatTurtleSoupPreviewMessages(preview)) {
      await this.replyMessage(e, message)
    }
  }

  async reloadRuntimeConfig(e) {
    try {
      await reloadConfig()
      pendingSelections.clear()
      await this.replyMessage(e, "千星插件配置已重载")
    } catch (error) {
      await this.replyMessage(e, `千星插件配置重载失败：${error?.message || "未知错误"}`)
    }
  }

  async replyMessage(e, message) {
    if (e?.reply) {
      return e.reply(message)
    }
    return this.reply(message)
  }
}

function action(name, aliases, paths = [], run = null) {
  return { name, aliases, paths, run }
}

function isSelectorAction(actionName) {
  return actionName === "截图" || Boolean(findStartupAction(actionName))
}

function isTurtleSoupWriteAction(actionName) {
  return [
    "提交海龟汤",
    "调整海龟汤投稿",
    "确认海龟汤投稿",
    "取消海龟汤投稿"
  ].includes(actionName)
}

function selectorInstruction(actionName) {
  return findStartupAction(actionName)?.instruction || "获取对应截图"
}

function findStartupAction(actionName) {
  return STARTUP_ACTIONS.find((item) => item.name === actionName)
}

function normalizedBackends() {
  return config.backends
    .map((backend) => ({
      key: backend.key,
      name: backend.name,
      baseUrl: backend.baseUrl.replace(/\/+$/, ""),
      accessToken: firstNonEmpty(backend.accessToken, config.accessToken)
    }))
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
    "#千星海龟汤状态 / #千星卧底状态",
    "#千星启动原神 / #千星进入千星 / #千星截图 / #千星列表 / #千星重载配置",
    "私聊投稿：#千星海龟汤投稿 <原始内容>",
    "投稿操作：#千星确认投稿（此时选择后端）/ #千星调整投稿 <要求> / #千星取消投稿",
    "指定后端：#千星A状态、#千星A海龟汤状态、#千星A卧底状态、#千星A启动原神、#千星A进入千星、#千星A截图"
  ].join("\n")
}

function turtleSoupWorkflowError(error) {
  if (error instanceof TurtleSoupWorkflowError) {
    return error.message
  }
  if (error?.name === "AbortError") {
    return "请求超时"
  }
  return error?.message || "未知错误"
}

async function runAction(backend, parsed) {
  const startup = findStartupAction(parsed.action)
  if (startup) {
    const receipt = await apiJson(backend, startup.path)
    return formatStartupReceipt(startup.reply, receipt)
  }

  const readAction = READ_ACTIONS.find((item) => item.name === parsed.action)
  if (readAction) {
    return readAction.run(backend)
  }
  throw new Error(`Unsupported action: ${parsed.action}`)
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
    formatQueue(queueItems, queuePreviewLimit())
  ].join("\n")
}

async function monitorSummary(backend) {
  const monitor = await apiJson(backend, "/monitor")
  return `${backend.name}：\n${formatMonitorSnapshot(monitor, queuePreviewLimit())}`
}

async function queueSummary(backend) {
  const queue = await apiJson(backend, "/queue")
  return [`${backend.name}：`, formatQueue(queue, queuePreviewLimit())].join("\n")
}

async function healthSummary(backend) {
  const text = await apiText(backend, "/health")
  return `${backend.name}：${text || "OK"}`
}

async function turtleSoupSummary(backend) {
  const snapshot = await apiJson(backend, "/turtle-soup")
  return `${backend.name}：${formatTurtleSoupSnapshot(snapshot)}`
}

async function undercoverSummary(backend) {
  const snapshot = await apiJson(backend, "/undercover")
  return `${backend.name}：${formatUndercoverSnapshot(snapshot)}`
}

async function statusLine(backend) {
  try {
    const status = await apiJson(backend, "/status")
    return `${backend.name}：在线，${formatPlayerStatus(status)}`
  } catch (error) {
    return formatActionError(backend, error)
  }
}

function queuePreviewLimit() {
  return config.queuePreviewLimit
}

function formatStartupReceipt(reply, receipt = {}) {
  const details = []
  if (receipt.taskId !== undefined && receipt.taskId !== null) {
    details.push(`任务 #${receipt.taskId}`)
  }
  if (Number(receipt.position) > 0) {
    details.push(`队列第 ${receipt.position} 位`)
  }
  return details.length ? `${reply}（${details.join("，")}）` : reply
}

function apiErrorDetail(error) {
  if (error instanceof ApiError) {
    const body = error.body.replace(/^错误:\s*/, "").trim()
    if (body) {
      try {
        const payload = JSON.parse(body)
        return payload.error || payload.message || body
      } catch {
        return body
      }
    }
    return `接口返回 HTTP ${error.status}`
  }
  if (error?.name === "AbortError") {
    return "请求超时"
  }
  return error?.message || "未知错误"
}

function formatActionError(backend, error) {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return `${backend.name}：访问令牌无效或缺失`
    }
    return `${backend.name}：${apiErrorDetail(error)}`
  }
  return `${backend.name}：千星机器人未在线或接口不可用`
}

async function requestScreenshot(backend) {
  const quality = String(config.screenshotQuality)
  const response = await apiFetch(backend, "/screenshot", { quality })
  const arrayBuffer = await response.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  return segment.image(buffer)
}

async function apiJson(backend, path, query = {}, options = {}) {
  const text = await apiText(backend, path, query, options)
  if (!text) {
    return {}
  }
  return JSON.parse(text)
}

async function apiText(backend, path, query = {}, options = {}) {
  const response = await apiFetch(backend, path, query, options)
  return response.text()
}

async function apiFetch(backend, path, query = {}, options = {}) {
  const method = API_METHODS.get(path)
  if (!method) {
    throw new Error(`Blocked unsupported API path: ${path}`)
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs)
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
  let body
  if (options.json !== undefined) {
    headers["Content-Type"] = "application/json"
    body = JSON.stringify(options.json)
  }

  try {
    const response = await fetch(url, {
      method,
      signal: controller.signal,
      headers,
      body
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
  return conversationKey(e)
}

function clearPendingSelection(e) {
  pendingSelections.delete(selectionKey(e))
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
