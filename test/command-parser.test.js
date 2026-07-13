import test from "node:test"
import assert from "node:assert/strict"

import { createCommandParser } from "../lib/command-parser.js"

const parseCommand = createCommandParser([
  { name: "状态", aliases: ["状态"] },
  { name: "海龟汤状态", aliases: ["海龟汤状态", "海龟汤监控"] }
], (key) => key === "A")

test("keeps turtle soup status commands separate from submissions", () => {
  assert.deepEqual(parseCommand("#千星海龟汤状态"), {
    action: "海龟汤状态",
    backendKey: ""
  })
  assert.deepEqual(parseCommand("#千星A海龟汤状态"), {
    action: "海龟汤状态",
    backendKey: "A"
  })
})

test("parses turtle soup submissions even when content ends in an action alias", () => {
  assert.deepEqual(parseCommand("#千星海龟汤 标题状态"), {
    action: "提交海龟汤",
    backendKey: "",
    rawContent: "标题状态"
  })
  assert.deepEqual(parseCommand("#千星A海龟汤 标题状态"), {
    action: "提交海龟汤",
    backendKey: "A",
    rawContent: "标题状态"
  })
})
