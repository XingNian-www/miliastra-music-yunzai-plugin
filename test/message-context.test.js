import test from "node:test"
import assert from "node:assert/strict"

import {
  conversationKey,
  isPrivateMessage
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
