import test from "node:test"
import assert from "node:assert/strict"

import { TurtleSoupSubmissionWorkflow } from "../lib/turtle-soup-workflow.js"

const backend = {
  key: "A",
  name: "1号千星",
  baseUrl: "http://127.0.0.1:18888",
  accessToken: "secret"
}
const draft = {
  title: "灯塔",
  surface: "男人关灯后，远处发生了事故。",
  bottom: "男人是灯塔管理员。",
  adjudicationNotes: "核心真相：灯是灯塔。主持裁决：灯是普通灯吗？=否（这是灯塔。）。"
}

test("creates a ten-minute preview only after AI editing succeeds", async () => {
  let optimizeRequest
  const workflow = new TurtleSoupSubmissionWorkflow({
    now: () => 1000,
    optimize: async (request) => {
      optimizeRequest = request
      return draft
    },
    submit: async () => assert.fail("should not submit before confirmation")
  })

  const preview = await workflow.start("private:123", {
    backend,
    rawContent: "原始初稿",
    difficulty: "高",
    style: "现实"
  })

  assert.deepEqual(optimizeRequest, {
    rawContent: "原始初稿",
    difficulty: "高",
    style: "现实"
  })
  assert.deepEqual(preview, {
    backendKey: "A",
    backendName: "1号千星",
    draft,
    adjustmentCount: 0,
    remainingAdjustments: 10,
    expiresAt: 601000
  })
  assert.deepEqual(workflow.getPreview("private:123"), preview)
  assert.equal(JSON.stringify(preview).includes("secret"), false)
})

test("adjusts from the original and current drafts, then refreshes the preview", async () => {
  let now = 1000
  const requests = []
  const adjustedDraft = { ...draft, surface: "更短的汤面。" }
  const workflow = new TurtleSoupSubmissionWorkflow({
    now: () => now,
    optimize: async (request) => {
      requests.push(request)
      return requests.length === 1 ? draft : adjustedDraft
    },
    submit: async () => assert.fail("should not submit before confirmation")
  })
  await workflow.start("private:123", {
    backend,
    rawContent: "原始初稿",
    difficulty: "高",
    style: "现实"
  })

  now = 5000
  const preview = await workflow.adjust("private:123", "缩短汤面")

  assert.deepEqual(requests[1], {
    rawContent: "原始初稿",
    difficulty: "高",
    style: "现实",
    currentDraft: draft,
    adjustmentRequest: "缩短汤面"
  })
  assert.equal(preview.draft.surface, "更短的汤面。")
  assert.equal(preview.adjustmentCount, 1)
  assert.equal(preview.remainingAdjustments, 9)
  assert.equal(preview.expiresAt, 605000)
})

test("keeps the current preview when an adjustment fails", async () => {
  let calls = 0
  const workflow = new TurtleSoupSubmissionWorkflow({
    now: () => 1000,
    optimize: async () => {
      calls += 1
      if (calls > 1) {
        throw new Error("AI unavailable")
      }
      return draft
    },
    submit: async () => assert.fail("should not submit before confirmation")
  })
  const initial = await workflow.start("private:123", { backend, rawContent: "初稿" })

  await assert.rejects(workflow.adjust("private:123", "修改"), /AI unavailable/)

  assert.deepEqual(workflow.getPreview("private:123"), initial)
})

test("limits each draft to ten successful adjustments", async () => {
  const workflow = new TurtleSoupSubmissionWorkflow({
    now: () => 1000,
    maxAdjustments: 2,
    optimize: async () => draft,
    submit: async () => assert.fail("should not submit before confirmation")
  })
  await workflow.start("private:123", { backend, rawContent: "初稿" })
  await workflow.adjust("private:123", "第一次")
  await workflow.adjust("private:123", "第二次")

  await assert.rejects(
    workflow.adjust("private:123", "第三次"),
    (error) => error.code === "adjustment_limit" && /最多调整 2 次/.test(error.message)
  )
})

