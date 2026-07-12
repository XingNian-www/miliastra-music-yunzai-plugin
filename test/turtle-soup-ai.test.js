import test from "node:test"
import assert from "node:assert/strict"

import {
  optimizeTurtleSoup,
  parseJsonObject,
  validateTurtleSoupSubmission
} from "../lib/turtle-soup-ai.js"

test("parses fenced JSON returned by compatible providers", () => {
  assert.deepEqual(parseJsonObject("```json\n{\"title\":\"灯\"}\n```"), { title: "灯" })
})

test("normalizes a complete structured submission", () => {
  assert.deepEqual(
    validateTurtleSoupSubmission({
      title: " 标题 ",
      surface: " 汤面 ",
      bottom: " 汤底 "
    }),
    {
      title: "标题",
      surface: "汤面",
      bottom: "汤底",
      adjudicationNotes: "",
      enabled: true
    }
  )
})

test("rejects output missing required puzzle content", () => {
  assert.throws(
    () => validateTurtleSoupSubmission({ title: "标题", surface: "汤面" }),
    /缺少标题、汤面或汤底/
  )
})

test("optimizes through an OpenAI-compatible request without changing the returned facts", async () => {
  let request
  const fetchImpl = async (endpoint, options) => {
    request = { endpoint, options }
    return {
      ok: true,
      async json() {
        return {
          choices: [{
            message: {
              content: JSON.stringify({
                title: "灯塔",
                surface: "男人关灯后死了很多人。",
                bottom: "男人是灯塔管理员。",
                adjudicationNotes: "灯指灯塔。"
              })
            }
          }]
        }
      }
    }
  }

  const result = await optimizeTurtleSoup("原始题目", {
    enabled: true,
    endpoint: "https://example.com/chat/completions",
    apiKey: "secret",
    model: "test-model",
    timeoutMs: 1000
  }, fetchImpl)

  assert.equal(request.endpoint, "https://example.com/chat/completions")
  assert.equal(request.options.headers.Authorization, "Bearer secret")
  const body = JSON.parse(request.options.body)
  assert.equal(body.messages.at(-1).content, "原始题目")
  assert.equal(result.bottom, "男人是灯塔管理员。")
  assert.equal(result.enabled, true)
})
