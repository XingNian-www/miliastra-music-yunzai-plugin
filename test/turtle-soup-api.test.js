import test from "node:test"
import assert from "node:assert/strict"

import { submitTurtleSoupQuestion } from "../lib/turtle-soup-api.js"

const backend = {
  baseUrl: "http://127.0.0.1:18888/",
  accessToken: "backend-secret"
}
const draft = {
  title: "标题",
  surface: "汤面",
  bottom: "汤底",
  adjudicationNotes: "裁决",
  logicReview: "1. [一般] 存在另一个同样合理的解释。",
  enabled: false,
  id: "must-not-be-sent"
}

test("submits only accepted fields and forces enabled true", async () => {
  let request
  const receipt = await submitTurtleSoupQuestion(backend, draft, {
    timeoutMs: 1000,
    fetchImpl: async (url, options) => {
      request = { url: String(url), options }
      return responseJson({ id: "soup-0001", position: 1, total: 1 })
    }
  })

  assert.equal(request.url, "http://127.0.0.1:18888/turtle-soup/questions")
  assert.equal(request.options.headers["X-Miliastra-Token"], "backend-secret")
  assert.deepEqual(JSON.parse(request.options.body), {
    title: "标题",
    surface: "汤面",
    bottom: "汤底",
    adjudicationNotes: "裁决",
    enabled: true
  })
  assert.deepEqual(receipt, { id: "soup-0001", position: 1, total: 1 })
})

test("adds the contributor to the surface only when building the final JSON", async () => {
  let requestBody
  await submitTurtleSoupQuestion(backend, draft, {
    contributorName: "投稿者",
    timeoutMs: 1000,
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body)
      return responseJson({ id: "soup-0002", position: 2, total: 2 })
    }
  })

  assert.equal(requestBody.surface, "此题由投稿者提供:汤面")
  assert.equal(Object.hasOwn(requestBody, "logicReview"), false)
  assert.equal(draft.surface, "汤面")
})

test("retries one non-successful response before returning success", async () => {
  let attempts = 0
  const networkEntries = []
  const receipt = await submitTurtleSoupQuestion(backend, draft, {
    timeoutMs: 1000,
    networkLogger: {
      record(entry) {
        networkEntries.push(entry)
      }
    },
    fetchImpl: async () => {
      attempts += 1
      if (attempts === 1) {
        return responseJson({ error: "暂时不可用" }, { ok: false, status: 503 })
      }
      return responseJson({ id: "soup-0002", position: 2, total: 2 })
    }
  })

  assert.equal(attempts, 2)
  assert.equal(receipt.id, "soup-0002")
  assert.deepEqual(networkEntries.map((entry) => ({
    source: entry.source,
    attempt: entry.attempt,
    status: entry.status,
    outcome: entry.outcome
  })), [
    { source: "turtle-soup-submit", attempt: 1, status: 503, outcome: "http_error" },
    { source: "turtle-soup-submit", attempt: 2, status: 200, outcome: "success" }
  ])
})

test("retries one network failure and reports the second failure", async () => {
  let attempts = 0
  await assert.rejects(
    submitTurtleSoupQuestion(backend, draft, {
      timeoutMs: 1000,
      fetchImpl: async () => {
        attempts += 1
        throw new Error(`network-${attempts}`)
      }
    }),
    /network-2/
  )
  assert.equal(attempts, 2)
})

test("reports the second HTTP failure after exactly two attempts", async () => {
  let attempts = 0
  await assert.rejects(
    submitTurtleSoupQuestion(backend, draft, {
      timeoutMs: 1000,
      fetchImpl: async () => {
        attempts += 1
        return responseJson({ error: "拒绝投稿" }, { ok: false, status: 400 })
      }
    }),
    /HTTP 400.*拒绝投稿/
  )
  assert.equal(attempts, 2)
})

function responseJson(payload, options = {}) {
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    async json() {
      return payload
    },
    async text() {
      return JSON.stringify(payload)
    }
  }
}
