import test from "node:test"
import assert from "node:assert/strict"

import defaultConfig from "../config/default.js"

test("defaults turtle soup editing to GPT-5.6 Responses API settings", () => {
  assert.equal(defaultConfig.configVersion, 2)
  assert.deepEqual({
    endpoint: defaultConfig.turtleSoupAi.endpoint,
    model: defaultConfig.turtleSoupAi.model,
    reasoningEffort: defaultConfig.turtleSoupAi.reasoningEffort,
    verbosity: defaultConfig.turtleSoupAi.verbosity,
    maxOutputTokens: defaultConfig.turtleSoupAi.maxOutputTokens,
    timeoutMs: defaultConfig.turtleSoupAi.timeoutMs
  }, {
    endpoint: "https://api.openai.com/v1/responses",
    model: "gpt-5.6",
    reasoningEffort: "medium",
    verbosity: "high",
    maxOutputTokens: 16384,
    timeoutMs: 180000
  })
  assert.equal(defaultConfig.turtleSoupAi.apiKey, "")
  assert.match(defaultConfig.turtleSoupAi.systemPrompt, /你是一名海龟汤题库编辑/)
  assert.match(defaultConfig.turtleSoupAi.systemPrompt, /不调用任何工具或接口/)
  assert.match(defaultConfig.turtleSoupAi.systemPrompt, /不得生成 enabled、id、position、total/)
  assert.equal(Object.hasOwn(defaultConfig.turtleSoupAi, "enabled"), false)
})
