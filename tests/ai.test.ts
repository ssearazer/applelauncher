import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cleanText, extractJson, completionText, interleaveHits } from '../src/shared/pure.ts'
import { AI_CATEGORIES } from '../src/renderer/src/ai-categories.ts'
import { makeT } from '../src/renderer/src/i18n.ts'

test('extractJson reads a bare object', () => {
  assert.deepEqual(extractJson('{"action":"search_mods","query":"sodium"}'), { action: 'search_mods', query: 'sodium' })
})

test('extractJson skips code fences and prose around the object', () => {
  const reply = 'Sure, here you go:\n```json\n{"action":"set_target","minecraft":"1.21.1","loader":"fabric"}\n```\nHope that helps!'
  assert.deepEqual(extractJson(reply), { action: 'set_target', minecraft: '1.21.1', loader: 'fabric' })
})

test('extractJson ignores <think> blocks, even ones with braces, and unterminated ones', () => {
  assert.deepEqual(extractJson('<think>maybe {"action":"final"} first?</think>{"action":"search_mods","query":"x"}'), { action: 'search_mods', query: 'x' })
  assert.throws(() => extractJson('<think>{"action":"final"}'))
})

test('extractJson keeps braces and quotes inside strings intact', () => {
  const o = extractJson('{"name":"Pack {v2} \\"best\\"","mods":[{"id":"a"}]}') as { name: string; mods: unknown[] }
  assert.equal(o.name, 'Pack {v2} "best"')
  assert.equal(o.mods.length, 1)
})

test('extractJson moves on from a broken object to the next valid one', () => {
  assert.deepEqual(extractJson('{oops} {"ok":true}'), { ok: true })
})

test('extractJson throws when there is no object', () => {
  assert.throws(() => extractJson('no json here'))
  assert.throws(() => extractJson('{"unterminated": '))
})

test('cleanText strips control characters and angle brackets, collapses spaces and caps the length', () => {
  assert.equal(cleanText('  a\n\tb\u0000c  <b>d</b> ', 50), 'a b c b d /b')
  assert.equal(cleanText(undefined, 10), '')
  const long = cleanText('x'.repeat(100), 10)
  assert.equal(long.length, 10)
  assert.ok(long.endsWith('…'))
})

test('completionText reads a string answer and joins list-style content parts', () => {
  assert.equal(completionText({ choices: [{ message: { content: '{"action":"final"}' } }] }), '{"action":"final"}')
  assert.equal(completionText({ choices: [{ message: { content: [{ type: 'text', text: '{"a":' }, { type: 'text', text: '1}' }] } }] }), '{"a":1}')
})

test('completionText returns an empty string when there is no usable answer', () => {
  assert.equal(completionText({}), '')
  assert.equal(completionText({ choices: [] }), '')
  assert.equal(completionText({ choices: [{ message: { content: null } }] }), '')
  assert.equal(completionText(null), '')
})

test('interleaveHits takes results from every query in turn and drops duplicates', () => {
  const h = (id: string) => ({ project_id: id })
  const lists = [[h('a1'), h('a2'), h('a3')], [h('b1'), h('a2')], [h('c1')]]
  assert.deepEqual(interleaveHits(lists, 10).map((x) => x.project_id), ['a1', 'b1', 'c1', 'a2', 'a3'])
  assert.deepEqual(interleaveHits(lists, 3).map((x) => x.project_id), ['a1', 'b1', 'c1'])
  assert.deepEqual(interleaveHits([], 5), [])
})

test('every AI theme has a label and a request text in both languages, and ids are unique', () => {
  assert.ok(AI_CATEGORIES.length >= 15)
  assert.equal(new Set(AI_CATEGORIES.map((c) => c.id)).size, AI_CATEGORIES.length)
  for (const lang of ['ru', 'en'] as const) {
    const t = makeT(lang)
    for (const c of AI_CATEGORIES) {
      assert.ok(t(c.label).length > 0, `${lang} label ${c.id}`)
      assert.ok(t(c.text).length > 10, `${lang} text ${c.id}`)
    }
  }
})
