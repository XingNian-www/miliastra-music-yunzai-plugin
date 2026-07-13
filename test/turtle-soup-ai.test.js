import test from "node:test"
import assert from "node:assert/strict"

import {
  buildTurtleSoupInput,
  optimizeTurtleSoup,
  validateTurtleSoupDraft
} from "../lib/turtle-soup-ai.js"

const completeDraft = {
  title: "灯塔",
  surface: "男人关灯后，远处发生了事故。",
  bottom: "男人是灯塔管理员，关闭的是指引船只的灯。",
  adjudicationNotes: "核心真相：男人关闭灯塔导致船只失去指引。主持裁决：灯是普通房间灯吗？=否（灯是灯塔的航标灯。）。"
}

test("normalizes a complete structured draft without submission-only fields", () => {
  assert.deepEqual(
    validateTurtleSoupDraft({
      title: " 灯塔 ",
      surface: " 汤面 ",
      bottom: " 汤底 ",
      adjudicationNotes: " 裁决 "
    }),
    {
      title: "灯塔",
      surface: "汤面",
      bottom: "汤底",
      adjudicationNotes: "裁决"
    }
  )
})

test("rejects output missing required puzzle content", () => {
  assert.throws(
    () => validateTurtleSoupDraft({ title: "标题", surface: "汤面", bottom: "汤底" }),
    /缺少标题、汤面、汤底或裁决备注/
  )
})

test("builds separate inputs for initial editing and adjustments", () => {
  assert.equal(buildTurtleSoupInput({
    rawContent: "标题：灯塔",
    difficulty: "高",
    style: "因果推理"
  }), [
    "任务：整理新的海龟汤投稿预览",
    "目标难度：高",
    "目标风格：因果推理",
    "",
    "用户初稿：",
    "标题：灯塔"
  ].join("\n"))

  const adjusted = buildTurtleSoupInput({
    rawContent: "原始初稿",
    currentDraft: completeDraft,
    adjustmentRequest: "缩短汤面"
  })
  assert.match(adjusted, /^任务：调整现有海龟汤投稿预览/)
  assert.match(adjusted, /当前结构化版本：\n\{"title":"灯塔"/)
  assert.match(adjusted, /修改要求：\n缩短汤面$/)
})

test("optimizes through the Responses API with strict structured output", async () => {
  let request
  const fetchImpl = async (endpoint, options) => {
    request = { endpoint, options }
    return responseJson({
      status: "completed",
      output: [{
        type: "message",
        content: [{ type: "output_text", text: JSON.stringify(completeDraft) }]
      }]
    })
  }

  const result = await optimizeTurtleSoup({
    rawContent: "原始题目",
    difficulty: "高",
    style: "现实"
  }, aiConfig(), fetchImpl)

  assert.equal(request.endpoint, "https://api.openai.com/v1/responses")
  assert.equal(request.options.headers.Authorization, "Bearer secret")
  const body = JSON.parse(request.options.body)
  assert.equal(body.model, "gpt-5.6")
  assert.equal(body.instructions, "系统提示词")
  assert.match(body.input, /用户初稿：\n原始题目/)
  assert.deepEqual(body.reasoning, { effort: "medium" })
  assert.equal(body.text.verbosity, "high")
  assert.equal(body.text.format.type, "json_schema")
  assert.equal(body.text.format.strict, true)
  assert.deepEqual(body.text.format.schema.required, [
    "title",
    "surface",
    "bottom",
    "adjudicationNotes"
  ])
  assert.equal(body.text.format.schema.additionalProperties, false)
  assert.equal(body.max_output_tokens, 16384)
  assert.equal(body.store, false)
  assert.equal(Object.hasOwn(body, "temperature"), false)
  assert.deepEqual(result, completeDraft)
})

test("rejects refusals and incomplete Responses API results", async () => {
  await assert.rejects(
    optimizeTurtleSoup({ rawContent: "初稿" }, aiConfig(), async () => responseJson({
      status: "completed",
      output: [{
        type: "message",
        content: [{ type: "refusal", refusal: "无法处理" }]
      }]
    })),
    /拒绝处理：无法处理/
  )

  await assert.rejects(
    optimizeTurtleSoup({ rawContent: "初稿" }, aiConfig(), async () => responseJson({
      status: "incomplete",
      incomplete_details: { reason: "max_output_tokens" },
      output: []
    })),
    /响应未完成：max_output_tokens/
  )
})

test("rejects legacy Chat Completions endpoints before sending content", async () => {
  let called = false
  await assert.rejects(
    optimizeTurtleSoup({ rawContent: "初稿" }, {
      ...aiConfig(),
      endpoint: "https://gateway.example/v1/chat/completions//"
    }, async () => {
      called = true
      return responseJson({})
    }),
    /endpoint 必须兼容 Responses API/
  )
  assert.equal(called, false)
})

function aiConfig() {
  return {
    endpoint: "https://api.openai.com/v1/responses",
    apiKey: "secret",
    model: "gpt-5.6",
    reasoningEffort: "medium",
    verbosity: "high",
    maxOutputTokens: 16384,
    timeoutMs: 1000,
    systemPrompt: "系统提示词"
  }
}

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
