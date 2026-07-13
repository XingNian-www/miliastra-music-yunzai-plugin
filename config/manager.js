import { existsSync } from "node:fs"
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { randomUUID } from "node:crypto"
import path from "node:path"
import { isDeepStrictEqual } from "node:util"
import { fileURLToPath } from "node:url"

import { parseConfigModule } from "./data-parser.js"

const MIGRATIONS = new Map([
  [1, (config) => config],
  [2, migrateToResponsesApi]
])
const BACKEND_IDENTITY_FIELDS = new Set(["key", "name", "baseUrl"])
const LEGACY_AI_ENDPOINT = "https://api.deepseek.com/chat/completions"
const LEGACY_AI_MODEL = "deepseek-chat"

export async function loadManagedConfig(defaultConfig, userConfigUrl, options = {}) {
  const exists = existsSync(userConfigUrl)
  const userConfig = exists ? await importUserConfig(userConfigUrl) : {}
  const plan = prepareManagedConfig(defaultConfig, userConfig)

  if (!exists || plan.shouldWrite) {
    await writeConfigAtomically(userConfigUrl, plan.config)
    const log = options.log || defaultLog
    if (!exists) {
      log("已生成本地配置 config/config.js")
    } else if (plan.fromVersion !== plan.toVersion) {
      log(`已迁移本地配置 v${plan.fromVersion} -> v${plan.toVersion}`)
    } else {
      log(`已补全本地配置 v${plan.toVersion}`)
    }
  }

  return plan.config
}

export function prepareManagedConfig(defaultConfig, userConfig) {
  if (!isPlainObject(defaultConfig)) {
    throw new TypeError("默认配置必须是对象")
  }
  if (!isPlainObject(userConfig)) {
    throw new TypeError("本地配置的 default export 必须是对象")
  }
  assertDataOnly(defaultConfig, "默认配置")
  assertDataOnly(userConfig, "本地配置")

  const currentVersion = readConfigVersion(defaultConfig, "默认配置", true)
  if (currentVersion < 1) {
    throw new Error("默认配置缺少有效的 configVersion")
  }

  const fromVersion = readConfigVersion(userConfig, "本地配置", false)
  if (fromVersion > currentVersion) {
    return {
      config: mergeWithDefaults(defaultConfig, userConfig),
      fromVersion,
      toVersion: fromVersion,
      shouldWrite: false
    }
  }

  let migrated = cloneValue(userConfig)
  for (let version = fromVersion + 1; version <= currentVersion; version += 1) {
    const migrate = MIGRATIONS.get(version)
    if (!migrate) {
      throw new Error(`缺少配置迁移步骤 v${version - 1} -> v${version}`)
    }
    migrated = migrate(migrated, defaultConfig)
    migrated.configVersion = version
  }

  const config = mergeWithDefaults(defaultConfig, migrated)
  config.configVersion = currentVersion
  return {
    config,
    fromVersion,
    toVersion: currentVersion,
    shouldWrite: !isDeepStrictEqual(userConfig, config)
  }
}

function migrateToResponsesApi(config, defaultConfig) {
  const migrated = cloneValue(config)
  const ai = migrated.turtleSoupAi
  if (!isPlainObject(ai)) {
    return migrated
  }

  const unusedLegacyProvider = !String(ai.apiKey || "").trim()
    && ai.endpoint === LEGACY_AI_ENDPOINT
    && ai.model === LEGACY_AI_MODEL
  const defaultAi = isPlainObject(defaultConfig.turtleSoupAi) ? defaultConfig.turtleSoupAi : {}
  if (unusedLegacyProvider) {
    ai.endpoint = defaultAi.endpoint
    ai.model = defaultAi.model
    ai.maxOutputTokens = defaultAi.maxOutputTokens
    ai.timeoutMs = defaultAi.timeoutMs
  } else if (!Object.hasOwn(ai, "maxOutputTokens") && Object.hasOwn(ai, "maxTokens")) {
    ai.maxOutputTokens = ai.maxTokens
  }
  delete ai.maxTokens
  delete ai.enabled
  return migrated
}

async function importUserConfig(userConfigUrl) {
  try {
    const source = await readFile(userConfigUrl, "utf8")
    const config = parseConfigModule(source)
    if (!isPlainObject(config)) {
      throw new TypeError("default export 必须是对象")
    }
    assertDataOnly(config, "本地配置")
    return structuredClone(config)
  } catch (error) {
    throw new Error(`无法加载本地配置 config/config.js：${error.message}`, { cause: error })
  }
}

