import test from "node:test"
import assert from "node:assert/strict"

import {
  createCommandParser,
  extractTurtleSoupPreferences,
  QIANXING_MESSAGE_RULE
} from "../lib/command-parser.js"

const parseCommand = createCommandParser([
  { name: "状态", aliases: ["状态"] },
  { name: "重载配置", aliases: ["重载配置", "reload"] },
  { name: "海龟汤状态", aliases: ["海龟汤状态", "海龟汤监控"] }
], (key) => key === "A")

test("parses the runtime config reload command", () => {
  assert.deepEqual(parseCommand("#千星重载配置"), {
    action: "重载配置",
    backendKey: ""
  })
})

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
  assert.deepEqual(parseCommand("#千星海龟汤 投稿失败后，他离开了"), {
    action: "提交海龟汤",
    backendKey: "",
    rawContent: "投稿失败后，他离开了"
  })
})

test("parses explicit submission, adjustment, confirmation, and cancellation commands", () => {
  assert.deepEqual(parseCommand("#千星海龟汤投稿 标题和故事"), {
    action: "提交海龟汤",
    backendKey: "",
    rawContent: "标题和故事"
  })
  assert.deepEqual(parseCommand("#千星海龟汤投稿"), {
    action: "提交海龟汤",
    backendKey: "",
    rawContent: ""
  })
  assert.deepEqual(parseCommand("#千星调整投稿 缩短汤面"), {
    action: "调整海龟汤投稿",
    backendKey: "",
    rawContent: "缩短汤面"
  })
  assert.deepEqual(parseCommand("#千星确认投稿"), {
    action: "确认海龟汤投稿",
    backendKey: ""
  })
  assert.deepEqual(parseCommand("#千星取消投稿"), {
    action: "取消海龟汤投稿",
    backendKey: ""
  })
})

test("does not select a backend in the initial submission command", () => {
  assert.equal(parseCommand("#千星A海龟汤投稿 标题和故事"), null)
})

test("extracts optional difficulty and style labels without changing the raw draft", () => {
  const rawContent = "标题：灯塔\n难度：高\n风格：现实因果\n汤面：男人关灯了"
  assert.deepEqual(extractTurtleSoupPreferences(rawContent), {
    rawContent,
    difficulty: "高",
    style: "现实因果"
  })
})

test("Yunzai rule and parser accept a multiline turtle soup submission", () => {
  const message = [
    "#千星海龟汤投稿",
    "标题：灯塔",
    "汤面：男人关灯后，远处发生了事故。",
    "汤底：男人是灯塔管理员。"
  ].join("\n")

  assert.equal(new RegExp(QIANXING_MESSAGE_RULE).test(message), true)
  assert.deepEqual(parseCommand(message), {
    action: "提交海龟汤",
    backendKey: "",
    rawContent: [
      "标题：灯塔",
      "汤面：男人关灯后，远处发生了事故。",
      "汤底：男人是灯塔管理员。"
    ].join("\n")
  })
})
