import test from "node:test"
import assert from "node:assert/strict"

import {
  conversationKey,
  isPrivateMessage,
  senderId,
  senderMemoryKey,
  senderDisplayName
} from "../lib/message-context.js"

test("recognizes private messages across Yunzai and TRSS event shapes", () => {
  assert.equal(isPrivateMessage({ isPrivate: true, group_id: 123 }), true)
  assert.equal(isPrivateMessage({ message_type: "private" }), true)
  assert.equal(isPrivateMessage({ detail_type: "private" }), true)
  assert.equal(isPrivateMessage({ isGroup: false }), true)
})

test("rejects group messages before private submission handling", () => {
  assert.equal(isPrivateMessage({ isPrivate: false }), false)
  assert.equal(isPrivateMessage({ message_type: "group" }), false)
  assert.equal(isPrivateMessage({ detail_type: "group" }), false)
  assert.equal(isPrivateMessage({ isGroup: true }), false)
  assert.equal(isPrivateMessage({ group_id: 456 }), false)
  assert.equal(isPrivateMessage({ user_id: 123 }), false)
  assert.equal(isPrivateMessage({}), false)
})

test("isolates pending state by adapter, bot, conversation, and user", () => {
  const base = {
    adapter: "QQ",
    self_id: "bot-1",
    message_type: "private",
    user_id: "123"
  }
  assert.equal(conversationKey(base), "QQ:bot-1:private:123")
  assert.notEqual(conversationKey(base), conversationKey({ ...base, adapter: "Discord" }))
  assert.notEqual(conversationKey(base), conversationKey({ ...base, self_id: "bot-2" }))
  assert.notEqual(conversationKey(base), conversationKey({
    ...base,
    message_type: "group",
    group_id: "456"
  }))
})

test("uses the Yunzai sender card or nickname for submission attribution", () => {
  assert.equal(senderDisplayName({
    sender: { card: "  投稿 人  ", nickname: "昵称" },
    user_id: 123
  }), "投稿 人")
  assert.equal(senderDisplayName({ sender: { nickname: "昵称" }, user_id: 123 }), "昵称")
  assert.equal(senderDisplayName({ nickname: "事件昵称", user_id: 123 }), "事件昵称")
  assert.equal(senderDisplayName({ user_id: 123 }), "123")
})

test("identifies a QQ user across groups while isolating bots", () => {
  const event = {
    adapter: "QQ",
    self_id: "bot-1",
    group_id: "group-1",
    user_id: 123456
  }
  assert.equal(senderId(event), "123456")
  assert.equal(senderMemoryKey(event), "QQ:bot-1:123456")
  assert.equal(senderMemoryKey({ ...event, group_id: "group-2" }), "QQ:bot-1:123456")
  assert.notEqual(senderMemoryKey(event), senderMemoryKey({ ...event, self_id: "bot-2" }))
})
