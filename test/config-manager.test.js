import test from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"

import {
  loadManagedConfig,
  prepareManagedConfig
} from "../config/manager.js"

const defaults = {
  configVersion: 1,
  requestTimeoutMs: 5000,
  accessToken: "",
  nested: {
    enabled: false,
    apiKey: ""
  },
  backends: [
    {
      key: "A",
      name: "1号千星",
      baseUrl: "http://127.0.0.1:18888",
      accessToken: ""
    }
  ]
}

test("creates a complete ignored user config on first load", async (t) => {
  const directory = await temporaryDirectory(t)
  const configPath = path.join(directory, "config.js")
  const configUrl = pathToFileURL(configPath)
  const messages = []

  const config = await loadManagedConfig(defaults, configUrl, {
    log: (message) => messages.push(message)
  })

  assert.deepEqual(config, defaults)
  const source = await readFile(configPath, "utf8")
  assert.match(source, /^export default \{/)
  assert.match(source, /"configVersion": 1/)
  assert.deepEqual(await importConfig(configUrl), defaults)
  assert.deepEqual(messages, ["已生成本地配置 config/config.js"])
})

test("migrates versionless configs without losing secrets or custom fields", async (t) => {
  const directory = await temporaryDirectory(t)
  const configPath = path.join(directory, "config.js")
  const configUrl = pathToFileURL(configPath)
  await writeFile(configPath, `// 历史配置允许注释、未引号键、单引号和尾逗号
export default {
  requestTimeoutMs: 9000,
  accessToken: 'backend-secret',
  nested: { apiKey: "ai-secret" },
  backends: [{
    key: "X",
    name: "自定义后端",
    baseUrl: "http://10.0.0.8:18888",
    customFlag: true,
  }],
  customRoot: "keep-me",
}
`, "utf8")

  const messages = []
  const config = await loadManagedConfig(defaults, configUrl, {
    log: (message) => messages.push(message)
  })

  assert.equal(config.configVersion, 1)
  assert.equal(config.requestTimeoutMs, 9000)
  assert.equal(config.accessToken, "backend-secret")
  assert.deepEqual(config.nested, { enabled: false, apiKey: "ai-secret" })
  assert.equal(config.backends.length, 1)
  assert.deepEqual(config.backends[0], {
    key: "X",
    name: "自定义后端",
    baseUrl: "http://10.0.0.8:18888",
    accessToken: "",
    customFlag: true
  })
  assert.equal(config.customRoot, "keep-me")
  assert.deepEqual(await importConfig(configUrl), config)
  assert.deepEqual(messages, ["已迁移本地配置 v0 -> v1"])
  assert.deepEqual(await readdir(directory), ["config.js"])
})

test("does not rewrite complete current or future-version configs", () => {
  const current = {
    ...defaults,
    customRoot: true
  }
  const currentPlan = prepareManagedConfig(defaults, current)
  assert.equal(currentPlan.shouldWrite, false)
  assert.equal(currentPlan.config.customRoot, true)

  const future = {
    ...defaults,
    configVersion: 9,
    requestTimeoutMs: 1234
  }
  const futurePlan = prepareManagedConfig(defaults, future)
  assert.equal(futurePlan.shouldWrite, false)
  assert.equal(futurePlan.config.configVersion, 9)
  assert.equal(futurePlan.config.requestTimeoutMs, 1234)
})

test("rejects invalid config modules without overwriting them", async (t) => {
  const directory = await temporaryDirectory(t)
  const configPath = path.join(directory, "config.js")
  const configUrl = pathToFileURL(configPath)
  const invalidSource = "export default { invalid\n"
  await writeFile(configPath, invalidSource, "utf8")

  await assert.rejects(
    loadManagedConfig(defaults, configUrl, { log: () => {} }),
    /无法加载本地配置/
  )
  assert.equal(await readFile(configPath, "utf8"), invalidSource)
})

test("rejects null or missing default exports without overwriting them", async (t) => {
  for (const source of ["export default null\n", "export const config = {}\n"]) {
    const directory = await temporaryDirectory(t)
    const configPath = path.join(directory, "config.js")
    const configUrl = pathToFileURL(configPath)
    await writeFile(configPath, source, "utf8")

    await assert.rejects(
      loadManagedConfig(defaults, configUrl, { log: () => {} }),
      /无法加载本地配置/
    )
    assert.equal(await readFile(configPath, "utf8"), source)
  }
})

test("refuses to rewrite executable config values", async (t) => {
  const directory = await temporaryDirectory(t)
  const configPath = path.join(directory, "config.js")
  const configUrl = pathToFileURL(configPath)
  const executableSource = "export default { customValue: () => true }\n"
  await writeFile(configPath, executableSource, "utf8")

  await assert.rejects(
    loadManagedConfig(defaults, configUrl, { log: () => {} }),
    /无法加载本地配置/
  )
  assert.equal(await readFile(configPath, "utf8"), executableSource)
})

test("does not evaluate environment expressions during migration", async (t) => {
  const directory = await temporaryDirectory(t)
  const configPath = path.join(directory, "config.js")
  const configUrl = pathToFileURL(configPath)
  const dynamicSource = "export default { accessToken: process.env.MILIASTRA_TOKEN }\n"
  await writeFile(configPath, dynamicSource, "utf8")

  await assert.rejects(
    loadManagedConfig(defaults, configUrl, { log: () => {} }),
    /无法加载本地配置/
  )
  assert.equal(await readFile(configPath, "utf8"), dynamicSource)
})

test("rejects executable expressions even when they return plain data", async (t) => {
  const directory = await temporaryDirectory(t)
  const configPath = path.join(directory, "config.js")
  const configUrl = pathToFileURL(configPath)
  const executableSource = "export default (() => ({ configVersion: 1 }))()\n"
  await writeFile(configPath, executableSource, "utf8")

  await assert.rejects(
    loadManagedConfig(defaults, configUrl, { log: () => {} }),
    /无法加载本地配置/
  )
  assert.equal(await readFile(configPath, "utf8"), executableSource)
})

test("rejects an explicitly invalid config version", async (t) => {
  const directory = await temporaryDirectory(t)
  const configPath = path.join(directory, "config.js")
  const configUrl = pathToFileURL(configPath)
  const invalidVersionSource = "export default { configVersion: 'broken' }\n"
  await writeFile(configPath, invalidVersionSource, "utf8")

  await assert.rejects(
    loadManagedConfig(defaults, configUrl, { log: () => {} }),
    /configVersion 必须是非负整数/
  )
  assert.equal(await readFile(configPath, "utf8"), invalidVersionSource)
})

test("custom backends inherit only fields common to all default backends", () => {
  const plan = prepareManagedConfig({
    configVersion: 1,
    backends: [
      { key: "A", baseUrl: "http://a", accessToken: "", transport: "http" },
      { key: "B", baseUrl: "http://b", accessToken: "", transport: "http" }
    ]
  }, {
    configVersion: 1,
    backends: [{ key: "X", baseUrl: "http://x" }]
  })

  assert.deepEqual(plan.config.backends, [{
    key: "X",
    baseUrl: "http://x",
    accessToken: "",
    transport: "http"
  }])

  const singleDefaultPlan = prepareManagedConfig(defaults, {
    configVersion: 1,
    backends: [{ key: "X", baseUrl: "http://x" }]
  })
  assert.deepEqual(singleDefaultPlan.config.backends, [{
    key: "X",
    baseUrl: "http://x",
    accessToken: ""
  }])
})

test("migrates v1 AI settings to Responses API fields without losing secrets", () => {
  const version2Defaults = {
    configVersion: 2,
    turtleSoupAi: {
      endpoint: "https://api.openai.com/v1/responses",
      apiKey: "",
      model: "gpt-5.6",
      reasoningEffort: "medium",
      verbosity: "high",
      maxOutputTokens: 16384,
      timeoutMs: 180000,
      systemPrompt: "default prompt"
    }
  }
  const plan = prepareManagedConfig(version2Defaults, {
    configVersion: 1,
    turtleSoupAi: {
      enabled: true,
      endpoint: "https://gateway.example/v1/responses",
      apiKey: "keep-secret",
      model: "custom-model",
      timeoutMs: 90000,
      maxTokens: 4096
    }
  })

  assert.equal(plan.fromVersion, 1)
  assert.equal(plan.toVersion, 2)
  assert.equal(plan.shouldWrite, true)
  assert.deepEqual(plan.config.turtleSoupAi, {
    endpoint: "https://gateway.example/v1/responses",
    apiKey: "keep-secret",
    model: "custom-model",
    reasoningEffort: "medium",
    verbosity: "high",
    maxOutputTokens: 4096,
    timeoutMs: 90000,
    systemPrompt: "default prompt"
  })
})

test("moves an unused v1 default AI provider to the new OpenAI default", () => {
  const plan = prepareManagedConfig({
    configVersion: 2,
    turtleSoupAi: {
      endpoint: "https://api.openai.com/v1/responses",
      apiKey: "",
      model: "gpt-5.6",
      maxOutputTokens: 16384,
      timeoutMs: 180000
    }
  }, {
    configVersion: 1,
    turtleSoupAi: {
      enabled: false,
      endpoint: "https://api.deepseek.com/chat/completions",
      apiKey: "",
      model: "deepseek-chat",
      maxTokens: 1200,
      timeoutMs: 30000
    }
  })

  assert.deepEqual(plan.config.turtleSoupAi, {
    endpoint: "https://api.openai.com/v1/responses",
    apiKey: "",
    model: "gpt-5.6",
    maxOutputTokens: 16384,
    timeoutMs: 180000
  })
})

async function temporaryDirectory(t) {
  const directory = await mkdtemp(path.join(tmpdir(), "miliastra-yunzai-config-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  return directory
}

async function importConfig(url) {
  return (await import(`${url.href}?test=${Date.now()}-${Math.random()}`)).default
}