async function writeConfigAtomically(userConfigUrl, config) {
  const configPath = fileURLToPath(userConfigUrl)
  const directory = path.dirname(configPath)
  const temporaryPath = `${configPath}.${process.pid}.${randomUUID()}.tmp`
  await mkdir(directory, { recursive: true })
  try {
    await writeFile(temporaryPath, renderConfig(config), {
      encoding: "utf8",
      mode: 0o600
    })
    await rename(temporaryPath, configPath)
  } finally {
    await rm(temporaryPath, { force: true })
  }
}

function mergeWithDefaults(defaultValue, userValue, pathParts = []) {
  if (Array.isArray(defaultValue)) {
    if (!Array.isArray(userValue)) {
      return cloneValue(userValue)
    }
    if (pathParts.at(-1) === "backends") {
      return userValue.map((item) => {
        if (!isPlainObject(item)) {
          return cloneValue(item)
        }
        const matching = defaultValue.find((candidate) =>
          isPlainObject(candidate) && candidate.key === item.key
        )
        const template = matching || commonObjectDefaults(defaultValue)
        return mergeWithDefaults(template, item, pathParts)
      })
    }
    return cloneValue(userValue)
  }

  if (!isPlainObject(defaultValue) || !isPlainObject(userValue)) {
    return cloneValue(userValue)
  }

  const result = cloneValue(defaultValue)
  for (const [key, value] of Object.entries(userValue)) {
    if (value === undefined) {
      continue
    }
    result[key] = Object.hasOwn(defaultValue, key)
      ? mergeWithDefaults(defaultValue[key], value, [...pathParts, key])
      : cloneValue(value)
  }
  return result
}

function cloneValue(value) {
  if (Array.isArray(value)) {
    return value.map(cloneValue)
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneValue(item)]))
  }
  return value
}

function renderConfig(config) {
  return `export default ${JSON.stringify(config, null, 2)}\n`
}

function commonObjectDefaults(values) {
  const objects = values.filter(isPlainObject)
  if (objects.length === 0) {
    return {}
  }
  const result = {}
  for (const [key, value] of Object.entries(objects[0])) {
    if (!BACKEND_IDENTITY_FIELDS.has(key) && objects.slice(1).every((item) =>
      Object.hasOwn(item, key) && isDeepStrictEqual(item[key], value)
    )) {
      result[key] = cloneValue(value)
    }
  }
  return result
}

function assertDataOnly(value, label, seen = new Set(), pathParts = []) {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return
  }
  if (typeof value !== "object") {
    throw new TypeError(`${label}仅支持普通数据：${displayPath(pathParts)}`)
  }
  if (!Array.isArray(value) && !isPlainObject(value)) {
    throw new TypeError(`${label}仅支持普通数据：${displayPath(pathParts)}`)
  }
  if (seen.has(value)) {
    throw new TypeError(`${label}仅支持普通数据，不能包含循环引用：${displayPath(pathParts)}`)
  }
  seen.add(value)
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key === "symbol") {
      throw new TypeError(`${label}仅支持普通数据：${displayPath(pathParts)}`)
    }
    if (Array.isArray(value) && key === "length") {
      continue
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor?.enumerable || descriptor.get || descriptor.set) {
      throw new TypeError(`${label}仅支持普通数据：${displayPath([...pathParts, key])}`)
    }
    assertDataOnly(descriptor.value, label, seen, [...pathParts, key])
  }
  seen.delete(value)
}

function displayPath(pathParts) {
  return pathParts.length ? pathParts.join(".") : "<root>"
}

function readConfigVersion(config, label, required) {
  if (!Object.hasOwn(config, "configVersion")) {
    if (required) {
      throw new Error(`${label}缺少 configVersion`)
    }
    return 0
  }
  const version = config.configVersion
  if (!Number.isInteger(version) || version < 0) {
    throw new TypeError(`${label} configVersion 必须是非负整数`)
  }
  return version
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false
  }
  const prototype = Object.getPrototypeOf(value)
  return prototype === null || (
    Object.prototype.toString.call(value) === "[object Object]"
    && Object.getPrototypeOf(prototype) === null
  )
}

function defaultLog(message) {
  if (typeof globalThis.logger?.info === "function") {
    globalThis.logger.info(`[千星点歌监控] ${message}`)
    return
  }
  console.info(`[千星点歌监控] ${message}`)
}
