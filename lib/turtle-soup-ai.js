const MAX_RAW_CONTENT_LENGTH = 12000

export async function optimizeTurtleSoup(rawContent, ai = {}, fetchImpl = fetch) {
  if (!ai.enabled) {
    throw new Error("海龟汤 AI 优化未启用")
  }
  const endpoint = String(ai.endpoint || "").trim()
  const apiKey = String(ai.apiKey || "").trim()
  const model = String(ai.model || "").trim()
  if (!endpoint || !apiKey || !model) {
    throw new Error("海龟汤 AI 配置不完整")
  }
  if (rawContent.length > MAX_RAW_CONTENT_LENGTH) {
    throw new Error(`海龟汤原始内容不能超过 ${MAX_RAW_CONTENT_LENGTH} 字符`)
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), Number(ai.timeoutMs || 30000))
  try {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: Number(ai.maxTokens || 1200),
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: [
              "你是海龟汤题库编辑。只整理用户提供的事实，不得补充或猜测新情节。",
              "输出严格 JSON 对象，字段为 title、surface、bottom、adjudicationNotes、enabled。",
              "title 是简短标题；surface 是只供玩家看到的汤面；bottom 是完整真相；",
              "adjudicationNotes 记录裁决边界和可接受表述，没有则为空字符串；enabled 固定为 true。",
              "不要输出 Markdown、代码围栏或额外文字。"
            ].join("\n")
          },
          { role: "user", content: rawContent }
        ]
      })
    })
    if (!response.ok) {
      const detail = await response.text().catch(() => "")
      throw new Error(`海龟汤 AI 请求失败（HTTP ${response.status}）${detail ? `：${detail.slice(0, 200)}` : ""}`)
    }
    const payload = await response.json()
    return validateTurtleSoupSubmission(parseJsonObject(payload?.choices?.[0]?.message?.content))
  } finally {
    clearTimeout(timeout)
  }
}

export function parseJsonObject(content) {
  const text = String(content || "").trim()
  const unfenced = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
  const start = unfenced.indexOf("{")
  const end = unfenced.lastIndexOf("}")
  if (start < 0 || end < start) {
    throw new Error("海龟汤 AI 未返回 JSON 对象")
  }
  try {
    return JSON.parse(unfenced.slice(start, end + 1))
  } catch {
    throw new Error("海龟汤 AI 返回的 JSON 无法解析")
  }
}

export function validateTurtleSoupSubmission(value) {
  const submission = {
    title: String(value?.title || "").trim(),
    surface: String(value?.surface || "").trim(),
    bottom: String(value?.bottom || "").trim(),
    adjudicationNotes: String(value?.adjudicationNotes || "").trim(),
    enabled: true
  }
  if (!submission.title || !submission.surface || !submission.bottom) {
    throw new Error("海龟汤 AI 返回内容缺少标题、汤面或汤底")
  }
  return submission
}
