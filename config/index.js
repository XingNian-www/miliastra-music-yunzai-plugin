import { existsSync } from "node:fs"
import defaultConfig from "./default.js"

const userConfigUrl = new URL("./config.js", import.meta.url)
const userConfig = existsSync(userConfigUrl)
  ? (await import(userConfigUrl.href)).default || {}
  : {}

export default mergeConfig(defaultConfig, userConfig)

function mergeConfig(base, override) {
  const result = { ...base }

  for (const [key, value] of Object.entries(override || {})) {
    if (value === undefined) {
      continue
    }
    if (isPlainObject(value) && isPlainObject(base[key])) {
      result[key] = mergeConfig(base[key], value)
      continue
    }
    result[key] = value
  }

  return result
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}
