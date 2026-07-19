import test from "node:test"
import assert from "node:assert/strict"

import {
  buildChatRelayQuery,
  CHAT_ALIAS_RULE,
  ChatBackendMemory,
  CHAT_RELAY_RULE,
  formatChatPrefix,
  parseChatAliasCommand,
  parseChatRelayCommand
} from "../lib/chat-relay.js"

test("parses relay messages and the manual backend switch command", () => {
  assert.deepEqual(parseChatRelayCommand("!你好"), {
    type: "send",
    content: "你好"
  })
  assert.deepEqual(parseChatRelayCommand("！你好"), {
    type: "send",
    content: "你好"
  })
  assert.deepEqual(parseChatRelayCommand("! 第一行\n第二行 "), {
    type: "send",
    content: "第一行 第二行"
  })
  assert.deepEqual(parseChatRelayCommand("!"), { type: "empty" })
  assert.deepEqual(parseChatRelayCommand("！"), { type: "empty" })
  assert.deepEqual(parseChatRelayCommand("#发言"), { type: "switch" })
  assert.equal(parseChatRelayCommand("普通消息"), null)
  assert.equal(new RegExp(CHAT_RELAY_RULE).test("!半角"), true)
  assert.equal(new RegExp(CHAT_RELAY_RULE).test("！全角"), true)
  assert.equal(new RegExp(CHAT_ALIAS_RULE).test("#发言昵称 123 昵称"), true)
})

test("parses administrator nickname commands", () => {
  assert.deepEqual(parseChatAliasCommand("#发言昵称 123456 测试 用户"), {
    type: "set",
    qq: "123456",
    nickname: "测试 用户"
  })
  assert.deepEqual(parseChatAliasCommand("#发言昵称删除 123456"), {
    type: "delete",
    qq: "123456"
  })
  assert.deepEqual(parseChatAliasCommand("#发言昵称列表"), { type: "list" })
  assert.deepEqual(parseChatAliasCommand("#发言昵称"), { type: "invalid" })
  assert.deepEqual(parseChatAliasCommand("#发言昵称 abc 昵称"), { type: "invalid" })
})

test("remembers one backend per bot user for one hour", () => {
  let now = 1_000
  const memory = new ChatBackendMemory({ now: () => now })

  memory.remember("QQ:bot-1:123456", "A")
  assert.equal(memory.get("QQ:bot-1:123456"), "A")

  now += 60 * 60 * 1000 - 1
  assert.equal(memory.get("QQ:bot-1:123456"), "A")

  now += 1
  assert.equal(memory.get("QQ:bot-1:123456"), null)
})

test("formats the exact game chat prefix without adding a space", () => {
  assert.equal(formatChatPrefix("123456"), "[123456]:")
  assert.equal(formatChatPrefix("昵称"), "[昵称]:")
  assert.deepEqual(buildChatRelayQuery("你好", "昵称"), {
    text: "你好",
    usePrefix: 1,
    prefix: "[昵称]:"
  })
})
