import test from "node:test"
import assert from "node:assert/strict"

import { isScreenshotUnavailableResponse } from "../lib/screenshot-response.js"

test("recognizes the mainline unavailable screenshot response", () => {
  assert.equal(isScreenshotUnavailableResponse(
    503,
    "错误: 尚未获取主扫描画面，请稍后重试"
  ), true)
})

test("accepts an equivalent JSON error response", () => {
  assert.equal(isScreenshotUnavailableResponse(
    503,
    JSON.stringify({ error: "尚未获取主扫描画面，请稍后重试" })
  ), true)
})

test("does not treat unrelated errors as an unavailable screenshot", () => {
  assert.equal(isScreenshotUnavailableResponse(503, "服务繁忙，请稍后再试"), false)
  assert.equal(isScreenshotUnavailableResponse(
    500,
    "错误: 尚未获取主扫描画面，请稍后重试"
  ), false)
})
