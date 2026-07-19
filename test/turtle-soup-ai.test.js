import test from "node:test"
import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { once } from "node:events"
import { createServer, request as httpRequest } from "node:http"
import { connect } from "node:net"
import { fileURLToPath } from "node:url"

import {
  buildTurtleSoupInput,
  optimizeTurtleSoup,
  validateTurtleSoupDraft
} from "../lib/turtle-soup-ai.js"

const completeDraft = {
  title: "灯塔",
  surface: "男人关灯后，远处发生了事故。",
  bottom: "男人是灯塔管理员，关闭的是指引船只的灯。",
  adjudicationNotes: "核心真相：男人关闭灯塔导致船只失去指引。主持裁决：灯是普通房间灯吗？=否（灯是灯塔的航标灯。）。",
  logicReview: "未发现明显逻辑漏洞。"
}

test("normalizes a complete structured draft without submission-only fields", () => {
  assert.deepEqual(
    validateTurtleSoupDraft({
      title: " 灯塔 ",
      surface: " 汤面 ",
      bottom: " 汤底 ",
      adjudicationNotes: " 裁决 ",
      logicReview: " 未发现明显逻辑漏洞。 "
    }),
    {
      title: "灯塔",
      surface: "汤面",
      bottom: "汤底",
      adjudicationNotes: "裁决",
      logicReview: "未发现明显逻辑漏洞。"
    }
  )
})

test("rejects output missing required puzzle content", () => {
  assert.throws(
    () => validateTurtleSoupDraft({ title: "标题", surface: "汤面", bottom: "汤底" }),
    /缺少标题、汤面、汤底、裁决备注或逻辑审查/
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
  const headers = new Headers(request.options.headers)
  assert.equal(headers.get("authorization"), "Bearer secret")
  assert.equal(headers.get("x-stainless-retry-count"), "0")
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
    "adjudicationNotes",
    "logicReview"
  ])
  assert.equal(body.text.format.schema.additionalProperties, false)
  assert.equal(body.max_output_tokens, 16384)
  assert.equal(body.store, false)
  assert.equal(body.stream, false)
  assert.equal(Object.hasOwn(body, "temperature"), false)
  assert.deepEqual(result, completeDraft)
})

test("logs AI request metadata without logging request content", async () => {
  const entries = []
  const result = await optimizeTurtleSoup({ rawContent: "不得写入日志的初稿" }, {
    ...aiConfig(),
    endpoint: "https://gateway.example/v1/responses?api-version=2026-07-19",
    proxyUrl: "http://proxy-user:proxy-password@127.0.0.1:7890"
  }, undefined, {
    proxyFetchImpl: async () => responseJson({
      status: "completed",
      output: [{
        type: "message",
        content: [{ type: "output_text", text: JSON.stringify(completeDraft) }]
      }]
    }),
    createProxyAgent: async () => ({ destroy() {} }),
    networkLogger: {
      record(entry) {
        entries.push(entry)
      }
    }
  })

  assert.deepEqual(result, completeDraft)
  assert.equal(entries.length, 1)
  assert.equal(entries[0].source, "turtle-soup-ai")
  assert.equal(entries[0].method, "POST")
  assert.equal(entries[0].url, "https://gateway.example/v1/responses?api-version=2026-07-19")
  assert.equal(entries[0].proxyUrl, "http://proxy-user:proxy-password@127.0.0.1:7890/")
  assert.equal(entries[0].status, 200)
  assert.equal(entries[0].outcome, "success")
  assert.equal(Object.hasOwn(entries[0], "input"), false)
})

test("passes safe extraBody fields while standard Responses fields win conflicts", async () => {
  let body
  const result = await optimizeTurtleSoup({ rawContent: "初稿" }, {
    ...aiConfig(),
    extraBody: {
      model: "vendor-model",
      instructions: "vendor instructions",
      input: "vendor input",
      reasoning: { effort: "none" },
      text: { verbosity: "low" },
      max_output_tokens: 1,
      store: true,
      stream: true,
      vendor_extension: {
        enabled: true,
        values: [1, null, "兼容"]
      }
    }
  }, async (_endpoint, options) => {
    body = JSON.parse(options.body)
    return responseJson({
      status: "completed",
      output: [{
        type: "message",
        content: [{ type: "output_text", text: JSON.stringify(completeDraft) }]
      }]
    })
  })

  assert.equal(body.model, "gpt-5.6")
  assert.equal(body.instructions, "系统提示词")
  assert.match(body.input, /用户初稿：\n初稿/)
  assert.deepEqual(body.reasoning, { effort: "medium" })
  assert.equal(body.text.verbosity, "high")
  assert.equal(body.text.format.type, "json_schema")
  assert.equal(body.max_output_tokens, 16384)
  assert.equal(body.store, false)
  assert.equal(body.stream, false)
  assert.deepEqual(body.vendor_extension, {
    enabled: true,
    values: [1, null, "兼容"]
  })
  assert.deepEqual(result, completeDraft)
})

