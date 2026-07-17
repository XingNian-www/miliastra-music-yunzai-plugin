import { existsSync } from "node:fs"
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { randomUUID } from "node:crypto"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { parseConfigModule } from "./data-parser.js"
import {
  assertSafeJsonData,
  cloneSafeJsonData,
  isPlainJsonObject as isPlainObject
} from "../lib/safe-json.js"

export async function loadManagedConfig(defaultConfig, userConfigUrl, options = {}) {
  const exists = existsSync(userConfigUrl)
  const userConfig = exists ? await importUserConfig(userConfigUrl) : defaultConfig
  const plan = prepareManagedConfig(defaultConfig, userConfig)

  if (!exists) {
    await writeConfigAtomically(userConfigUrl, plan.config)
    const log = options.log || defaultLog
    log("已生成本地配置 config/config.js")
  }

  return plan.config
}

export async function reloadManagedConfig(target, defaultConfig, userConfigUrl, options = {}) {
  if (!isPlainObject(target)) {
    throw new TypeError("运行时配置必须是对象")
  }
  const nextConfig = await loadManagedConfig(defaultConfig, userConfigUrl, options)
  for (const key of Object.keys(target)) {
    delete target[key]
  }
  Object.assign(target, nextConfig)
  return target
}

export function prepareManagedConfig(defaultConfig, userConfig) {
  if (!isPlainObject(defaultConfig)) {
    throw new TypeError("默认配置必须是对象")
  }
  if (!isPlainObject(userConfig)) {
    throw new TypeError("本地配置的 default export 必须是对象")
  }
  assertSafeJsonData(defaultConfig, { label: "默认配置" })
  assertSafeJsonData(userConfig, { label: "本地配置" })

  const currentVersion = readConfigVersion(defaultConfig, "默认配置")
  if (currentVersion < 1) {
    throw new Error("默认配置缺少有效的 configVersion")
  }

  const fromVersion = readConfigVersion(userConfig, "本地配置")
  if (fromVersion !== currentVersion) {
    throw new Error(
      `本地配置 configVersion=${fromVersion}，当前只支持 configVersion=${currentVersion}`
    )
  }
  assertCurrentShape(defaultConfig, userConfig)

  return {
    config: cloneSafeJsonData(userConfig, { label: "本地配置" }),
    fromVersion,
    toVersion: currentVersion,
    shouldWrite: false
  }
}

function assertCurrentShape(schema, value, pathParts = []) {
  if (isOpenObject(pathParts)) {
    if (!isPlainObject(value)) {
      throw new TypeError(`本地配置 ${displayPath(pathParts)} 必须是对象`)
    }
    return
  }

  if (Array.isArray(schema)) {
    if (!Array.isArray(value)) {
      throw new TypeError(`本地配置 ${displayPath(pathParts)} 必须是数组`)
    }
    const fallback = schema[0]
    for (const [index, item] of value.entries()) {
      const matching = isPlainObject(item)
        ? schema.find((candidate) => isPlainObject(candidate) && candidate.key === item.key)
        : undefined
      if (matching || fallback) {
        assertCurrentShape(matching || fallback, item, [...pathParts, index])
      }
    }
    return
  }

  if (!isPlainObject(schema)) {
    if (!sameValueType(schema, value)) {
      throw new TypeError(
        `本地配置 ${displayPath(pathParts)} 类型错误，应为 ${valueType(schema)}`
      )
    }
    return
  }

  if (!isPlainObject(value)) {
    throw new TypeError(`本地配置 ${displayPath(pathParts)} 必须是对象`)
  }

  for (const [key, childSchema] of Object.entries(schema)) {
    const childPath = [...pathParts, key]
    if (!Object.hasOwn(value, key)) {
      throw new Error(`本地配置缺少 ${displayPath(childPath)}`)
    }
    assertCurrentShape(childSchema, value[key], childPath)
  }

  for (const key of Object.keys(value)) {
    if (!Object.hasOwn(schema, key)) {
      throw new Error(`本地配置包含未知字段 ${displayPath([...pathParts, key])}`)
    }
  }
}

async function importUserConfig(userConfigUrl) {
  try {
    const source = await readFile(userConfigUrl, "utf8")
    const config = parseConfigModule(source)
    if (!isPlainObject(config)) {
      throw new TypeError("default export 必须是对象")
    }
    return cloneSafeJsonData(config, { label: "本地配置" })
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

function renderConfig(config) {
  return `export default ${JSON.stringify(config, null, 2)}\n`
}

function displayPath(pathParts) {
  return pathParts.length ? pathParts.join(".") : "<root>"
}

function readConfigVersion(config, label) {
  if (!Object.hasOwn(config, "configVersion")) {
    throw new Error(`${label}缺少 configVersion`)
  }
  const version = config.configVersion
  if (!Number.isInteger(version) || version < 0) {
    throw new TypeError(`${label} configVersion 必须是非负整数`)
  }
  return version
}

function isOpenObject(pathParts) {
  return pathParts.length === 2
    && pathParts[0] === "turtleSoupAi"
    && pathParts[1] === "extraBody"
}

function sameValueType(schema, value) {
  return schema === null ? value === null : typeof schema === typeof value
}

function valueType(value) {
  return value === null ? "null" : typeof value
}

function defaultLog(message) {
  if (typeof globalThis.logger?.info === "function") {
    globalThis.logger.info(`[千星点歌监控] ${message}`)
    return
  }
  console.info(`[千星点歌监控] ${message}`)
}
