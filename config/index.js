import defaultConfig from "./default.js"
import { loadManagedConfig, reloadManagedConfig } from "./manager.js"

const userConfigUrl = new URL("./config.js", import.meta.url)
const config = await loadManagedConfig(defaultConfig, userConfigUrl)

export async function reloadConfig(options = {}) {
  return reloadManagedConfig(config, defaultConfig, userConfigUrl, options)
}

export default config
