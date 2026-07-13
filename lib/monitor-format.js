const TASK_STATUS_LABELS = {
  queued: "等待中",
  running: "运行中",
  completed: "已完成",
  failed: "失败",
  canceled: "已取消"
}

const UNDERCOVER_PHASE_LABELS = {
  idle: "空闲",
  lobby: "报名中",
  delivering: "发词中",
  describing: "描述中",
  voting: "投票中",
  runoff_describing: "平票描述",
  runoff_voting: "平票投票"
}

const UNDERCOVER_MODE_LABELS = {
  single: "单卧底",
  double: "双卧底"
}

export function formatMonitorSnapshot(monitor = {}, previewLimit = 5) {
  return [
    monitor.status || "状态未知",
    formatPlaybackController(monitor.playbackController),
    formatOperational(monitor.operational),
    formatQueue(monitor.queue, previewLimit),
    formatTasks(monitor.tasks, monitor.pendingTasks, previewLimit),
    formatChatListener(monitor.chatListener),
    formatTurtleSoupSnapshot(monitor.turtleSoup),
    formatUndercoverSnapshot(monitor.undercover)
  ].filter(Boolean).join("\n")
}

export function formatPlayerStatus(status = {}) {
  const state = status.status || "未知"
  const title = [status.name, status.singer].filter(Boolean).join(" - ") || "无当前歌曲"
  const progress = formatTime(status.progress)
  const duration = formatTime(status.duration)
  const volume = Number.isFinite(Number(status.volume)) ? `，音量 ${status.volume}` : ""
  if (duration) {
    return `${state}，${title}（${progress || "0:00"}/${duration}${volume}）`
  }
  return `${state}，${title}${volume}`
}

export function formatQueue(queue, previewLimit = 5) {
  const items = Array.isArray(queue) ? queue : []
  if (items.length === 0) {
    return "队列：空"
  }
  const preview = items.slice(0, normalizedLimit(previewLimit)).map((item, index) => {
    const id = item.id === undefined || item.id === null ? "" : `#${item.id} `
    const source = item.source ? ` [${item.source}]` : ""
    const accompaniment = item.preferAccompaniment || item.prefer_accompaniment ? " 伴奏" : ""
    return `${index + 1}. ${id}${item.keyword || item.uri || "未命名"}${source}${accompaniment}`
  })
  return [`队列：${items.length} 首`, ...preview].join("\n")
}

export function formatTurtleSoupSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") {
    return "海龟汤：状态不可用"
  }
  if (snapshot.enabled !== true) {
    return "海龟汤：未启用"
  }
  const parts = [snapshot.phaseLabel || snapshot.phase || "状态未知"]
  if (snapshot.title) {
    parts[0] += `《${snapshot.title}》`
  }
  if (hasValue(snapshot.participantCount)) {
    parts.push(`${snapshot.participantCount} 人`)
  }
  if (hasValue(snapshot.questionCount)) {
    parts.push(`${snapshot.questionCount} 问`)
  }
  if (hasValue(snapshot.pendingAi)) {
    parts.push(`AI 待处理 ${snapshot.pendingAi}`)
  }
  if (snapshot.remainingPuzzles !== undefined && snapshot.remainingPuzzles !== null) {
    parts.push(`剩余题目 ${snapshot.remainingPuzzles}`)
  }
  if (snapshot.lastError) {
    parts.push(`异常 ${singleLine(snapshot.lastError, 80)}`)
  }
  return `海龟汤：${parts.join("，")}`
}

export function formatUndercoverSnapshot(snapshot, previewLimit = 11) {
  if (!snapshot || typeof snapshot !== "object") {
    return "谁是卧底：状态不可用"
  }
  if (snapshot.enabled !== true) {
    return "谁是卧底：未启用"
  }
  const players = Array.isArray(snapshot.players) ? snapshot.players : []
  const alive = players.filter((player) => player.alive !== false).length
  const phase = UNDERCOVER_PHASE_LABELS[snapshot.phase] || snapshot.phase || "状态未知"
  const mode = UNDERCOVER_MODE_LABELS[snapshot.mode] || snapshot.mode
  const parts = [phase]
  if (mode) {
    parts.push(mode)
  }
  if (hasValue(snapshot.round)) {
    parts.push(`第 ${snapshot.round} 轮`)
  }
  parts.push(`存活 ${alive}/${players.length}`)
  if (hasValue(snapshot.total)) {
    parts.push(`进度 ${Number(snapshot.completed || 0)}/${snapshot.total}`)
  }
  if (hasValue(snapshot.remainingSeconds)) {
    parts.push(`剩余 ${snapshot.remainingSeconds} 秒`)
  }
  const playerLines = players.slice(0, normalizedLimit(previewLimit)).map((player, index) => {
    const position = player.position || index + 1
    return `${position}. ${player.name || "未知玩家"}：${player.alive === false ? "已出局" : "存活"}`
  })
  if (players.length > playerLines.length) {
    playerLines.push(`...另 ${players.length - playerLines.length} 人`)
  }
  return [`谁是卧底：${parts.join("，")}`, ...playerLines].join("\n")
}

