import { DEFAULT_TURTLE_SOUP_SYSTEM_PROMPT } from "../lib/turtle-soup-prompt.js"

export default {
  configVersion: 3,
  requestTimeoutMs: 5000,
  queuePreviewLimit: 5,
  screenshotQuality: 88,
  accessToken: "",
  turtleSoupAi: {
    endpoint: "https://api.openai.com/v1/responses",
    proxyUrl: "",
    apiKey: "",
    // 使用 GPT-5.6；最高思维档位用于复杂海龟汤逻辑整理。
    model: "gpt-5.6",
    reasoningEffort: "max",
    verbosity: "high",
    extraBody: {},
    maxOutputTokens: 16384,
    timeoutMs: 180000,
    systemPrompt: DEFAULT_TURTLE_SOUP_SYSTEM_PROMPT
  },
  backends: [
    {
      key: "A",
      name: "1号千星",
      baseUrl: "http://127.0.0.1:18888",
      accessToken: ""
    },
    {
      key: "B",
      name: "2号千星",
      baseUrl: "http://127.0.0.1:18889",
      accessToken: ""
    }
  ]
}
