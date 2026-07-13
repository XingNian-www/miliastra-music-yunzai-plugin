import test from "node:test"
import assert from "node:assert/strict"

import {
  formatTurtleSoupPreview,
  formatTurtleSoupPreviewMessages,
  formatTurtleSoupReceipt
} from "../lib/turtle-soup-format.js"

const draft = {
  title: "灯塔",
  surface: "男人关灯后，远处发生了事故。",
  bottom: "男人是灯塔管理员。",
  adjudicationNotes: "核心真相：灯是灯塔。主持裁决：灯是普通灯吗？=否（这是灯塔。）。",
  logicReview: "1. [一般] 汤面不足以排除普通停电；会产生竞争答案；建议作者补充可追问线索。"
}

test("formats a complete private preview without exposing enabled state", () => {
  const message = formatTurtleSoupPreview({
    draft,
    adjustmentCount: 2,
    remainingAdjustments: 8
  })

  assert.match(message, /^海龟汤投稿预览/)
  assert.match(message, /标题：灯塔/)
  assert.match(message, /汤面：\n男人关灯后/)
  assert.match(message, /汤底：\n男人是灯塔管理员/)
  assert.match(message, /裁决备注：\n核心真相/)
  assert.match(message, /逻辑审查：\n1\. \[一般\]/)
  assert.match(message, /调整次数：2\/10/)
  assert.match(message, /#千星确认投稿/)
  assert.match(message, /#千星调整投稿/)
  assert.match(message, /#千星取消投稿/)
  assert.doesNotMatch(message, /enabled|启用/i)
})

test("splits a complete long preview into sendable private messages", () => {
  const longNotes = "裁决内容。".repeat(1000)
  const messages = formatTurtleSoupPreviewMessages({
    draft: {
      ...draft,
      title: "很长的标题".repeat(200),
      adjudicationNotes: longNotes
    },
    adjustmentCount: 0,
    remainingAdjustments: 10
  }, 500)

  assert.ok(messages.length > 4)
  assert.ok(messages.every((message) => message.length <= 500))
  assert.match(messages.join(""), /海龟汤投稿预览/)
  assert.ok(messages.some((message) => /标题：/.test(message)))
  assert.ok(messages.some((message) => /裁决备注：/.test(message)))
  assert.match(messages.at(-1), /#千星确认投稿/)
  assert.equal(messages.join("\n").includes(longNotes), false)
  assert.equal(messages.join("").replace(/裁决备注(?:（续）)?：\n/g, "").includes(longNotes), true)
})

test("formats successful receipts from actual backend values", () => {
  assert.equal(formatTurtleSoupReceipt({
    backendName: "1号千星",
    receipt: { id: "soup-0008", position: 8, total: 12 }
  }), [
    "1号千星：写入成功",
    "ID：soup-0008",
    "位置：8",
    "总数：12"
  ].join("\n"))
})
