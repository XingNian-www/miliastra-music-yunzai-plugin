import test from "node:test"
import assert from "node:assert/strict"

import {
  buildSongRequestQuery,
  formatSongRequestReceipt,
  parseSongRequestCommand,
  SONG_REQUEST_RULE
} from "../lib/song-request.js"

test("parses QQ song requests and normalizes whitespace", () => {
  assert.deepEqual(parseSongRequestCommand("#点歌 晴天 周杰伦"), {
    keyword: "晴天 周杰伦",
    source: "qqmusic",
    sourceName: "QQ音乐"
  })
  assert.deepEqual(parseSongRequestCommand("#QQ点歌 晴天"), {
    keyword: "晴天",
    source: "qqmusic",
    sourceName: "QQ音乐"
  })
  assert.deepEqual(parseSongRequestCommand("#网易点歌 晴天"), {
    keyword: "晴天",
    source: "netease",
    sourceName: "网易云"
  })
  assert.deepEqual(parseSongRequestCommand("#B站点歌 音乐现场"), {
    keyword: "音乐现场",
    source: "bilibili",
    sourceName: "B站"
  })
  assert.deepEqual(parseSongRequestCommand("#点歌\n晴天\n周杰伦"), {
    keyword: "晴天 周杰伦",
    source: "qqmusic",
    sourceName: "QQ音乐"
  })
  assert.deepEqual(parseSongRequestCommand("#网易点歌"), {
    keyword: "",
    source: "netease",
    sourceName: "网易云"
  })
  assert.equal(parseSongRequestCommand("点歌 晴天"), null)
  assert.equal(parseSongRequestCommand("#点歌手是谁"), null)
  assert.equal(new RegExp(SONG_REQUEST_RULE).test("#点歌 晴天"), true)
  assert.equal(new RegExp(SONG_REQUEST_RULE).test("#QQ点歌 晴天"), true)
  assert.equal(new RegExp(SONG_REQUEST_RULE).test("#网易点歌 晴天"), true)
  assert.equal(new RegExp(SONG_REQUEST_RULE).test("#B站点歌 晴天"), true)
  assert.equal(new RegExp(SONG_REQUEST_RULE).test("#点歌手是谁"), false)
})

test("builds mainline song request queries for every supported source", () => {
  assert.deepEqual(buildSongRequestQuery("晴天 伴奏", "qqmusic"), {
    keyword: "晴天 伴奏",
    source: "qqmusic"
  })
  assert.deepEqual(buildSongRequestQuery("晴天", "netease"), {
    keyword: "晴天",
    source: "netease"
  })
  assert.deepEqual(buildSongRequestQuery("音乐现场", "bilibili"), {
    keyword: "音乐现场",
    source: "bilibili"
  })
  assert.throws(
    () => buildSongRequestQuery("歌".repeat(201), "qqmusic"),
    /不能超过 200 个字符/
  )
  assert.throws(
    () => buildSongRequestQuery("晴天", "unsupported"),
    /不支持的点歌平台/
  )
})

test("formats queued and duplicate song request receipts", () => {
  assert.equal(formatSongRequestReceipt("1号千星", {
    queued: true,
    taskId: 12,
    position: 3,
    command: "点歌 晴天"
  }), "1号千星：点歌已加入队列（任务 #12，队列第 3 位）")

  assert.equal(formatSongRequestReceipt("1号千星", {
    queued: false,
    duplicate: true,
    command: "点歌 晴天"
  }), "1号千星：相同点歌任务已在队列中")
})
