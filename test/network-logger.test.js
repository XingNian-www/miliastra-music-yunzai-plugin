import test from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, sep } from "node:path"
import { pathToFileURL } from "node:url"

import { createNetworkLogger, runLoggedNetworkRequest } from "../lib/network-logger.js"

test("writes sanitized daily JSONL network logs", async (t) => {
  const directoryPath = await mkdtemp(join(tmpdir(), "qianxing-network-log-"))
  t.after(() => rm(directoryPath, { recursive: true, force: true }))
  const directory = pathToFileURL(`${directoryPath}${sep}`)
  const currentTime = new Date(2026, 6, 19, 12, 30, 0)
  const logger = createNetworkLogger({
    directory,
    now: () => currentTime
  })

  const written = await logger.record({
    source: "turtle-soup-ai",
    method: "post",
    url: "https://user:password@api.example/v1/responses?api_key=secret#result",
    proxyUrl: "http://proxy-user:proxy-password@192.168.31.183:7893?token=secret",
    status: 502,
    outcome: "http_error",
    durationMs: 12.6,
    requestBody: "must-not-be-written"
  })

  assert.equal(written, true)
  const raw = await readFile(new URL("network-2026-07-19.jsonl", directory), "utf8")
  const entry = JSON.parse(raw)
  assert.deepEqual(entry, {
    timestamp: currentTime.toISOString(),
    source: "turtle-soup-ai",
    method: "POST",
    url: "https://api.example/v1/responses",
    status: 502,
    outcome: "http_error",
    durationMs: 13,
    proxy: "http://192.168.31.183:7893/"
  })
  assert.doesNotMatch(raw, /secret|password|must-not-be-written/)
})

test("keeps the current day and previous six days of network logs", async (t) => {
  const directoryPath = await mkdtemp(join(tmpdir(), "qianxing-network-retention-"))
  t.after(() => rm(directoryPath, { recursive: true, force: true }))
  const directory = pathToFileURL(`${directoryPath}${sep}`)
  await mkdir(directory, { recursive: true })
  await Promise.all([
    writeFile(new URL("network-2026-07-12.jsonl", directory), "expired\n"),
    writeFile(new URL("network-2026-07-13.jsonl", directory), "retained\n"),
    writeFile(new URL("notes.txt", directory), "unrelated\n")
  ])

  const logger = createNetworkLogger({
    directory,
    now: () => new Date(2026, 6, 19, 8, 0, 0)
  })
  await logger.record({
    source: "qianxing-backend",
    method: "GET",
    url: "http://127.0.0.1:18888/status",
    status: 200,
    outcome: "success",
    durationMs: 5
  })

  assert.deepEqual((await readdir(directory)).sort(), [
    "network-2026-07-13.jsonl",
    "network-2026-07-19.jsonl",
    "notes.txt"
  ])
})

test("records request failures without allowing logger failures to change behavior", async () => {
  const entries = []
  const networkError = new Error("socket failed")
  networkError.code = "ECONNRESET"

  await assert.rejects(
    runLoggedNetworkRequest({
      record(entry) {
        entries.push(entry)
      }
    }, {
      source: "qianxing-backend",
      method: "GET",
      url: "http://127.0.0.1:18888/status"
    }, async () => {
      throw networkError
    }),
    (error) => error === networkError
  )
  assert.equal(entries[0].outcome, "network_error")
  assert.equal(entries[0].errorCode, "ECONNRESET")

  const timeoutError = new Error("request timed out")
  timeoutError.name = "APIConnectionTimeoutError"
  await assert.rejects(
    runLoggedNetworkRequest({
      record(entry) {
        entries.push(entry)
      }
    }, {
      source: "turtle-soup-ai",
      method: "POST",
      url: "https://api.example/v1/responses"
    }, async () => {
      throw timeoutError
    }),
    (error) => error === timeoutError
  )
  assert.equal(entries[1].outcome, "timeout")

  const response = { ok: true, status: 200 }
  assert.equal(await runLoggedNetworkRequest({
    record() {
      throw new Error("disk unavailable")
    }
  }, {
    source: "qianxing-backend",
    method: "GET",
    url: "http://127.0.0.1:18888/status"
  }, async () => response), response)
})
