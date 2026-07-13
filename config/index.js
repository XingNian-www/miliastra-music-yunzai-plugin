import defaultConfig from "./default.js"
import { loadManagedConfig } from "./manager.js"

const userConfigUrl = new URL("./config.js", import.meta.url)

export default await loadManagedConfig(defaultConfig, userConfigUrl)