test("rejects unsafe extraBody values before sending content", async () => {
  const cyclic = {}
  cyclic.self = cyclic
  const values = [
    null,
    [],
    Object.create({ inherited: true }),
    JSON.parse('{"__proto__":{"polluted":true}}'),
    cyclic,
    { unsupported: undefined }
  ]
  let calls = 0

  for (const extraBody of values) {
    await assert.rejects(
      optimizeTurtleSoup({ rawContent: "初稿" }, {
        ...aiConfig(),
        extraBody
      }, async () => {
        calls += 1
        return responseJson({})
      }),
      /extraBody/
    )
  }

  assert.equal(calls, 0)
  assert.equal({}.polluted, undefined)
})

test("preserves a complete custom Responses endpoint including its query", async () => {
  let requestedEndpoint
  const result = await optimizeTurtleSoup({ rawContent: "初稿" }, {
    ...aiConfig(),
    endpoint: "https://gateway.example/openai/v1/responses?api-version=2026-07-15"
  }, async (endpoint) => {
    requestedEndpoint = endpoint
    return responseJson({
      status: "completed",
      output: [{
        type: "message",
        content: [{ type: "output_text", text: JSON.stringify(completeDraft) }]
      }]
    })
  })

  assert.equal(
    requestedEndpoint,
    "https://gateway.example/openai/v1/responses?api-version=2026-07-15"
  )
  assert.deepEqual(result, completeDraft)
})

test("rejects duplicate endpoint query keys instead of silently collapsing them", async () => {
  let called = false
  await assert.rejects(
    optimizeTurtleSoup({ rawContent: "初稿" }, {
      ...aiConfig(),
      endpoint: "https://gateway.example/openai/v1/responses?scope=read&scope=write"
    }, async () => {
      called = true
      return responseJson({})
    }),
    /endpoint 不支持重复查询参数：scope/
  )
  assert.equal(called, false)
})

test("routes only AI requests through the configured HTTP proxy", async () => {
  let request
  let proxyUrl
  let destroyed = false
  const proxyAgent = {
    destroy() {
      destroyed = true
    }
  }
  const proxyFetchImpl = async (endpoint, options) => {
    request = { endpoint, options }
    return responseJson({
      status: "completed",
      output: [{
        type: "message",
        content: [{ type: "output_text", text: JSON.stringify(completeDraft) }]
      }]
    })
  }
  const result = await optimizeTurtleSoup({ rawContent: "初稿" }, {
    ...aiConfig(),
    proxyUrl: "http://127.0.0.1:7890"
  }, undefined, {
    proxyFetchImpl,
    createProxyAgent: async (value) => {
      proxyUrl = value
      return proxyAgent
    }
  })

  assert.equal(proxyUrl, "http://127.0.0.1:7890/")
  assert.equal(request.options.agent, proxyAgent)
  assert.equal(destroyed, true)
  assert.deepEqual(result, completeDraft)
})

test("uses the configured proxy even when TRSS provides global fetch", async (t) => {
  const receivedBodies = []
  const target = createServer((request, response) => {
    const chunks = []
    request.on("data", (chunk) => chunks.push(chunk))
    request.on("end", () => {
      receivedBodies.push(Buffer.concat(chunks).toString("utf8"))
      response.writeHead(200, { "Content-Type": "application/json" })
      response.end(JSON.stringify({
        status: "completed",
        output: [{
          type: "message",
          content: [{ type: "output_text", text: JSON.stringify(completeDraft) }]
        }]
      }))
    })
  })
  const targetPort = await listen(target)
  let proxyHits = 0
  const proxy = createServer((request, response) => {
    proxyHits += 1
    const targetUrl = new URL(request.url, `http://${request.headers.host}`)
    const forwarded = httpRequest(targetUrl, {
      method: request.method,
      headers: request.headers
    }, (targetResponse) => {
      response.writeHead(targetResponse.statusCode || 500, targetResponse.headers)
      targetResponse.pipe(response)
    })
    forwarded.on("error", (error) => response.destroy(error))
    request.pipe(forwarded)
  })
  proxy.on("connect", (request, clientSocket, head) => {
    proxyHits += 1
    const [host, port] = request.url.split(":")
    const targetSocket = connect(Number(port), host, () => {
      clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n")
      if (head.length) {
        targetSocket.write(head)
      }
      targetSocket.pipe(clientSocket)
      clientSocket.pipe(targetSocket)
    })
    targetSocket.on("error", (error) => clientSocket.destroy(error))
    clientSocket.on("error", () => targetSocket.destroy())
  })
  const proxyPort = await listen(proxy)
  t.after(async () => {
    await Promise.all([closeServer(proxy), closeServer(target)])
  })

  const result = await optimizeTurtleSoup({ rawContent: "初稿" }, {
    ...aiConfig(),
    endpoint: `http://127.0.0.1:${targetPort}/v1/responses`,
    proxyUrl: `http://127.0.0.1:${proxyPort}`
  }, globalThis.fetch)

  assert.ok(proxyHits > 0)
  assert.equal(receivedBodies.length, 1)
  assert.deepEqual(result, completeDraft)
})

