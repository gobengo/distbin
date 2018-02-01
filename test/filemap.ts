import * as assert from 'assert'
import { testCli } from './'
const { denodeify } = require('../src/util')
const fs = require('fs')
const { JSONFileMap, JSONFileMapAsync } = require('../src/filemap')
const path = require('path')
const os = require('os')

const tests = module.exports

tests['has() works'] = withdir(async function (dir: string) {
  const filemap = new JSONFileMap(dir)
  filemap.set('key', 'value')
  const url = 'http://localhost:8000/activities/a79926ce-72da-4b69-9b4b-97fbb0509f2b'
  assert.equal(await filemap.has(url), false)
  await filemap.set(url, { a: 1 })
  assert.equal(await filemap.has(url), true)
})

tests['JSONFileMap can load old files'] = withdir(async function (dir: string) {
  const oldKey = 'CF3F8888-30DD-42B6-9FF8-472292502FC1'
  const oldPath = path.join(dir, oldKey)
  const value = { id: oldKey, old: true }
  fs.writeFileSync(oldPath, JSON.stringify(value))

  const filemap = new JSONFileMap(dir)
  const gotOldVal = filemap.get(oldKey)
  assert(gotOldVal, 'could load old value')
  assert.equal(gotOldVal.id, oldKey)

  filemap.set(oldKey, Object.assign({ new: true }, value))
  assert.equal(fs.existsSync(oldPath), true)
  assert.equal(fs.readdirSync(dir).length, 1)
})

tests['JSONFileMapAsync can load old files'] = withdir(async function (dir: string) {
  const oldKey = '758F0F18-FD22-4F9A-BD2B-17F344F85ED2'
  const oldPath = path.join(dir, oldKey)
  const value = { id: oldKey, old: true }
  fs.writeFileSync(oldPath, JSON.stringify(value))

  const filemap = new JSONFileMapAsync(dir)
  const gotOldVal = await filemap.get(oldKey)
  assert(gotOldVal, 'could load old value')
  assert.equal(gotOldVal.id, oldKey)

  await filemap.set(oldKey, Object.assign({ new: true }, value))
  assert.equal(fs.existsSync(oldPath), true)
  assert.equal(fs.readdirSync(dir).length, 1)
})

tests['saves keys as files in dir, and values as file contents'] = withdir((dir: string) => {
  const filemap = new JSONFileMap(dir)
  filemap.set('key', 'value')
  const files = fs.readdirSync(dir)
  assert.equal(files.length, 1)
  const filename = files[0]
  assert.equal(fs.readFileSync(path.join(dir, filename), 'utf8'), '"value"')
})

const timer = (ms: number) => new Promise((resolve, reject) => setTimeout(resolve, ms))

tests['iterates in insertion order (helped by fs created timestamp)'] = withdir(async function (dir: string) {
  const filemap = new JSONFileMap(dir)
  const insertionOrder = [1, 2, 10].map(String)
  for (let k of insertionOrder) {
    filemap.set(k, k + ' value')
    // wait so that file creation times are at least 1ms apart.
    await timer(1)
  }
  assert.deepEqual(Array.from(filemap).map(([k, v]) => k), insertionOrder)
  // new filemaps from same dir should have same insertion order
  const filemap2 = new JSONFileMap(dir)
  assert.deepEqual(Array.from(filemap2).map(([k, v]) => k), insertionOrder)
})

// create a temporary directory and pass its path to the provided function
// no matter what happens, remove the folder
function withdir (doWork: Function) {
  return async function () {
    const dir = await denodeify(fs.mkdtemp)(path.join(os.tmpdir(), 'distbin-test-withdir-'))
    try {
      return await Promise.resolve(doWork(dir))
    } finally {
      deleteFolderRecursive(dir)
    }
  }
}

// rm -rf
function deleteFolderRecursive (dir: string) {
  if (fs.existsSync(dir)) {
    fs.readdirSync(dir).forEach(function (file: string) {
      var curPath = path.join(dir, file)
      if (fs.lstatSync(curPath).isDirectory()) { // recurse
        deleteFolderRecursive(curPath)
      } else { // delete file
        fs.unlinkSync(curPath)
      }
    })
    fs.rmdirSync(dir)
  }
};

if (require.main === module) {
  testCli(tests)
}
