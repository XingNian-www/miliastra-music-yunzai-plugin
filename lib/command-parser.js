export function createCommandParser(actions, hasBackend = () => false) {
  const aliases = actions
    .flatMap((item) => item.aliases.map((alias) => ({ alias, action: item })))
    .sort((left, right) => right.alias.length - left.alias.length)

  return function parseCommand(message) {
    const text = String(message || "").trim()
    if (!text.startsWith("#千星")) {
      return null
    }

    const rest = text.slice("#千星".length).trim()
    if (!rest) {
      return { action: "状态", backendKey: "" }
    }

    const direct = matchActionAtStart(rest, aliases)
    if (direct) {
      return direct
    }

    const withConfiguredBackend = matchActionWithBackend(rest, aliases, hasBackend, true)
    if (withConfiguredBackend) {
      return withConfiguredBackend
    }

    const workflowCommand = parseTurtleSoupWorkflowCommand(rest)
    if (workflowCommand) {
      return workflowCommand
    }

    const submission = parseTurtleSoupSubmission(rest)
    if (submission) {
      return submission
    }

    const withBackend = matchActionWithBackend(rest, aliases, hasBackend, false)
    if (withBackend) {
      return withBackend
    }

    if (hasBackend(rest)) {
      return { action: "状态", backendKey: rest }
    }

    return null
  }
}

export function extractTurtleSoupPreferences(rawContent) {
  const text = String(rawContent || "").trim()
  return {
    rawContent: text,
    difficulty: labeledLine(text, "(?:目标)?难度"),
    style: labeledLine(text, "(?:目标)?风格")
  }
}

function parseTurtleSoupWorkflowCommand(text) {
  if (text === "确认投稿") {
    return { action: "确认海龟汤投稿", backendKey: "" }
  }
  if (text === "取消投稿") {
    return { action: "取消海龟汤投稿", backendKey: "" }
  }
  const adjustmentMarker = "调整投稿"
  if (text.startsWith(adjustmentMarker)) {
    return {
      action: "调整海龟汤投稿",
      backendKey: "",
      rawContent: stripCommandSeparator(text.slice(adjustmentMarker.length))
    }
  }
  return null
}

function parseTurtleSoupSubmission(text) {
  const marker = "海龟汤"
  const markerIndex = text.indexOf(marker)
  if (markerIndex < 0) {
    return null
  }
  const backendKey = text.slice(0, markerIndex).trim()
  const contentAfterMarker = text.slice(markerIndex + marker.length)
  let rawContent = contentAfterMarker.trim()
  if (contentAfterMarker.startsWith("投稿")) {
    rawContent = stripCommandSeparator(contentAfterMarker.slice("投稿".length))
  }
  return { action: "提交海龟汤", backendKey, rawContent }
}

function stripCommandSeparator(value) {
  return String(value || "").replace(/^[\s:：]+/, "").trim()
}

function labeledLine(text, labelPattern) {
  const match = text.match(new RegExp(`(?:^|\\n)\\s*${labelPattern}\\s*[:：]\\s*([^\\n]+)`, "i"))
  return match?.[1]?.trim() || ""
}

function matchActionAtStart(text, aliases) {
  for (const { alias, action } of aliases) {
    if (text === alias) {
      return { action: action.name, backendKey: "" }
    }
  }
  return null
}

function matchActionWithBackend(text, aliases, hasBackend, configuredOnly) {
  for (const { alias, action } of aliases) {
    if (!text.endsWith(alias)) {
      continue
    }
    const backendKey = text.slice(0, -alias.length).trim()
    if (backendKey && (!configuredOnly || hasBackend(backendKey))) {
      return { action: action.name, backendKey }
    }
  }
  return null
}
