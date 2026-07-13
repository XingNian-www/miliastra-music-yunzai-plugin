export function parseConfigModule(source) {
  return new DataParser(source).parseModule()
}

class DataParser {
  constructor(source) {
    this.source = String(source).replace(/^\uFEFF/, "")
    this.index = 0
  }

  parseModule() {
    this.skipIgnored()
    this.expectIdentifier("export")
    this.skipIgnored()
    this.expectIdentifier("default")
    this.skipIgnored()
    const value = this.parseValue()
    this.skipIgnored()
    if (this.peek() === ";") {
      this.index += 1
      this.skipIgnored()
    }
    if (!this.done()) {
      this.fail("export default 后存在额外内容")
    }
    return value
  }

  parseValue() {
    this.skipIgnored()
    const character = this.peek()
    if (character === "{") {
      return this.parseObject()
    }
    if (character === "[") {
      return this.parseArray()
    }
    if (character === '"' || character === "'") {
      return this.parseString()
    }
    if (character === "-" || isDigit(character)) {
      return this.parseNumber()
    }
    if (this.consumeKeyword("true")) {
      return true
    }
    if (this.consumeKeyword("false")) {
      return false
    }
    if (this.consumeKeyword("null")) {
      return null
    }
    this.fail("仅支持对象、数组、字符串、有限数字、布尔值和 null")
  }

  parseObject() {
    this.expect("{")
    const result = Object.create(null)
    this.skipIgnored()
    if (this.consume("}")) {
      return result
    }

    while (true) {
      const key = this.parsePropertyKey()
      if (key === "__proto__") {
        this.fail("配置键不能是 __proto__")
      }
      if (Object.hasOwn(result, key)) {
        this.fail(`配置键重复：${key}`)
      }
      this.skipIgnored()
      this.expect(":")
      const value = this.parseValue()
      Object.defineProperty(result, key, {
        value,
        enumerable: true,
        configurable: true,
        writable: true
      })
      this.skipIgnored()
      if (this.consume("}")) {
        return result
      }
      this.expect(",")
      this.skipIgnored()
      if (this.consume("}")) {
        return result
      }
    }
  }

  parseArray() {
    this.expect("[")
    const result = []
    this.skipIgnored()
    if (this.consume("]")) {
      return result
    }

    while (true) {
      result.push(this.parseValue())
      this.skipIgnored()
      if (this.consume("]")) {
        return result
      }
      this.expect(",")
      this.skipIgnored()
      if (this.consume("]")) {
        return result
      }
    }
  }

  parsePropertyKey() {
    this.skipIgnored()
    if (this.peek() === '"' || this.peek() === "'") {
      return this.parseString()
    }
    return this.parseIdentifier()
  }

  parseIdentifier() {
    const start = this.index
    if (!isIdentifierStart(this.peek())) {
      this.fail("对象键必须是标识符或字符串")
    }
    this.index += 1
    while (isIdentifierPart(this.peek())) {
      this.index += 1
    }
    return this.source.slice(start, this.index)
  }

  parseString() {
    const quote = this.peek()
    this.index += 1
    let output = ""
    while (!this.done()) {
      const character = this.peek()
      this.index += 1
      if (character === quote) {
        return output
      }
      if (character === "\n" || character === "\r") {
        this.fail("字符串不能包含未转义换行")
      }
      if (character !== "\\") {
        output += character
        continue
      }
      output += this.parseEscape()
    }
    this.fail("字符串未闭合")
  }

  parseEscape() {
    if (this.done()) {
      this.fail("字符串转义未完成")
    }
    const character = this.peek()
    this.index += 1
    const simple = {
      "'": "'",
      '"': '"',
      "\\": "\\",
      b: "\b",
      f: "\f",
      n: "\n",
      r: "\r",
      t: "\t",
      v: "\v",
      0: "\0"
    }
    if (Object.hasOwn(simple, character)) {
      return simple[character]
    }
    if (character === "x") {
      return String.fromCodePoint(parseInt(this.readHex(2), 16))
    }
    if (character === "u") {
      if (this.consume("{")) {
        const start = this.index
        while (isHex(this.peek())) {
          this.index += 1
        }
        const hex = this.source.slice(start, this.index)
        if (!hex || !this.consume("}")) {
          this.fail("Unicode 转义无效")
        }
        const codePoint = Number.parseInt(hex, 16)
        if (codePoint > 0x10ffff) {
          this.fail("Unicode 码点超出范围")
        }
        return String.fromCodePoint(codePoint)
      }
      return String.fromCodePoint(parseInt(this.readHex(4), 16))
    }
    if (character === "\n") {
      return ""
    }
    if (character === "\r") {
      this.consume("\n")
      return ""
    }
    return character
  }

  readHex(length) {
    const value = this.source.slice(this.index, this.index + length)
    if (value.length !== length || [...value].some((character) => !isHex(character))) {
      this.fail("十六进制转义无效")
    }
    this.index += length
    return value
  }

  parseNumber() {
    const remaining = this.source.slice(this.index)
    const match = remaining.match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/)
    if (!match) {
      this.fail("数字格式无效")
    }
    this.index += match[0].length
    const value = Number(match[0])
    if (!Number.isFinite(value)) {
      this.fail("数字必须是有限值")
    }
    return value
  }

  skipIgnored() {
    while (!this.done()) {
      if (/\s/.test(this.peek())) {
        this.index += 1
        continue
      }
      if (this.source.startsWith("//", this.index)) {
        const newline = this.source.indexOf("\n", this.index + 2)
        this.index = newline < 0 ? this.source.length : newline + 1
        continue
      }
      if (this.source.startsWith("/*", this.index)) {
        const end = this.source.indexOf("*/", this.index + 2)
        if (end < 0) {
          this.fail("块注释未闭合")
        }
        this.index = end + 2
        continue
      }
      break
    }
  }

  consumeKeyword(keyword) {
    if (!this.source.startsWith(keyword, this.index)) {
      return false
    }
    const next = this.source[this.index + keyword.length]
    if (isIdentifierPart(next)) {
      return false
    }
    this.index += keyword.length
    return true
  }

  expectIdentifier(identifier) {
    const actual = this.parseIdentifier()
    if (actual !== identifier) {
      this.fail(`应为 ${identifier}`)
    }
  }

  expect(character) {
    if (!this.consume(character)) {
      this.fail(`应为 ${character}`)
    }
  }

  consume(character) {
    if (this.peek() !== character) {
      return false
    }
    this.index += 1
    return true
  }

  peek() {
    return this.source[this.index] || ""
  }

  done() {
    return this.index >= this.source.length
  }

  fail(message) {
    const before = this.source.slice(0, this.index)
    const line = before.split("\n").length
    const lastNewline = before.lastIndexOf("\n")
    const column = this.index - lastNewline
    throw new SyntaxError(`${message}（第 ${line} 行，第 ${column} 列）`)
  }
}

function isDigit(character) {
  return character >= "0" && character <= "9"
}

function isHex(character) {
  return Boolean(character) && /^[0-9a-f]$/i.test(character)
}

function isIdentifierStart(character) {
  return Boolean(character) && /[A-Za-z_$]/.test(character)
}

function isIdentifierPart(character) {
  return Boolean(character) && /[A-Za-z0-9_$]/.test(character)
}
