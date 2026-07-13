export function formatTurtleSoupPreview(preview) {
  return formatTurtleSoupPreviewMessages(preview, Number.MAX_SAFE_INTEGER).join("\n\n")
}

export function formatTurtleSoupPreviewMessages(preview, maxLength = 1800) {
  if (!Number.isInteger(maxLength) || maxLength < 100) {
    throw new Error("海龟汤预览分段长度必须是不小于 100 的整数")
  }
  const maximum = preview.adjustmentCount + preview.remainingAdjustments
  return [
    ...splitHeadingAndTitle(preview.draft.title, maxLength),
    ...splitLabeledContent("汤面", preview.draft.surface, maxLength),
    ...splitLabeledContent("汤底", preview.draft.bottom, maxLength),
    ...splitLabeledContent("裁决备注", preview.draft.adjudicationNotes, maxLength),
    [
      `调整次数：${preview.adjustmentCount}/${maximum}`,
      "确认：#千星确认投稿",
      "调整：#千星调整投稿 <修改要求>",
      "取消：#千星取消投稿"
    ].join("\n")
  ]
}

export function formatTurtleSoupReceipt(result) {
  return [
    `${result.backendName}：写入成功`,
    `ID：${result.receipt.id}`,
    `位置：${result.receipt.position}`,
    `总数：${result.receipt.total}`
  ].join("\n")
}

function splitHeadingAndTitle(title, maxLength) {
  const heading = "海龟汤投稿预览"
  const headingMessages = splitPlainContent(heading, maxLength)
  const titleMessages = splitLabeledContent("标题", title, maxLength, "")
  const combined = `${headingMessages[0]}\n${titleMessages[0]}`
  if (headingMessages.length === 1 && combined.length <= maxLength) {
    return [combined, ...titleMessages.slice(1)]
  }
  return [...headingMessages, ...titleMessages]
}

function splitLabeledContent(label, value, maxLength, separator = "\n") {
  const messages = []
  let remaining = String(value || "")
  let continuation = false
  do {
    const prefix = `${label}${continuation ? "（续）" : ""}：${separator}`
    const capacity = maxLength - prefix.length
    messages.push(prefix + remaining.slice(0, capacity))
    remaining = remaining.slice(capacity)
    continuation = true
  } while (remaining)
  return messages
}

function splitPlainContent(value, maxLength) {
  const text = String(value || "")
  const messages = []
  for (let index = 0; index < text.length; index += maxLength) {
    messages.push(text.slice(index, index + maxLength))
  }
  return messages.length ? messages : [""]
}
