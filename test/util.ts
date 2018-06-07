// common util functions for testing
// (doesn't actually contain tests)

const http = require('http')
const { sendRequest } = require('../src/util')
import * as url from 'url'
const activitypub = require('../src/activitypub')
const assert = require('assert')
import {Activity, HttpRequestResponder, LDObject} from './types'
import {IncomingMessage, RequestOptions, Server, ServerResponse} from 'http'
import { ASJsonLdProfileContentType } from '../src/activitystreams'

// Return Promise of an http.Request that will be sent to an http.createServer listener
export const requestForListener = async function requestForListener (listener: HttpRequestResponder, requestOptions: RequestOptions) {
  const server = http.createServer(listener)
  await listen(server)

  const request = http.request(Object.assign({
    hostname: 'localhost',
    method: 'get',
    path: '/',
    port: server.address().port
  }, typeof (requestOptions) === 'string' ? { path: requestOptions } : requestOptions))

  return request
}

// given an http.Server, return a promise of it listening on a port
export const listen = function listen (server: Server, port = 0, hostname?: string): Promise<string> {
  let listened: boolean
  return new Promise((resolve, reject) => {
    server.once('error', (error: any) => {
      if (!listened) reject(error)
    })
    server
      .listen(port, hostname, () => {
        listened = true
        resolve(`http://localhost:${server.address().port}`)
      })
  })
}

export const isProbablyAbsoluteUrl = require('../src/util').isProbablyAbsoluteUrl

// post an activity to a distbin, and return its absolute url
export const postActivity = async function postActivity (distbinListener: HttpRequestResponder, activity: LDObject<Activity>) {
  const distbinUrl = await listen(http.createServer(distbinListener))
  const req = http.request(Object.assign(url.parse(distbinUrl), {
    headers: activitypub.clientHeaders({
      'content-type': ASJsonLdProfileContentType
    }),
    method: 'post',
    path: '/activitypub/outbox'
  }))
  req.write(JSON.stringify(activity))
  const res = await sendRequest(req)
  assert.equal(res.statusCode, 201)
  const activityUrl = url.resolve(distbinUrl, res.headers.location)
  return activityUrl
}
