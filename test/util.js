// common util functions for testing
// (doesn't actually contain tests)

const http = require('http')
const { sendRequest } = require('../src/util')
const url = require('url')
const activitypub = require('../src/activitypub')
const assert = require('assert')

// Return Promise of an http.Request that will be sent to an http.createServer listener
exports.requestForListener = requestForListener
async function requestForListener (listener, requestOptions) {
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
exports.listen = listen
async function listen (server, port = 0, ...args) {
  let listened
  return new Promise((resolve, reject) => {
    server
    .once('error', () => {
      if (!listened) reject()
    })
    .listen(port, ...args, () => {
      listened = true
      resolve(`http://localhost:${server.address().port}`)
    })
  })
}

exports.isProbablyAbsoluteUrl = isProbablyAbsoluteUrl
function isProbablyAbsoluteUrl(url) {
  const absoluteUrlPattern = new RegExp('^(?:[a-z]+:)?//', 'i');
  return absoluteUrlPattern.test(url)
}

exports.postActivity = postActivity
// post an activity to a distbin, and return its absolute url
async function postActivity(distbinListener, activity) {
  const distbinUrl = await listen(http.createServer(distbinListener))
  const req = http.request(Object.assign(url.parse(distbinUrl), {
    headers: activitypub.clientHeaders({
      'content-type': 'application/ld+json; profile="https://www.w3.org/ns/activitystreams#"'
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