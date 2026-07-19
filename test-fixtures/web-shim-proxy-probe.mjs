await import("openai/shims/web")

const { optimizeTurtleSoup } = await import("../lib/turtle-soup-ai.js")

const result = await optimizeTurtleSoup({ rawContent: "初稿" }, {
  endpoint: process.env.TEST_AI_ENDPOINT,
  proxyUrl: process.env.TEST_PROXY_URL,
  apiKey: "secret",
  model: "test-model",
  reasoningEffort: "medium",
  verbosity: "high",
  extraBody: {},
  maxOutputTokens: 1000,
  timeoutMs: 5000,
  systemPrompt: "系统提示词"
})

if (result.title !== "灯塔") {
  throw new Error("代理探针返回了意外结果")
}
