const SCREENSHOT_UNAVAILABLE_DETAIL = "尚未获取主扫描画面，请稍后重试"

export function isScreenshotUnavailableResponse(status, body) {
  if (Number(status) !== 503) {
    return false
  }
  return responseDetail(body) === SCREENSHOT_UNAVAILABLE_DETAIL
}

function responseDetail(body) {
  const text = String(body || "").replace(/^错误:\s*/, "").trim()
  if (!text) {
    return ""
  }
  try {
    const payload = JSON.parse(text)
    return String(payload.error || payload.message || "").trim()
  } catch {
    return text
  }
}
