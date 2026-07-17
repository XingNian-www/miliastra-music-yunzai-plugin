const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"])

export function isPlainJsonObject(value, { allowNullPrototype = true } = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false
  }
  const prototype = Object.getPrototypeOf(value)
  if (prototype === null) {
    return allowNullPrototype
  }
  return Object.prototype.toString.call(value) === "[object Object]"
    && Object.getPrototypeOf(prototype) === null
}

export function cloneSafeJsonObject(value, options = {}) {
  const settings = normalizeOptions(options)
  if (!isPlainJsonObject(value, settings)) {
    throw new TypeError(`${settings.label} 必须是普通 JSON 对象`)
  }
  return cloneSafeJsonValue(value, settings.rootPath, new Set(), settings)
}

export function cloneSafeJsonData(value, options = {}) {
  const settings = normalizeOptions(options)
  return cloneSafeJsonValue(value, settings.rootPath, new Set(), settings)
}

export function assertSafeJsonData(value, options = {}) {
  cloneSafeJsonData(value, options)
}

function normalizeOptions(options) {
  return {
    label: options.label || "JSON 数据",
    rootPath: options.rootPath || "<root>",
    allowNullPrototype: options.allowNullPrototype !== false
  }
}

function cloneSafeJsonValue(value, path, seen, settings) {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }
  if (typeof value !== "object") {
    throw new TypeError(`${settings.label} 仅支持 JSON 数据：${path}`)
  }
  if (seen.has(value)) {
    throw new TypeError(`${settings.label} 不能包含循环引用：${path}`)
  }

  seen.add(value)
  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) {
        throw new TypeError(`${settings.label} 仅支持普通 JSON 数组：${path}`)
      }
      assertSafeArrayProperties(value, path, settings)
      return value.map((item, index) => (
        cloneSafeJsonValue(item, `${path}[${index}]`, seen, settings)
      ))
    }
    if (!isPlainJsonObject(value, settings)) {
      throw new TypeError(`${settings.label} 仅支持普通 JSON 对象：${path}`)
    }

    const result = {}
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key === "symbol") {
        throw new TypeError(`${settings.label} 不能包含 Symbol 键：${path}`)
      }
      if (UNSAFE_KEYS.has(key)) {
        throw new TypeError(`${settings.label} 包含不安全键：${path}.${key}`)
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      if (!descriptor?.enumerable || descriptor.get || descriptor.set) {
        throw new TypeError(`${settings.label} 仅支持普通数据属性：${path}.${key}`)
      }
      result[key] = cloneSafeJsonValue(descriptor.value, `${path}.${key}`, seen, settings)
    }
    return result
  } finally {
    seen.delete(value)
  }
}

function assertSafeArrayProperties(value, path, settings) {
  for (const key of Reflect.ownKeys(value)) {
    if (key === "length") {
      continue
    }
    if (typeof key === "symbol" || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length) {
      throw new TypeError(`${settings.label} 数组包含非 JSON 属性：${path}`)
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor?.enumerable || descriptor.get || descriptor.set) {
      throw new TypeError(`${settings.label} 仅支持普通数组元素：${path}[${key}]`)
    }
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) {
      throw new TypeError(`${settings.label} 数组不能包含空位：${path}[${index}]`)
    }
  }
}
