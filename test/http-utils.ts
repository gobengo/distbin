const assert = require('assert')
const fetch = require('node-fetch')

import distbin from '../'
import {ClientRequestArgs, ClientResponse, ClientRequest} from 'http'

const { sendRequest, request, makeErrorClass, followRedirects } = require('../src/util')
import * as url from 'url'
import { testCli } from './'

let tests = module.exports

tests['can follow redirects'] = async () => {
  const urlThatWillRedirect = 'http://distbin.com/about'
  const response = await followRedirects(Object.assign(url.parse(urlThatWillRedirect), {
    headers: {
      accept: `application/json`
    }
  }))
  assert.equal(response.statusCode, 200)
}

if (require.main === module) {
  testCli(tests)
}
