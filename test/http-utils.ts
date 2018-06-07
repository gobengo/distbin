const assert = require("assert")
const fetch = require("node-fetch")

import {ClientRequest, ClientRequestArgs, ClientResponse} from "http"
import distbin from "../"

const { sendRequest, request, makeErrorClass, followRedirects } = require("../src/util")
import * as url from "url"
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
