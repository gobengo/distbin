import * as assert from "assert"
import {ClientRequest, ClientRequestArgs, ClientResponse} from "http"
import fetch from "node-fetch"
import * as url from "url"
import distbin from "../"
import { followRedirects, makeErrorClass, request, sendRequest } from "../src/util"
import { testCli } from "./"

const tests = module.exports

tests["can follow redirects"] = async () => {
  const urlThatWillRedirect = "http://distbin.com/about"
  const response = await followRedirects(Object.assign(url.parse(urlThatWillRedirect), {
    headers: {
      accept: `application/json`,
    },
  }))
  assert.equal(response.statusCode, 200)
}

if (require.main === module) {
  testCli(tests)
}
