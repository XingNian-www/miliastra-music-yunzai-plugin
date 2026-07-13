export default {
  configVersion: 1,
  requestTimeoutMs: 5000,
  queuePreviewLimit: 5,
  screenshotQuality: 88,
  accessToken: "",
  turtleSoupAi: {
    enabled: false,
    endpoint: "https://api.deepseek.com/chat/completions",
    apiKey: "",
    model: "deepseek-chat",
    timeoutMs: 30000,
    maxTokens: 1200
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
