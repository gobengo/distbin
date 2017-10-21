const assert = require('assert')
const { denodeify } = require('../src/util')
const fs = require('fs')
const { JSONFileMap } = require('../src/filemap')
const path = require('path')

const tests = module.exports

tests['saves keys as files in dir, and values as file contents'] = withdir(dir => {
  const filemap = new JSONFileMap(dir)
  filemap.set('key', 'value')
  assert.deepEqual(fs.readdirSync(dir), ['key'])
  assert.equal(fs.readFileSync(path.join(dir, 'key'), 'utf8'), '"value"')
})

tests['iterates in insertion order (helped by fs created timestamp)'] = withdir(async function (dir) {
  const filemap = new JSONFileMap(dir)
  const insertionOrder = [1, 2, 10].map(String)
  for (let k of insertionOrder) {
    filemap.set(k, k + ' value')
  }
  assert.deepEqual(Array.from(filemap).map((k, v) => k), insertionOrder)
  // new filemaps from same dir should have same insertion order
  const filemap2 = new JSONFileMap(dir)
  assert.deepEqual(Array.from(filemap2).map((k, v) => k), insertionOrder)
})

// create a temporary directory and pass its path to the provided function
// no matter what happens, remove the folder
function withdir (doWork) {
  return async function () {
    const dir = await denodeify(fs.mkdtemp)('/tmp/distbin-test-withdir-')
    try {
      return await Promise.resolve(doWork(dir))
    } finally {
      deleteFolderRecursive(dir)
    }
  }
}

// rm -rf
function deleteFolderRecursive (dir) {
  if (fs.existsSync(dir)) {
    fs.readdirSync(dir).forEach(function (file, index) {
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
  require('./').run(tests)
    .then(() => process.exit())
    .catch(() => process.exit(1))
}
