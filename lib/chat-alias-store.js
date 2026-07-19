import { existsSync } from "node:fs"
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { randomUUID } from "node:crypto"
import path from "node:path"
import { fileURLToPath } from "node:url"

export async function loadChatAliasStore(fileUrl) {
  const aliases = existsSync(fileUrl)
    ? parseAliasFile(await readFile(fileUrl, "utf8"))
    : {}
  return new ChatAliasStore(fileUrl, aliases)
}

class ChatAliasStore {
  constructor(fileUrl, aliases) {
    this.fileUrl = fileUrl
    this.aliases = aliases
    this.pendingWrite = Promise.resolve()
  }

  get(qq) {
    return this.aliases[normalizeQq(qq)] || ""
  }

  entries() {
    return Object.entries(this.aliases).sort(([left], [right]) => left.localeCompare(right))
  }

  async set(qq, nickname) {
    const key = normalizeQq(qq)
    const value = normalizeNickname(nickname)
    await this.update(async () => {
      const next = { ...this.aliases, [key]: value }
      await writeAliasesAtomically(this.fileUrl, next)
      this.aliases = next
    })
    return value
  }

  async delete(qq) {
    const key = normalizeQq(qq)
    return this.update(async () => {
      if (!Object.hasOwn(this.aliases, key)) {
        return false
      }
      const next = { ...this.aliases }
      delete next[key]
      await writeAliasesAtomically(this.fileUrl, next)
      this.aliases = next
      return true
    })
  }

  async update(operation) {
    const current = this.pendingWrite.then(operation, operation)
    this.pendingWrite = current.then(() => undefined, () => undefined)
    return current
  }
}

function parseAliasFile(source) {
  let value
  try {
    value = JSON.parse(source)
  } catch (error) {
    throw new Error(`无法解析 QQ 昵称映射文件：${error.message}`, { cause: error })
  }
  if (!isPlainObject(value)) {
    throw new Error("QQ 昵称映射文件必须是对象")
  }
  return Object.fromEntries(Object.entries(value).map(([qq, nickname]) => [
    normalizeQq(qq),
    normalizeNickname(nickname)
  ]))
}

async function writeAliasesAtomically(fileUrl, aliases) {
  const filePath = fileURLToPath(fileUrl)
  const directory = path.dirname(filePath)
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`
  await mkdir(directory, { recursive: true })
  try {
    await writeFile(temporaryPath, `${JSON.stringify(aliases, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600
    })
    await rename(temporaryPath, filePath)
  } finally {
    await rm(temporaryPath, { force: true })
  }
}

function normalizeQq(value) {
  const qq = String(value || "").trim()
  if (!/^\d+$/.test(qq)) {
    throw new Error("QQ 号必须只包含数字")
  }
  return qq
}

function normalizeNickname(value) {
  const nickname = String(value || "").replace(/\s+/g, " ").trim()
  if (!nickname) {
    throw new Error("QQ 昵称不能为空")
  }
  if (nickname.length > 32) {
    throw new Error("QQ 昵称不能超过 32 个字符")
  }
  if (/[[\]:：\u0000-\u001f\u007f]/.test(nickname)) {
    throw new Error("QQ 昵称不能包含方括号、冒号或控制字符")
  }
  return nickname
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype
}
