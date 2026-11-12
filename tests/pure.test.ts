import assert from 'node:assert/strict'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import { safeJoin } from '../src/main/safe-path.ts'
import { errorText, fromMmcPack, fromVersionJson, javaFor, neoForgeMatches, splitArgs } from '../src/shared/pure.ts'

test('neoForgeMatches maps NeoForge versions to the game version', () => {
  assert.ok(neoForgeMatches('21.1.77', '1.21.1'))
  assert.ok(neoForgeMatches('20.4.237', '1.20.4'))
  assert.ok(neoForgeMatches('21.0.167', '1.21'))
  assert.ok(!neoForgeMatches('21.1.77', '1.21'))
  assert.ok(!neoForgeMatches('20.4.237', '1.21.1'))
  assert.ok(neoForgeMatches('26.1.0.1-beta', '26.1'))
})

test('splitArgs keeps quoted values together', () => {
  assert.deepEqual(splitArgs('-XX:+UseG1GC  -Dfoo="a b" "-Dx=1"'), ['-XX:+UseG1GC', '-Dfoo=a b', '-Dx=1'])
  assert.deepEqual(splitArgs('"-Dpath=C:\My Games" -Xss2m'), ['-Dpath=C:\My Games', '-Xss2m'])
  assert.deepEqual(splitArgs('   '), [])
})

test('safeJoin refuses paths that leave the base', () => {
  const base = resolve('/tmp/inst')
  assert.equal(safeJoin(base, 'mods/a.jar'), join(base, 'mods', 'a.jar'))
  assert.throws(() => safeJoin(base, '../evil.jar'))
  assert.throws(() => safeJoin(base, 'mods/../../evil'))
  assert.throws(() => safeJoin(base, resolve('/etc/passwd')))
  assert.throws(() => safeJoin(base, 'a\0b'))
})

test('javaFor follows Mojang requirements', () => {
  assert.equal(javaFor('1.8.9'), 8)
  assert.equal(javaFor('1.16.5'), 8)
  assert.equal(javaFor('1.17.1'), 16)
  assert.equal(javaFor('1.20.4'), 17)
  assert.equal(javaFor('1.20.5'), 21)
  assert.equal(javaFor('1.21.4'), 21)
  assert.equal(javaFor('26.1'), 25)
})


test('fromMmcPack', () => {
  assert.deepEqual(fromMmcPack({ components: [{ uid: 'net.minecraft', version: '1.20.1' }, { uid: 'net.minecraftforge', version: '47.2.0' }] }), { minecraft: '1.20.1', loader: 'forge', loaderVersion: '47.2.0' })
  assert.deepEqual(fromMmcPack({ components: [{ uid: 'net.minecraft', version: '1.21.1' }] }), { minecraft: '1.21.1', loader: 'vanilla' })
  assert.throws(() => fromMmcPack({ components: [] }))
})

test('fromVersionJson', () => {
  assert.deepEqual(fromVersionJson({ id: 'Fabric pack', inheritsFrom: '1.21.1', libraries: [{ name: 'net.fabricmc:fabric-loader:0.16.5' }] }), { minecraft: '1.21.1', loader: 'fabric', loaderVersion: '0.16.5' })
  assert.deepEqual(fromVersionJson({ id: 'My pack', libraries: [{ name: 'net.minecraftforge:forge:1.20.1-47.2.0:universal' }], arguments: { game: ['--fml.mcVersion', '1.20.1'] } }), { minecraft: '1.20.1', loader: 'forge', loaderVersion: '47.2.0' })
  assert.deepEqual(fromVersionJson({ id: 'Old', jar: '1.7.10', libraries: [{ name: 'net.minecraftforge:forge:1.7.10-10.13.4.1614-1.7.10' }] }), { minecraft: '1.7.10', loader: 'forge', loaderVersion: '10.13.4.1614' })
  assert.deepEqual(fromVersionJson({ id: 'Neo', arguments: { game: ['--fml.neoForgeVersion', '21.1.77', '--fml.mcVersion', '1.21.1'] } }), { minecraft: '1.21.1', loader: 'neoforge', loaderVersion: '21.1.77' })
  assert.deepEqual(fromVersionJson({ id: '1.20.4' }), { minecraft: '1.20.4', loader: 'vanilla' })
  assert.throws(() => fromVersionJson({ id: 'Something' }))
})

test('errorText unwraps AggregateError', () => {
  assert.equal(errorText(new AggregateError([new Error('HTTP 404 x')])), 'HTTP 404 x')
  assert.match(errorText(new AggregateError([new Error('a'), new Error('b')])), /2.*a$/)
  assert.equal(errorText(Object.assign(new Error(''), { code: 'ECONNRESET' })), 'ECONNRESET')
})
