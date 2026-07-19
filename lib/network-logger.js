import { appendFile, mkdir, readdir, rm } from "node:fs/promises"

const RETENTION_DAYS = 7
const LOG_FILE_PATTERN = /^network-(\d{4}-\d{2}-\d{2})\.jsonl$/
const DEFAULT_LOG_DIRECTORY = new URL("../logs/network/", import.meta.url)

export const networkLogger = createNetworkLogger()

export function createNetworkLogger(options = {}) {
  const directory = options.directory || DEFAULT_LOG_DIRECTORY
  const now = options.now || (() => new Date())
  const retentionDays = options.retentionDays || RETENTION_DAYS
  let queue = Promise.resolve()
  let lastCleanupDate = ""

  return {
    record(entry) {
      const task = queue.then(async () => {
        const timestamp = validDate(now())
        const dateKey = localDateKey(timestamp)
        await mkdir(directory, { recursive: true })
        if (lastCleanupDate !== dateKey) {
          try {
            await removeExpiredLogs(directory, timestamp, retentionDays)
            lastCleanupDate = dateKey
          } catch {
            // A failed cleanup must not prevent the current request from being logged.
          }
        }
        const line = JSON.stringify(normalizeEntry(entry, timestamp))
        await appendFile(new URL(`network-${dateKey}.jsonl`, directory), `${line}\n`, "utf8")
      })
      queue = task.catch(() => {})
      return task.then(() => true, () => false)
    }
  }
}

export async function runLoggedNetworkRequest(logger, details, request) {
  const startedAt = Date.now()
  try {
    const response = await request()
    await safeRecord(logger, {
      ...details,
      status: integerStatus(response?.status),
      outcome: response?.ok === false ? "http_error" : "success",
      durationMs: Date.now() - startedAt
    })
    return response
  } catch (error) {
    const status = integerStatus(error?.status)
    await safeRecord(logger, {
      ...details,
      status,
      outcome: status
        ? "http_error"
        : isTimeoutError(error) ? "timeout" : "network_error",
      durationMs: Date.now() - startedAt,
      errorName: safeToken(error?.name),
      errorCode: errorCode(error)
    })
    throw error
  }
}

async function safeRecord(logger, entry) {
  if (typeof logger?.record !== "function") {
    return
  }
  try {
    await logger.record(entry)
  } catch {
    // Network logging must never change request behavior.
  }
}

function normalizeEntry(entry, timestamp) {
  const normalized = {
    timestamp: timestamp.toISOString(),
    source: safeToken(entry?.source) || "unknown",
    method: (safeToken(entry?.method) || "GET").toUpperCase(),
    url: sanitizeUrl(entry?.url),
    status: integerStatus(entry?.status),
    outcome: safeToken(entry?.outcome) || "unknown",
    durationMs: nonNegativeInteger(entry?.durationMs)
  }
  const proxy = sanitizeUrl(entry?.proxyUrl)
  if (proxy) {
    normalized.proxy = proxy
  }
  const attempt = positiveInteger(entry?.attempt)
  if (attempt) {
    normalized.attempt = attempt
  }
  const errorName = safeToken(entry?.errorName)
  if (errorName) {
    normalized.errorName = errorName
  }
  const code = safeToken(entry?.errorCode)
  if (code) {
    normalized.errorCode = code
  }
  return normalized
}

function sanitizeUrl(value) {
  const text = String(value || "").trim()
  if (!text) {
    return ""
  }
  try {
    const url = new URL(text)
    url.username = ""
    url.password = ""
    url.search = ""
    url.hash = ""
    return url.href
  } catch {
    return "invalid-url"
  }
}

async function removeExpiredLogs(directory, currentDate, retentionDays) {
  const cutoff = new Date(
    currentDate.getFullYear(),
    currentDate.getMonth(),
    currentDate.getDate() - retentionDays + 1
  )
  const cutoffKey = localDateKey(cutoff)
  const entries = await readdir(directory, { withFileTypes: true })
  await Promise.all(entries.map(async (entry) => {
    if (!entry.isFile()) {
      return
    }
    const match = entry.name.match(LOG_FILE_PATTERN)
    if (match && match[1] < cutoffKey) {
      await rm(new URL(entry.name, directory), { force: true })
    }
  }))
}

function localDateKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-")
}

function validDate(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    throw new TypeError("网络日志时间无效")
  }
  return date
}

function integerStatus(value) {
  const number = Number(value)
  return Number.isInteger(number) && number >= 100 && number <= 599 ? number : null
}

function positiveInteger(value) {
  const number = Number(value)
  return Number.isInteger(number) && number > 0 ? number : null
}

function nonNegativeInteger(value) {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : 0
}

function safeToken(value) {
  return String(value || "").trim().slice(0, 100)
}

function errorCode(error) {
  return safeToken(
    error?.code
    || error?.cause?.code
    || error?.cause?.cause?.code
  )
}

function isTimeoutError(error) {
  return ["AbortError", "APIConnectionTimeoutError", "TimeoutError"].includes(error?.name)
    || ["ETIMEDOUT", "ESOCKETTIMEDOUT"].includes(error?.code)
}
