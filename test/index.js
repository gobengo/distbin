const assert = require('assert')
const distbin = require('../')
const http = require('http')

let tests = module.exports

// given a handler function like (req, res), make it listen
// then send http.request, return a Promise or response
const sendRequest = async function(handler, request) {
  const server = http.createServer(handler)
  let listened
  await new Promise((resolve, reject) => {
    server
    .once('error', () => {
      if (!listened) reject()
    })
    .listen(0, () => {
      listened = true
      resolve()
    })
  })
  return new Promise((resolve, reject) => {
    const requestOptions = Object.assign({
      hostname: 'localhost',
      method: 'get',
      path: '/',
      port: server.address().port
    }, typeof(request) === 'string' ? { path: request } : request)
    http
      .request(requestOptions, (res) => {
        res.destroy()
        resolve(res)
      })
      .on('error', reject)
      .end()
  })
}

tests['distbin can be imported'] = () => {
  assert(distbin, 'distbin is truthy')
}

tests['can create a distbin'] = () => {
  distbin()
}

tests['can send http requests to a distbin.Server'] = async function() {
  const res = await sendRequest(distbin())
  assert.equal(res.statusCode, 200)
}

tests['can request the public Collection'] = async function () {
  const res = await sendRequest(distbin(), '/public')
  assert.equal(res.statusCode, 200);
}

// tests['can post a Note'] = async function() {
//   const res = await sendRequest(distbin(), { method: 'get' })
// }

// Run tests if this file is executed
if (require.main === module) {
  run(tests)
    .then(() => process.exit())
    .catch(() => proceess.exit(1))
}

// execute some tests
async function run(tests) {
  const results = await Promise.all(
    // map to array of promises of logged errors
    // (or falsy if the test passed)
    Object.keys(tests)
    .map((testName) => [testName, tests[testName]])
    .map(([testName, runTest]) => {
      function logFailure (err) {
        console.error(`TEST FAIL: ${testName}\n${err.stack}\n`)
      }
      let result
      try {
        result = runTest()
      } catch (err) {
        logFailure(err)
        return err
      }
      // result allowed to be a promise
      return Promise.resolve(result)
      .then(() => {}) // return nothing if success
      .catch(err => {
        logFailure(err)
        return err
      })
    })
  )
  const failures = results.filter(Boolean)
  if (failures.length) {
    console.error(`${failures.length} test failures`)
  }
}
