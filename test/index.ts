
import { createLogger } from "../src/logger"

const logger = createLogger("test")

// Run tests if this file is executed
if (require.main === module) {
  (async () => {
    const tests = await Promise.all([
      import("./ldn"),
      import("./activitypub"),
      import("./distbin"),
      import("./federation"),
      import("./filemap"),
      import("./distbin-html"),
      import("./http-utils"),
    ]);
    await Promise.all(tests.map(run))
      .then(() => process.exit())
      .catch(() => process.exit(1))
  })()
}

type Test = () => Promise<any>
interface ITestsMap {
  [key: string]: Test
}

export async function testCli(tests: ITestsMap) {
  run(tests)
  .then(() => process.exit())
  .catch((error: Error) => {
    logger.error("", error)
    process.exit(1)
  })
}

// execute some tests (tests are object with test name/msg as key and func as val)
// if env var TEST_FILTER is defined, only tests whose names contain that string will run
export async function run(tests: ITestsMap) {
  const testFilter = process.env.TEST_FILTER
  const results = await Promise.all(
    // map to array of promises of logged errors
    // (or falsy if the test passed)
    Object.keys(tests)
      .map((testName) => [testName, tests[testName]])
      .map(([testName, runTest]: [string, Test]) => {
        function logFailure(err: Error) {
          logger.error(`TEST FAIL: ${testName}\n${err.stack}\n`)
        }
        if (testFilter && testName.indexOf(testFilter) === -1) {
        // skip, doesn't match filter
          return
        }
        logger.debug("TEST: ", testName)
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
            // logger.log("PASS", testName)
          }) // return nothing if success
          .catch((err) => {
            logFailure(err)
            return err
          })
      }),
  )
  const failures = results.filter(Boolean)
  if (failures.length) {
    logger.error(`${failures.length} test failures`)
  }
}
