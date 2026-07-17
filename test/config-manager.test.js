import test from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"

import {
  loadManagedConfig,
  prepareManagedConfig,
  reloadManagedConfig
} from "../config/manager.js"
import defaultConfig from "../config/default.js"

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

test("rejects versionless, older, and future configs instead of migrating them", () => {
  for (const config of [
    {},
    { ...defaultConfig, configVersion: defaultConfig.configVersion - 1 },
    { ...defaultConfig, configVersion: defaultConfig.configVersion + 1 }
  ]) {
    assert.throws(
      () => prepareManagedConfig(defaultConfig, config),
      /configVersion/
    )
  }
})

test("rejects current configs with missing fields instead of filling defaults", () => {
  const config = structuredClone(defaultConfig)
  delete config.turtleSoupAi.proxyUrl

  assert.throws(
    () => prepareManagedConfig(defaultConfig, config),
    /turtleSoupAi\.proxyUrl/
  )
})

test("rejects unknown fields outside the explicitly open extraBody object", () => {
  const cases = [
    ["customRoot", (config) => { config.customRoot = true }],
    ["turtleSoupAi.customOption", (config) => { config.turtleSoupAi.customOption = true }],
    ["backends.0.transport", (config) => { config.backends[0].transport = "http" }]
  ]

  for (const [path, mutate] of cases) {
    const config = structuredClone(defaultConfig)
    mutate(config)
    assert.throws(
      () => prepareManagedConfig(defaultConfig, config),
      new RegExp(path.replaceAll(".", "\\."))
    )
  }
})

test("rejects current fields whose value types do not match the schema", () => {
  const cases = [
    ["requestTimeoutMs", (config) => { config.requestTimeoutMs = "5000" }],
    ["turtleSoupAi.extraBody", (config) => { config.turtleSoupAi.extraBody = [] }],
    ["backends.0.accessToken", (config) => { config.backends[0].accessToken = null }]
  ]

  for (const [path, mutate] of cases) {
    const config = structuredClone(defaultConfig)
    mutate(config)
    assert.throws(
      () => prepareManagedConfig(defaultConfig, config),
      new RegExp(path.replaceAll(".", "\\."))
    )
  }
})

test("accepts a complete custom backend using the current backend schema", () => {
  const config = structuredClone(defaultConfig)
  config.backends = [{
    key: "X",
    name: "自定义千星",
    baseUrl: "http://10.0.0.8:18888",
    accessToken: "backend-secret"
  }]

  const plan = prepareManagedConfig(defaultConfig, config)

  assert.equal(plan.shouldWrite, false)
  assert.deepEqual(plan.config, config)
})

test("loads a complete current config without rewriting its source", async (t) => {
  const directory = await temporaryDirectory(t)
  const configPath = path.join(directory, "config.js")
  const configUrl = pathToFileURL(configPath)
  const source = `// 当前配置中的注释应保留\nexport default ${JSON.stringify(defaults)}\n`
  await writeFile(configPath, source, "utf8")
  const messages = []

  const config = await loadManagedConfig(defaults, configUrl, {
    log: (message) => messages.push(message)
  })

  assert.deepEqual(config, defaults)
  assert.equal(await readFile(configPath, "utf8"), source)
  assert.deepEqual(messages, [])
})

test("preserves custom AI extraBody fields in current configs", () => {
  const localConfig = structuredClone(defaultConfig)
  localConfig.turtleSoupAi.extraBody = {
    enable_thinking: true,
    vendor_options: { modes: ["fast", "stable"] }
  }

  const plan = prepareManagedConfig(defaultConfig, localConfig)

  assert.equal(plan.shouldWrite, false)
  assert.deepEqual(plan.config.turtleSoupAi.extraBody, localConfig.turtleSoupAi.extraBody)
})

test("reloads config in place and keeps the current config when reloading fails", async (t) => {
  const directory = await temporaryDirectory(t)
  const configPath = path.join(directory, "config.js")
  const configUrl = pathToFileURL(configPath)
  const activeConfig = structuredClone(defaults)
  activeConfig.requestTimeoutMs = 1000
  activeConfig.runtimeOnly = "remove-me"
  await writeFile(configPath, `export default {
  configVersion: 1,
  requestTimeoutMs: 9000,
  accessToken: "new-secret",
  nested: { enabled: true, apiKey: "ai-secret" },
  backends: []
}\n`, "utf8")

  const result = await reloadManagedConfig(activeConfig, defaults, configUrl, {
    log: () => {}
  })

  assert.equal(result, activeConfig)
  assert.equal(activeConfig.requestTimeoutMs, 9000)
  assert.equal(activeConfig.accessToken, "new-secret")
  assert.equal(Object.hasOwn(activeConfig, "runtimeOnly"), false)

  const snapshot = structuredClone(activeConfig)
  await writeFile(configPath, "export default { broken\n", "utf8")
  await assert.rejects(
    reloadManagedConfig(activeConfig, defaults, configUrl, { log: () => {} }),
    /无法加载本地配置/
  )
  assert.deepEqual(activeConfig, snapshot)
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

test("does not evaluate environment expressions while loading", async (t) => {
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

async function temporaryDirectory(t) {
  const directory = await mkdtemp(path.join(tmpdir(), "miliastra-yunzai-config-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  return directory
}

async function importConfig(url) {
  return (await import(`${url.href}?test=${Date.now()}-${Math.random()}`)).default
}
