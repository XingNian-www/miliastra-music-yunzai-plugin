import test from "node:test"
import assert from "node:assert/strict"

import defaultConfig from "../config/default.js"

test("defaults turtle soup editing to GPT-5.6 Responses API settings", () => {
  assert.equal(defaultConfig.configVersion, 3)
  assert.deepEqual({
    endpoint: defaultConfig.turtleSoupAi.endpoint,
    proxyUrl: defaultConfig.turtleSoupAi.proxyUrl,
    model: defaultConfig.turtleSoupAi.model,
    reasoningEffort: defaultConfig.turtleSoupAi.reasoningEffort,
    verbosity: defaultConfig.turtleSoupAi.verbosity,
    extraBody: defaultConfig.turtleSoupAi.extraBody,
    maxOutputTokens: defaultConfig.turtleSoupAi.maxOutputTokens,
    timeoutMs: defaultConfig.turtleSoupAi.timeoutMs
  }, {
    endpoint: "https://api.openai.com/v1/responses",
    proxyUrl: "",
    model: "gpt-5.6",
    reasoningEffort: "medium",
    verbosity: "high",
    extraBody: {},
    maxOutputTokens: 16384,
    timeoutMs: 180000
  })
  assert.equal(defaultConfig.turtleSoupAi.apiKey, "")
  assert.match(defaultConfig.turtleSoupAi.systemPrompt, /你是一名海龟汤题库审稿员/)
  assert.match(defaultConfig.turtleSoupAi.systemPrompt, /不调用任何工具或接口/)
  assert.match(defaultConfig.turtleSoupAi.systemPrompt, /未经明确要求，不得改写汤面或汤底/)
  assert.match(defaultConfig.turtleSoupAi.systemPrompt, /必须无条件执行/)
  assert.match(defaultConfig.turtleSoupAi.systemPrompt, /提示注入/)
  assert.match(defaultConfig.turtleSoupAi.systemPrompt, /240 个中文字符以内/)
  assert.match(defaultConfig.turtleSoupAi.systemPrompt, /logicReview/)
  assert.match(defaultConfig.turtleSoupAi.systemPrompt, /不得生成 enabled、id、position、total/)
  assert.equal(Object.hasOwn(defaultConfig.turtleSoupAi, "enabled"), false)
})
