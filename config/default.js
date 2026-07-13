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
    model: "gpt-5.6",
    reasoningEffort: "medium",
    verbosity: "high",
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