function formatPlaybackController(controller = {}) {
  if (!controller || typeof controller !== "object") {
    return ""
  }
  const title = [controller.title, controller.artist].filter(Boolean).join(" - ") || controller.activeKeyword
  const progress = formatTime(controller.progress)
  const duration = formatTime(controller.duration)
  const playback = [controller.backendStatus || controller.state || "未知", title].filter(Boolean).join("，")
  const timing = duration ? `（${progress || "0:00"}/${duration}）` : ""
  const detail = [
    controller.pauseReason ? `暂停原因 ${controller.pauseReason}` : "",
    controller.lastObservationReliability ? `观测 ${controller.lastObservationReliability}` : ""
  ].filter(Boolean).join("，")
  return [`播放器：${playback}${timing}`, detail].filter(Boolean).join("\n")
}

function formatOperational(operational = {}) {
  if (!operational || typeof operational !== "object") {
    return ""
  }
  const parts = [
    operational.uiState ? `界面 ${operational.uiState}` : "",
    operational.scannerPaused ? "扫描暂停" : "",
    operational.commandsEnabled === undefined
      ? ""
      : `命令${operational.commandsEnabled ? "启用" : "禁用"}`,
    operational.hallRemainingMinutes === undefined || operational.hallRemainingMinutes === null
      ? ""
      : `大厅 ${operational.hallRemainingMinutes} 分钟`,
    operational.idleExitRemainingSeconds === undefined || operational.idleExitRemainingSeconds === null
      ? ""
      : `闲置退出 ${Math.ceil(Number(operational.idleExitRemainingSeconds) / 60)} 分钟`
  ].filter(Boolean)
  return parts.length ? `运行：${parts.join("，")}` : ""
}

function formatTasks(tasks, pendingTasks, previewLimit) {
  const snapshots = Array.isArray(tasks) ? tasks : []
  if (snapshots.length === 0) {
    return formatLegacyPendingTasks(pendingTasks, previewLimit)
  }
  const active = snapshots.filter((task) => task.status === "queued" || task.status === "running")
  const inactive = snapshots.filter((task) => task.status !== "queued" && task.status !== "running")
  const visible = [...active, ...inactive].slice(0, normalizedLimit(previewLimit))
  return [
    `任务：${active.length} 个活动，最近 ${snapshots.length} 条`,
    ...visible.map(formatTask)
  ].join("\n")
}

function formatTask(task) {
  const id = task.id === undefined || task.id === null ? "#?" : `#${task.id}`
  const status = TASK_STATUS_LABELS[task.status] || task.status || "未知"
  const elapsed = Number(task.elapsedMs) > 0 ? `，${formatDurationMs(task.elapsedMs)}` : ""
  const result = task.result && (task.status === "failed" || task.status === "canceled")
    ? `，${singleLine(task.result, 80)}`
    : ""
  return `${id} ${task.label || "未命名任务"}：${status}${elapsed}${result}`
}

function formatLegacyPendingTasks(tasks, previewLimit) {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return "待执行任务：空"
  }
  return [
    `待执行任务：${tasks.length} 个`,
    ...tasks.slice(0, normalizedLimit(previewLimit)).map((task, index) => `${index + 1}. ${task}`)
  ].join("\n")
}

function formatChatListener(listener = {}) {
  const mode = listenerModeLabel(listener.mode)
  const pending = listenerModeLabel(listener.pendingMode)
  const states = [
    listener.temporaryPrimary ? "临时一级" : "",
    listener.initialUnreadClear ? "清理初始未读" : "",
    listener.unreadTaskPending ? "处理好友未读" : "",
    listener.hallRoundRequired ? "等待返回大厅" : ""
  ].filter(Boolean)
  if (!mode && !pending && states.length === 0) {
    return ""
  }
  const transition = `${mode || "未知"}${pending ? ` -> ${pending}` : ""}`
  return `监听：${[transition, ...states].join("，")}`
}

function listenerModeLabel(value) {
  if (value === "primary" || value === "一级监听") {
    return "一级监听"
  }
  if (value === "secondary" || value === "二级监听") {
    return "二级监听"
  }
  return value || ""
}

function formatTime(value) {
  const seconds = Math.floor(Number(value || 0))
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return ""
  }
  const minutes = Math.floor(seconds / 60)
  const rest = String(seconds % 60).padStart(2, "0")
  return `${minutes}:${rest}`
}

function formatDurationMs(value) {
  const milliseconds = Math.max(0, Number(value) || 0)
  if (milliseconds < 1000) {
    return `${Math.round(milliseconds)}ms`
  }
  return `${(milliseconds / 1000).toFixed(milliseconds < 10_000 ? 1 : 0)}s`
}

function normalizedLimit(value) {
  const limit = Number(value)
  return Number.isInteger(limit) && limit > 0 ? limit : 5
}

function hasValue(value) {
  return value !== undefined && value !== null
}

function singleLine(value, maxLength) {
  const text = String(value || "").replace(/\s+/g, " ").trim()
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text
}
