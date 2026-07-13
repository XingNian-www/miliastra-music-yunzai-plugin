import test from "node:test"
import assert from "node:assert/strict"

import {
  formatMonitorSnapshot,
  formatTurtleSoupSnapshot,
  formatUndercoverSnapshot
} from "../lib/monitor-format.js"

test("formats the latest monitor snapshot fields", () => {
  const output = formatMonitorSnapshot({
    status: "运行中",
    playbackController: {
      state: "playing",
      backendStatus: "playing",
      title: "晴天",
      artist: "周杰伦",
      progress: 30,
      duration: 120,
      lastObservationReliability: "reliable"
    },
    operational: {
      uiState: "千星大厅",
      scannerPaused: false,
      commandsEnabled: true,
      hallRemainingMinutes: 12,
      idleExitRemainingSeconds: 125
    },
    queue: [{ id: 42, keyword: "夜曲", source: "qqmusic" }],
    tasks: [{ id: 7, label: "启动游戏", status: "running", elapsedMs: 1500 }],
    pendingTasks: ["旧任务标签"],
    chatListener: { mode: "primary" },
    turtleSoup: {
      enabled: true,
      phase: "active",
      phaseLabel: "进行中",
      title: "灯塔",
      participantCount: 2,
      questionCount: 3,
      pendingAi: 1
    },
    undercover: {
      enabled: true,
      phase: "describing",
      mode: "单卧底",
      round: 2,
      players: [
        { position: "A", name: "甲", alive: true },
        { position: "B", name: "乙", alive: false }
      ],
      completed: 1,
      total: 2,
      remainingSeconds: 55
    }
  }, 3)

  assert.match(output, /运行中/)
  assert.match(output, /晴天 - 周杰伦/)
  assert.match(output, /界面 千星大厅/)
  assert.match(output, /大厅 12 分钟/)
  assert.match(output, /#7 启动游戏：运行中/)
  assert.doesNotMatch(output, /旧任务标签/)
  assert.match(output, /海龟汤：进行中《灯塔》，2 人，3 问，AI 待处理 1/)
  assert.match(output, /谁是卧底：描述中，单卧底，第 2 轮，存活 1\/2，进度 1\/2，剩余 55 秒/)
  assert.match(output, /A\. 甲：存活/)
  assert.match(output, /B\. 乙：已出局/)
})

test("falls back to pending task labels for older backends", () => {
  const output = formatMonitorSnapshot({
    status: "运行中",
    pendingTasks: ["启动游戏", "进入千星"]
  }, 1)

  assert.match(output, /待执行任务：2 个/)
  assert.match(output, /1\. 启动游戏/)
  assert.doesNotMatch(output, /进入千星/)
})

test("formats disabled entertainment features without exposing hidden data", () => {
  assert.equal(formatTurtleSoupSnapshot({ enabled: false }), "海龟汤：未启用")
  assert.equal(formatUndercoverSnapshot({ enabled: false }), "谁是卧底：未启用")
})

test("distinguishes unsupported snapshots from disabled features", () => {
  assert.equal(formatTurtleSoupSnapshot(), "海龟汤：状态不可用")
  assert.equal(formatUndercoverSnapshot(), "谁是卧底：状态不可用")
})

test("preserves valid zero-valued entertainment metrics", () => {
  assert.equal(
    formatTurtleSoupSnapshot({
      enabled: true,
      phaseLabel: "空闲",
      participantCount: 0,
      questionCount: 0,
      pendingAi: 0,
      remainingPuzzles: 0
    }),
    "海龟汤：空闲，0 人，0 问，AI 待处理 0，剩余题目 0"
  )
  assert.equal(
    formatUndercoverSnapshot({
      enabled: true,
      phase: "idle",
      round: 0,
      players: [],
      completed: 0,
      total: 0,
      remainingSeconds: 0
    }),
    "谁是卧底：空闲，第 0 轮，存活 0/0，进度 0/0，剩余 0 秒"
  )
})

test("does not apply the music queue preview limit to undercover players", () => {
  const output = formatMonitorSnapshot({
    undercover: {
      enabled: true,
      phase: "lobby",
      round: 0,
      players: [
        { name: "甲", alive: true },
        { name: "乙", alive: true }
      ],
      completed: 2,
      total: 11,
      remainingSeconds: 60
    }
  }, 1)

  assert.match(output, /1\. 甲：存活/)
  assert.match(output, /2\. 乙：存活/)
})
