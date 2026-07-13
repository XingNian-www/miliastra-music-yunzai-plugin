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

function parseTurtleSoupSubmission(text) {
  const marker = "海龟汤"
  const markerIndex = text.indexOf(marker)
  if (markerIndex < 0) {
    return null
  }
  const backendKey = text.slice(0, markerIndex).trim()
  const rawContent = text.slice(markerIndex + marker.length).trim()
  if (!rawContent) {
    return null
  }
  return { action: "提交海龟汤", backendKey, rawContent }
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
