// Run tests if this file is executed
if (require.main === module) {
  Promise.all([
    require('./ldn'),
    require('./activitypub'),
    require('./distbin'),
    require('./filemap'),
    require('./distbin-html')
  ].map(run))
    .then(() => process.exit())
    .catch(() => process.exit(1))
}

// execute some tests (tests are object with test name/msg as key and func as val)
// if env var TEST_FILTER is defined, only tests whose names contain that string will run
exports.run = run
async function run (tests) {
  const testFilter = process.env.TEST_FILTER
  const results = await Promise.all(
    // map to array of promises of logged errors
    // (or falsy if the test passed)
    Object.keys(tests)
      .map((testName) => [testName, tests[testName]])
      .map(([testName, runTest]) => {
        function logFailure (err) {
          console.error(`TEST FAIL: ${testName}\n${err.stack}\n`)
        }
        if (testFilter && testName.indexOf(testFilter) === -1) {
        // skip, doesn't match filter
          return
        }
        // console.log('TEST: ', testName)
        let result
        try {
          result = runTest()
        } catch (err) {
          logFailure(err)
          return err
        }
        // result allowed to be a promise
        return Promise.resolve(result)
          .then(() => {
            // console.log("PASS", testName)
          }) // return nothing if success
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