test("does not bypass the proxy when another plugin initializes the OpenAI web shim", async (t) => {
  const target = createServer((_request, response) => {
    response.writeHead(200, { "Content-Type": "application/json" })
    response.end(JSON.stringify({
      status: "completed",
      output: [{
        type: "message",
        content: [{ type: "output_text", text: JSON.stringify(completeDraft) }]
      }]
    }))
  })
  const targetPort = await listen(target)
  let proxyHits = 0
  const proxy = createServer()
  proxy.on("connect", (request, clientSocket, head) => {
    proxyHits += 1
    const [host, port] = request.url.split(":")
    const targetSocket = connect(Number(port), host, () => {
      clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n")
      if (head.length) {
        targetSocket.write(head)
      }
      targetSocket.pipe(clientSocket)
      clientSocket.pipe(targetSocket)
    })
    targetSocket.on("error", (error) => clientSocket.destroy(error))
    clientSocket.on("error", () => targetSocket.destroy())
  })
  const proxyPort = await listen(proxy)
  t.after(async () => {
    await Promise.all([closeServer(proxy), closeServer(target)])
  })

  const fixture = fileURLToPath(new URL(
    "../test-fixtures/web-shim-proxy-probe.mjs",
    import.meta.url
  ))
  const child = spawn(process.execPath, [fixture], {
    env: {
      ...process.env,
      TEST_AI_ENDPOINT: `http://127.0.0.1:${targetPort}/v1/responses`,
      TEST_PROXY_URL: `http://127.0.0.1:${proxyPort}`
    },
    stdio: ["ignore", "pipe", "pipe"]
  })
  let stderr = ""
  child.stderr.setEncoding("utf8")
  child.stderr.on("data", (chunk) => {
    stderr += chunk
  })
  const [exitCode] = await once(child, "exit")

  assert.equal(exitCode, 0, stderr)
  assert.ok(proxyHits > 0)
})

test("rejects invalid AI proxy protocols before sending content", async () => {
  let called = false
  await assert.rejects(
    optimizeTurtleSoup({ rawContent: "初稿" }, {
      ...aiConfig(),
      proxyUrl: "socks5://127.0.0.1:1080"
    }, async () => {
      called = true
      return responseJson({})
    }),
    /proxyUrl 仅支持 http 或 https/
  )
  assert.equal(called, false)
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

test("does not let the SDK retry a failed AI request", async () => {
  let calls = 0
  await assert.rejects(
    optimizeTurtleSoup({ rawContent: "初稿" }, aiConfig(), async () => {
      calls += 1
      return responseJson({ error: { message: "temporary failure" } }, {
        ok: false,
        status: 500
      })
    }),
    /请求失败（HTTP 500）/
  )
  assert.equal(calls, 1)
})

test("keeps timeout failures compatible with the workflow AbortError mapping", async () => {
  const hangingFetch = async (_endpoint, options) => new Promise((_resolve, reject) => {
    const rejectAbort = () => {
      const error = new Error("aborted")
      error.name = "AbortError"
      reject(error)
    }
    if (options.signal.aborted) {
      rejectAbort()
      return
    }
    options.signal.addEventListener("abort", rejectAbort, { once: true })
  })

  await assert.rejects(
    optimizeTurtleSoup({ rawContent: "初稿" }, {
      ...aiConfig(),
      timeoutMs: 10
    }, hangingFetch),
    (error) => error.name === "AbortError" && /请求超时/.test(error.message)
  )
})

test("reports invalid JSON from a successful AI response", async () => {
  await assert.rejects(
    optimizeTurtleSoup({ rawContent: "初稿" }, aiConfig(), async () => new Response("{", {
      status: 200,
      headers: { "Content-Type": "application/json" }
    })),
    /返回的响应不是有效 JSON/
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

test("rejects non-HTTP AI endpoints before sending content", async () => {
  let called = false
  await assert.rejects(
    optimizeTurtleSoup({ rawContent: "初稿" }, {
      ...aiConfig(),
      endpoint: "file:///tmp/responses"
    }, async () => {
      called = true
      return responseJson({})
    }),
    /endpoint 仅支持 http 或 https/
  )
  assert.equal(called, false)
})

test("requires a complete Responses endpoint before sending content", async () => {
  let called = false
  await assert.rejects(
    optimizeTurtleSoup({ rawContent: "初稿" }, {
      ...aiConfig(),
      endpoint: "https://gateway.example/openai/v1"
    }, async () => {
      called = true
      return responseJson({})
    }),
    /endpoint 必须是完整的 \/responses 请求地址/
  )
  assert.equal(called, false)
})

function aiConfig() {
  return {
    endpoint: "https://api.openai.com/v1/responses",
    proxyUrl: "",
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
  return new Response(JSON.stringify(payload), {
    status: options.status ?? 200,
    headers: { "Content-Type": "application/json" }
  })
}

async function listen(server) {
  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  return server.address().port
}

async function closeServer(server) {
  server.close()
  await once(server, "close")
}