test("submits the selected backend only after confirmation and clears the preview", async () => {
  let submitted
  const workflow = new TurtleSoupSubmissionWorkflow({
    now: () => 1000,
    optimize: async () => draft,
    submit: async (selectedBackend, selectedDraft) => {
      submitted = { selectedBackend, selectedDraft }
      return { id: "soup-0001", position: 1, total: 1 }
    }
  })
  await workflow.start("private:123", { backend, rawContent: "初稿" })

  const result = await workflow.confirm("private:123")

  assert.deepEqual(submitted, {
    selectedBackend: backend,
    selectedDraft: draft
  })
  assert.deepEqual(result, {
    backendKey: "A",
    backendName: "1号千星",
    receipt: { id: "soup-0001", position: 1, total: 1 }
  })
  assert.equal(workflow.getPreview("private:123"), null)
})

test("keeps the original preview expiry when confirmation fails", async () => {
  const workflow = new TurtleSoupSubmissionWorkflow({
    now: () => 1000,
    optimize: async () => draft,
    submit: async () => {
      throw new Error("后端不可用")
    }
  })
  const initial = await workflow.start("private:123", { backend, rawContent: "初稿" })

  await assert.rejects(workflow.confirm("private:123"), /后端不可用/)

  assert.deepEqual(workflow.getPreview("private:123"), initial)
})

test("cancels an active preview", async () => {
  const workflow = new TurtleSoupSubmissionWorkflow({
    now: () => 1000,
    optimize: async () => draft,
    submit: async () => assert.fail("cancel must not submit")
  })
  await workflow.start("private:123", { backend, rawContent: "初稿" })

  assert.equal(workflow.cancel("private:123"), true)
  assert.equal(workflow.getPreview("private:123"), null)
  assert.throws(
    () => workflow.cancel("private:123"),
    (error) => error.code === "missing"
  )
})

test("rejects concurrent operations without deleting the current preview", async () => {
  let rejectSubmission
  const workflow = new TurtleSoupSubmissionWorkflow({
    now: () => 1000,
    optimize: async () => draft,
    submit: () => new Promise((resolve, reject) => {
      rejectSubmission = reject
    })
  })
  const initial = await workflow.start("private:123", { backend, rawContent: "初稿" })
  const confirmation = workflow.confirm("private:123")
  await Promise.resolve()

  await assert.rejects(
    workflow.start("private:123", { backend, rawContent: "新初稿" }),
    (error) => error.code === "busy"
  )
  await assert.rejects(
    workflow.adjust("private:123", "修改"),
    (error) => error.code === "busy"
  )
  await assert.rejects(
    workflow.confirm("private:123"),
    (error) => error.code === "busy"
  )
  assert.throws(
    () => workflow.cancel("private:123"),
    (error) => error.code === "busy"
  )

  rejectSubmission(new Error("后端失败"))
  await assert.rejects(confirmation, /后端失败/)
  assert.deepEqual(workflow.getPreview("private:123"), initial)
})

test("rejects confirmation after the preview expires", async () => {
  let now = 1000
  const workflow = new TurtleSoupSubmissionWorkflow({
    now: () => now,
    optimize: async () => draft,
    submit: async () => assert.fail("expired preview must not submit")
  })
  await workflow.start("private:123", { backend, rawContent: "初稿" })
  now = 601001

  await assert.rejects(
    workflow.confirm("private:123"),
    (error) => error.code === "expired"
  )
  assert.equal(workflow.getPreview("private:123"), null)
})

test("a failed new submission replaces the previous preview", async () => {
  let calls = 0
  const workflow = new TurtleSoupSubmissionWorkflow({
    now: () => 1000,
    optimize: async () => {
      calls += 1
      if (calls === 2) {
        throw new Error("AI 失败")
      }
      return draft
    },
    submit: async () => assert.fail("should not submit")
  })
  await workflow.start("private:123", { backend, rawContent: "旧初稿" })

  await assert.rejects(
    workflow.start("private:123", { backend, rawContent: "新初稿" }),
    /AI 失败/
  )
  assert.equal(workflow.getPreview("private:123"), null)
})
