
import { createLogger } from '../src/logger'

const logger = createLogger('test')

// Run tests if this file is executed
if (require.main === module) {
  Promise.all([
    require('./ldn'),
    require('./activitypub'),
    require('./distbin'),
    require('./federation'),
    require('./filemap'),
    require('./distbin-html'),
    require('./http-utils')
  ].map(run))
    .then(() => process.exit())
    .catch(() => process.exit(1))
}

type Test = Function
type TestsMap = {
  [key: string]: Test
}

export async function testCli (tests: TestsMap) {
  run(tests)
  .then(() => process.exit())
  .catch((error: Error) => {
    console.error(error)
    process.exit(1)
  })
}

// execute some tests (tests are object with test name/msg as key and func as val)
// if env var TEST_FILTER is defined, only tests whose names contain that string will run
export async function run (tests: TestsMap) {
  const testFilter = process.env.TEST_FILTER
  const results = await Promise.all(
    // map to array of promises of logged errors
    // (or falsy if the test passed)
    Object.keys(tests)
      .map((testName) => [testName, tests[testName]])
      .map(([testName, runTest]: [string, Test]) => {
        function logFailure (err: Error) {
          console.error(`TEST FAIL: ${testName}\n${err.stack}\n`)
        }
        if (testFilter && testName.indexOf(testFilter) === -1) {
        // skip, doesn't match filter
          return
        }
        logger.debug('TEST: ', testName)
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
