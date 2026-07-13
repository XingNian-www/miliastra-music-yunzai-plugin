const DEFAULT_TTL_MS = 10 * 60 * 1000
const DEFAULT_MAX_ADJUSTMENTS = 10

export class TurtleSoupSubmissionWorkflow {
  constructor(options = {}) {
    if (typeof options.optimize !== "function" || typeof options.submit !== "function") {
      throw new TypeError("海龟汤投稿工作流需要 optimize 和 submit")
    }
    this.optimize = options.optimize
    this.submit = options.submit
    this.now = options.now || Date.now
    this.ttlMs = options.ttlMs || DEFAULT_TTL_MS
    this.maxAdjustments = options.maxAdjustments || DEFAULT_MAX_ADJUSTMENTS
    this.previews = new Map()
    this.busyUsers = new Set()
  }

  async start(userKey, request = {}) {
    const key = requiredKey(userKey)
    const backend = requiredBackend(request.backend)
    const rawContent = requiredText(request.rawContent, "海龟汤原始内容")
    this.assertNotBusy(key)
    this.previews.delete(key)

    const draft = await this.runExclusive(key, () => this.optimize({
      rawContent,
      difficulty: optionalText(request.difficulty),
      style: optionalText(request.style)
    }))
    const state = {
      backend,
      rawContent,
      difficulty: optionalText(request.difficulty),
      style: optionalText(request.style),
      draft: structuredClone(draft),
      adjustmentCount: 0,
      expiresAt: this.now() + this.ttlMs
    }
    this.previews.set(key, state)
    return previewView(state, this.maxAdjustments)
  }

  async adjust(userKey, adjustmentRequest) {
    const key = requiredKey(userKey)
    const request = requiredText(adjustmentRequest, "海龟汤修改要求")
    return this.runExclusive(key, async () => {
      const state = this.requirePreview(key)
      if (state.adjustmentCount >= this.maxAdjustments) {
        throw new TurtleSoupWorkflowError(
          "adjustment_limit",
          `每份海龟汤投稿最多调整 ${this.maxAdjustments} 次`
        )
      }

      const draft = await this.optimize({
        rawContent: state.rawContent,
        difficulty: state.difficulty,
        style: state.style,
        currentDraft: structuredClone(state.draft),
        adjustmentRequest: request
      })
      state.draft = structuredClone(draft)
      state.adjustmentCount += 1
      state.expiresAt = this.now() + this.ttlMs
      return previewView(state, this.maxAdjustments)
    })
  }

  async confirm(userKey) {
    const key = requiredKey(userKey)
    return this.runExclusive(key, async () => {
      const state = this.requirePreview(key)
      const receipt = await this.submit(
        structuredClone(state.backend),
        structuredClone(state.draft)
      )
      this.previews.delete(key)
      return {
        backendKey: state.backend.key,
        backendName: state.backend.name,
        receipt: structuredClone(receipt)
      }
    })
  }

  cancel(userKey) {
    const key = requiredKey(userKey)
    this.assertNotBusy(key)
    this.requirePreview(key)
    this.previews.delete(key)
    return true
  }

  discard(userKey) {
    const key = requiredKey(userKey)
    this.assertNotBusy(key)
    return this.previews.delete(key)
  }

  getPreview(userKey) {
    const key = requiredKey(userKey)
    const state = this.previews.get(key)
    if (!state) {
      return null
    }
    if (this.now() > state.expiresAt) {
      this.previews.delete(key)
      return null
    }
    return previewView(state, this.maxAdjustments)
  }

  requirePreview(userKey) {
    const state = this.previews.get(userKey)
    if (!state) {
      throw new TurtleSoupWorkflowError("missing", "没有待确认的海龟汤投稿")
    }
    if (this.now() > state.expiresAt) {
      this.previews.delete(userKey)
      throw new TurtleSoupWorkflowError("expired", "海龟汤投稿预览已过期")
    }
    return state
  }

  async runExclusive(userKey, operation) {
    this.assertNotBusy(userKey)
    this.busyUsers.add(userKey)
    try {
      return await operation()
    } finally {
      this.busyUsers.delete(userKey)
    }
  }

  assertNotBusy(userKey) {
    if (this.busyUsers.has(userKey)) {
      throw new TurtleSoupWorkflowError("busy", "海龟汤投稿正在处理中，请稍候")
    }
  }
}

export class TurtleSoupWorkflowError extends Error {
  constructor(code, message) {
    super(message)
    this.name = "TurtleSoupWorkflowError"
    this.code = code
  }
}

function previewView(state, maxAdjustments) {
  return {
    backendKey: state.backend.key,
    backendName: state.backend.name,
    draft: structuredClone(state.draft),
    adjustmentCount: state.adjustmentCount,
    remainingAdjustments: maxAdjustments - state.adjustmentCount,
    expiresAt: state.expiresAt
  }
}

function requiredKey(value) {
  return requiredText(value, "用户标识")
}

function requiredBackend(value) {
  if (!value || typeof value !== "object" || !optionalText(value.baseUrl)) {
    throw new Error("千星后端配置无效")
  }
  return structuredClone(value)
}

function requiredText(value, label) {
  const text = optionalText(value)
  if (!text) {
    throw new Error(`${label}不能为空`)
  }
  return text
}

function optionalText(value) {
  return typeof value === "string" ? value.trim() : ""
}
