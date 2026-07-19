import { validateTurtleSoupDraft } from "./turtle-soup-ai.js"
import { networkLogger, runLoggedNetworkRequest } from "./network-logger.js"

const MAX_ATTEMPTS = 2

export async function submitTurtleSoupQuestion(backend, value, options = {}) {
  const draft = validateTurtleSoupDraft(value)
  const baseUrl = String(backend?.baseUrl || "").replace(/\/+$/, "")
  if (!baseUrl) {
    throw new Error("千星后端地址为空")
  }
  const timeoutMs = positiveInteger(options.timeoutMs, 5000)
  const fetchImpl = options.fetchImpl || fetch
  const requestLogger = options.networkLogger || (options.fetchImpl ? null : networkLogger)
  const contributorName = String(options.contributorName || "").trim()
  const body = JSON.stringify({
    title: draft.title,
    surface: contributorName
      ? `此题由${contributorName}提供:${draft.surface}`
      : draft.surface,
    bottom: draft.bottom,
    adjudicationNotes: draft.adjudicationNotes,
    enabled: true
  })

  let lastError
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await submitOnce({
        url: `${baseUrl}/turtle-soup/questions`,
        accessToken: String(backend?.accessToken || "").trim(),
        timeoutMs,
        fetchImpl,
        requestLogger,
        attempt,
        body
      })
    } catch (error) {
      lastError = error
    }
  }
  throw lastError
}

async function submitOnce({
  url,
  accessToken,
  timeoutMs,
  fetchImpl,
  requestLogger,
  attempt,
  body
}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  const headers = { "Content-Type": "application/json" }
  if (accessToken) {
    headers["X-Miliastra-Token"] = accessToken
  }

  try {
    const response = await runLoggedNetworkRequest(requestLogger, {
      source: "turtle-soup-submit",
      method: "POST",
      url,
      attempt
    }, () => fetchImpl(url, {
      method: "POST",
      signal: controller.signal,
      headers,
      body
    }))
    if (!response.ok) {
      const detail = await response.text().catch(() => "")
      throw new TurtleSoupApiError(response.status, detail)
    }

    let payload
    try {
      payload = await response.json()
    } catch {
      throw new Error("海龟汤投稿接口返回的响应不是有效 JSON")
    }
    return validateReceipt(payload)
  } finally {
    clearTimeout(timeout)
  }
}

function validateReceipt(value) {
  const id = typeof value?.id === "string" ? value.id.trim() : ""
  const position = Number(value?.position)
  const total = Number(value?.total)
  if (!id || !Number.isInteger(position) || position <= 0 || !Number.isInteger(total) || total <= 0) {
    throw new Error("海龟汤投稿接口返回的回执无效")
  }
  return { id, position, total }
}

function positiveInteger(value, fallback) {
  const number = value === undefined ? fallback : Number(value)
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error("海龟汤投稿请求超时必须是正整数")
  }
  return number
}

export class TurtleSoupApiError extends Error {
  constructor(status, body) {
    const detail = apiErrorDetail(body)
    super(`海龟汤投稿失败（HTTP ${status}）${detail ? `：${detail}` : ""}`)
    this.name = "TurtleSoupApiError"
    this.status = status
    this.body = body || ""
  }
}

function apiErrorDetail(body) {
  const text = String(body || "").slice(0, 300).trim()
  if (!text) {
    return ""
  }
  try {
    const payload = JSON.parse(text)
    return String(payload.error?.message || payload.error || payload.message || text)
  } catch {
    return text.replace(/^错误:\s*/, "").trim()
  }
}
