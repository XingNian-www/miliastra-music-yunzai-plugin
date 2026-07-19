import test from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"

import { loadChatAliasStore } from "../lib/chat-alias-store.js"

test("persists QQ nickname mappings in a standalone JSON file", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "miliastra-chat-alias-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const filePath = path.join(directory, "chat-aliases.json")
  const fileUrl = pathToFileURL(filePath)
  const store = await loadChatAliasStore(fileUrl)

  assert.equal(store.get("123456"), "")
  await store.set("123456", "测试用户")
  assert.equal(store.get("123456"), "测试用户")
  assert.deepEqual(store.entries(), [["123456", "测试用户"]])

  const reloaded = await loadChatAliasStore(fileUrl)
  assert.equal(reloaded.get("123456"), "测试用户")
  assert.deepEqual(JSON.parse(await readFile(filePath, "utf8")), {
    "123456": "测试用户"
  })

  assert.equal(await reloaded.delete("123456"), true)
  assert.equal(await reloaded.delete("123456"), false)
  assert.deepEqual(JSON.parse(await readFile(filePath, "utf8")), {})
})

test("rejects malformed alias files and unsafe nicknames without overwriting them", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "miliastra-chat-alias-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const filePath = path.join(directory, "chat-aliases.json")
  const fileUrl = pathToFileURL(filePath)
  await writeFile(filePath, "[]\n", "utf8")

  await assert.rejects(loadChatAliasStore(fileUrl), /QQ 昵称映射文件必须是对象/)
  assert.equal(await readFile(filePath, "utf8"), "[]\n")

  await writeFile(filePath, "{}\n", "utf8")
  const store = await loadChatAliasStore(fileUrl)
  await assert.rejects(store.set("123456", "坏]昵称"), /不能包含方括号、冒号或控制字符/)
  assert.equal(await readFile(filePath, "utf8"), "{}\n")
})

test("serializes concurrent nickname updates without losing mappings", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "miliastra-chat-alias-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const filePath = path.join(directory, "chat-aliases.json")
  const store = await loadChatAliasStore(pathToFileURL(filePath))

  await Promise.all([
    store.set("10001", "甲"),
    store.set("10002", "乙")
  ])

  assert.deepEqual(store.entries(), [["10001", "甲"], ["10002", "乙"]])
  assert.deepEqual(JSON.parse(await readFile(filePath, "utf8")), {
    "10001": "甲",
    "10002": "乙"
  })
})
