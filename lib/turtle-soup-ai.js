import { request as httpRequest } from "node:http"
import { request as httpsRequest } from "node:https"

const MAX_RAW_CONTENT_LENGTH = 12000
const MAX_ADJUSTMENT_LENGTH = 4000
const REASONING_EFFORTS = new Set(["none", "low", "medium", "high", "xhigh", "max"])
const VERBOSITY_LEVELS = new Set(["low", "medium", "high"])
const DRAFT_FIELDS = ["title", "surface", "bottom", "adjudicationNotes", "logicReview"]

const TURTLE_SOUP_SCHEMA = {
  type: "object",
  properties: {
    title: {
      type: "string",
      description: "简短且不泄露核心机关的题目标题"
    },
    surface: {
      type: "string",
      description: "只包含玩家可见事实的完整汤面"
    },
    bottom: {
      type: "string",
      description: "回收全部汤面信息的完整汤底"
    },
    adjudicationNotes: {
      type: "string",
      description: "核心真相和主持裁决题库"
    },
    logicReview: {
      type: "string",
      description: "不改写题目事实的独立逻辑漏洞审查"
    }
  },
  required: DRAFT_FIELDS,
  additionalProperties: false
}

export async function optimizeTurtleSoup(request, ai = {}, fetchImpl, dependencies = {}) {
  const settings = validateAiConfig(ai)
  const input = buildTurtleSoupInput(request)
  const transport = await createAiTransport(settings.proxyUrl, fetchImpl, dependencies)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), settings.timeoutMs)

  try {
    const requestOptions = {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${settings.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: settings.model,
        instructions: settings.systemPrompt,
        input,
        reasoning: { effort: settings.reasoningEffort },
        text: {
          verbosity: settings.verbosity,
          format: {
            type: "json_schema",
            name: "turtle_soup_draft",
            strict: true,
            schema: TURTLE_SOUP_SCHEMA
          }
        },
        max_output_tokens: settings.maxOutputTokens,
        store: false
      })
    }
    if (transport.agent) {
      requestOptions.agent = transport.agent
    }
    const response = await transport.fetchImpl(settings.endpoint, requestOptions)

    if (!response.ok) {
      const detail = await response.text().catch(() => "")
      throw new Error(`海龟汤 AI 请求失败（HTTP ${response.status}）${detail ? `：${detail.slice(0, 200)}` : ""}`)
    }

    let payload
    try {
      payload = await response.json()
    } catch {
      throw new Error("海龟汤 AI 返回的响应不是有效 JSON")
    }
    return validateTurtleSoupDraft(parseJsonObject(extractResponseText(payload)))
  } finally {
    clearTimeout(timeout)
    await transport.close?.()
  }
}

export function buildTurtleSoupInput(request = {}) {
  const rawContent = requiredInput(request.rawContent, "海龟汤原始内容")
  if (rawContent.length > MAX_RAW_CONTENT_LENGTH) {
    throw new Error(`海龟汤原始内容不能超过 ${MAX_RAW_CONTENT_LENGTH} 字符`)
  }

  const difficulty = optionalInput(request.difficulty) || "未指定"
  const style = optionalInput(request.style) || "未指定"
  const adjustmentRequest = optionalInput(request.adjustmentRequest)
  if (!adjustmentRequest) {
    return [
      "任务：整理新的海龟汤投稿预览",
      `目标难度：${difficulty}`,
      `目标风格：${style}`,
      "",
      "用户初稿：",
      rawContent
    ].join("\n")
  }

  if (adjustmentRequest.length > MAX_ADJUSTMENT_LENGTH) {
    throw new Error(`海龟汤修改要求不能超过 ${MAX_ADJUSTMENT_LENGTH} 字符`)
  }
  const currentDraft = validateTurtleSoupDraft(request.currentDraft)
  return [
    "任务：调整现有海龟汤投稿预览",
    `目标难度：${difficulty}`,
    `目标风格：${style}`,
    "",
    "原始初稿：",
    rawContent,
    "",
    "当前结构化版本：",
    JSON.stringify(currentDraft),
    "",
    "修改要求：",
    adjustmentRequest
  ].join("\n")
}

export function parseJsonObject(content) {
  const text = String(content || "").trim()
  const unfenced = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
  const start = unfenced.indexOf("{")
  const end = unfenced.lastIndexOf("}")
  if (start < 0 || end < start) {
    throw new Error("海龟汤 AI 未返回 JSON 对象")
  }
  try {
    return JSON.parse(unfenced.slice(start, end + 1))
  } catch {
    throw new Error("海龟汤 AI 返回的 JSON 无法解析")
  }
}

export function validateTurtleSoupDraft(value) {
  const draft = Object.fromEntries(DRAFT_FIELDS.map((field) => [
    field,
    typeof value?.[field] === "string" ? value[field].trim() : ""
  ]))
  if (DRAFT_FIELDS.some((field) => !draft[field])) {
    throw new Error("海龟汤 AI 返回内容缺少标题、汤面、汤底、裁决备注或逻辑审查")
  }
  return draft
}

