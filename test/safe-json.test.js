import assert from "node:assert/strict"
import test from "node:test"

import {
  assertSafeJsonData,
  cloneSafeJsonData,
  cloneSafeJsonObject
} from "../lib/safe-json.js"

test("clones nested JSON data without retaining mutable aliases", () => {
  const source = {
    nested: { enabled: true },
    items: [1, "two", null]
  }

  const clone = cloneSafeJsonObject(source)
  source.nested.enabled = false
  source.items.push(3)

  assert.deepEqual(clone, {
    nested: { enabled: true },
    items: [1, "two", null]
  })
})

test("rejects executable, cyclic, sparse, non-finite, and unsafe JSON shapes", () => {
  const cyclic = {}
  cyclic.self = cyclic
  const accessor = {}
  Object.defineProperty(accessor, "value", {
    enumerable: true,
    get: () => 1
  })
  const unsafeKey = JSON.parse('{"__proto__":{"polluted":true}}')
  const sparse = Array(1)
  const symbolKey = { [Symbol("secret")]: true }

  for (const value of [cyclic, accessor, unsafeKey, sparse, symbolKey, NaN, Infinity]) {
    assert.throws(() => assertSafeJsonData(value), /JSON|循环|数据属性|不安全|空位|Symbol/)
  }
})

test("null-prototype objects are explicit and can be disabled", () => {
  const source = Object.create(null)
  source.value = "safe"

  assert.deepEqual(cloneSafeJsonData(source), { value: "safe" })
  assert.throws(
    () => cloneSafeJsonData(source, { allowNullPrototype: false }),
    /普通 JSON 对象/
  )
})
