// Run tests if this file is executed
if (require.main === module) {
  Promise.all([require('./distbin'), require('./activitypub')].map(run))
    .then(() => process.exit())
    .catch(() => process.exit(1))
}

// execute some tests (tests are object with test name/msg as key and func as val)
async function run (tests) {
  const results = await Promise.all(
    // map to array of promises of logged errors
    // (or falsy if the test passed)
    Object.keys(tests)
    .map((testName) => [testName, tests[testName]])
    .map(([testName, runTest]) => {
      function logFailure (err) {
        console.error(`TEST FAIL: ${testName}\n${err.stack}\n`)
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