function validateAiConfig(ai) {
  const endpoint = optionalInput(ai.endpoint)
  const proxyText = optionalInput(ai.proxyUrl)
  const apiKey = optionalInput(ai.apiKey)
  const model = optionalInput(ai.model)
  const systemPrompt = optionalInput(ai.systemPrompt)
  if (!endpoint || !apiKey || !model || !systemPrompt) {
    throw new Error("海龟汤 AI 配置不完整")
  }
  let endpointUrl
  try {
    endpointUrl = new URL(endpoint)
  } catch {
    throw new Error("海龟汤 AI endpoint 不是有效 URL")
  }
  if (endpointUrl.protocol !== "http:" && endpointUrl.protocol !== "https:") {
    throw new Error("海龟汤 AI endpoint 仅支持 http 或 https")
  }
  const endpointPath = endpointUrl.pathname.replace(/\/+$/, "")
  if (/\/chat\/completions$/i.test(endpointPath)) {
    throw new Error("海龟汤 AI endpoint 必须兼容 Responses API，不能使用 /chat/completions")
  }

  let proxyUrl = ""
  if (proxyText) {
    let parsedProxy
    try {
      parsedProxy = new URL(proxyText)
    } catch {
      throw new Error("海龟汤 AI proxyUrl 不是有效 URL")
    }
    if (parsedProxy.protocol !== "http:" && parsedProxy.protocol !== "https:") {
      throw new Error("海龟汤 AI proxyUrl 仅支持 http 或 https")
    }
    proxyUrl = parsedProxy.href
  }

  const reasoningEffort = optionalInput(ai.reasoningEffort) || "medium"
  if (!REASONING_EFFORTS.has(reasoningEffort)) {
    throw new Error("海龟汤 AI reasoningEffort 配置无效")
  }
  const verbosity = optionalInput(ai.verbosity) || "high"
  if (!VERBOSITY_LEVELS.has(verbosity)) {
    throw new Error("海龟汤 AI verbosity 配置无效")
  }

  return {
    endpoint,
    proxyUrl,
    apiKey,
    model,
    systemPrompt,
    reasoningEffort,
    verbosity,
    timeoutMs: positiveInteger(ai.timeoutMs, 180000, "timeoutMs"),
    maxOutputTokens: positiveInteger(ai.maxOutputTokens, 16384, "maxOutputTokens")
  }
}

async function createAiTransport(proxyUrl, fetchImpl, dependencies) {
  if (!proxyUrl) {
    return { fetchImpl: fetchImpl || fetch }
  }

  const proxyFetch = dependencies.proxyFetchImpl || fetchThroughNodeHttp
  let createProxyAgent = dependencies.createProxyAgent
  try {
    if (!createProxyAgent) {
      const { HttpsProxyAgent } = await import("https-proxy-agent")
      createProxyAgent = (value) => new HttpsProxyAgent(value)
    }
  } catch (error) {
    throw new Error("启用 AI HTTP 代理需要 https-proxy-agent，请在插件目录运行 pnpm install", {
      cause: error
    })
  }

  const agent = await createProxyAgent(proxyUrl)
  return {
    fetchImpl: proxyFetch,
    agent,
    close: () => agent?.destroy?.()
  }
}

function fetchThroughNodeHttp(endpoint, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint)
    const request = url.protocol === "https:" ? httpsRequest : httpRequest
    const clientRequest = request(url, {
      method: options.method,
      headers: options.headers,
      agent: options.agent,
      signal: options.signal
    }, (response) => {
      const chunks = []
      response.on("data", (chunk) => chunks.push(chunk))
      response.on("error", reject)
      response.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8")
        const status = Number(response.statusCode || 0)
        resolve({
          ok: status >= 200 && status < 300,
          status,
          async text() {
            return body
          },
          async json() {
            return JSON.parse(body)
          }
        })
      })
    })
    clientRequest.on("error", reject)
    if (options.body !== undefined) {
      clientRequest.write(options.body)
    }
    clientRequest.end()
  })
}

function extractResponseText(payload) {
  if (payload?.error) {
    throw new Error(`海龟汤 AI 请求失败：${payload.error.message || payload.error}`)
  }
  if (payload?.status !== "completed") {
    const reason = payload?.incomplete_details?.reason || payload?.status || "未知状态"
    throw new Error(`海龟汤 AI 响应未完成：${reason}`)
  }

  const texts = []
  for (const output of Array.isArray(payload.output) ? payload.output : []) {
    for (const content of Array.isArray(output?.content) ? output.content : []) {
      if (content?.type === "refusal") {
        throw new Error(`海龟汤 AI 拒绝处理：${content.refusal || "未提供原因"}`)
      }
      if (content?.type === "output_text" && typeof content.text === "string") {
        texts.push(content.text)
      }
    }
  }
  if (texts.length === 0) {
    throw new Error("海龟汤 AI 响应中没有 output_text")
  }
  return texts.join("")
}

function requiredInput(value, label) {
  const text = optionalInput(value)
  if (!text) {
    throw new Error(`${label}不能为空`)
  }
  return text
}

function optionalInput(value) {
  return typeof value === "string" ? value.trim() : ""
}

function positiveInteger(value, fallback, label) {
  const number = value === undefined ? fallback : Number(value)
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(`海龟汤 AI ${label} 必须是正整数`)
  }
  return number
}
