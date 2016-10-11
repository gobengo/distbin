const assert = require('assert')
const distbin = require('../')
const http = require('http')

let tests = module.exports

// activitypub helpers
// (will be added to from relevant spec sections below e.g. 3.2)
let activitypub = {};

// 3.2 Methods on Objects - https://w3c.github.io/activitypub/#obj-methods

// The client must specify an Accept header with the application/ld+json; profile="https://www.w3.org/ns/activitystreams#" media type in order to retrieve the activity.
activitypub.clientHeaders = (headers = {}) => {
  const requirements = { accept: 'application/ld+json; profile="https://www.w3.org/ns/activitystreams#' }
  if (Object.keys(headers).map(h => h.toLowerCase()).includes('accept')) {
    throw new Error(`ActivityPub Client requests can't include custom Accept header. Must always be the same value of "${requirements.accept}"`)
  }
  return Object.assign(requirements, headers);
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

// 5.4 Outbox - https://w3c.github.io/activitypub/#outbox

  // The outbox is discovered through the outbox property of an actor's profile.
  // #critique - Can only 'actors' have outboxes? Can a single distbin have one outbox?
  // #TODO - distbin home (or /activitypub root) should have 'outbox' link to /outbox for discoverability

  // The outbox must be an OrderedCollection.
  // #critique - another part of spec says "The outbox accepts HTTP POST requests". Does it also accept GET? If yet, clarify in other section; If not, what does it mean to 'be an OrderedCollection' (see isOrderedCollection function)
  // #assumption - interpretation is that outbox MUST accept GET requests, so I'll test
tests['The outbox must be an OrderedCollection'] = async function () {
  const res = await sendRequest(distbin(), {
    path: '/outbox',
    headers: activitypub.clientHeaders()
  })
  assert.equal(res.statusCode, 200);
  const resBody = await readResponseBody(res);
  const isOrderedCollection = (something) => {
    const obj = typeof something === 'string' ? JSON.parse(something) : something
    // #TODO: Assert that this is valid AS2. Ostensible 'must be an OrderedCollection' implies that
    assert.equal(obj.type, "OrderedCollection");    
  }
  isOrderedCollection(resBody)
}

  /*
  The outbox stream contains objects the user has published, subject to the ability of the requestor to retrieve the object (that is, the contents of the outbox are filtered by the permissions of the person reading it). If a user submits a request without Authorization the server should respond with all of the Public posts. This could potentially be all relevant objects published by the user, though the number of available items is left to the discretion of those implementing and deploying the server.
  The outbox accepts HTTP POST requests, with behaviour described in Client to Server Interactions.
  */

// 5.6 Public Addressing - https://w3c.github.io/activitypub/#public-addressing
tests['can request the public Collection'] = async function () {
  const res = await sendRequest(distbin(), '/public')
  assert.equal(res.statusCode, 200);
}

// 6 Binary Data - #TODO

// 7 Client to Server Interactions - https://w3c.github.io/activitypub/#client-to-server-interactions

// Example 6
let article = {
  "@context": "https://www.w3.org/ns/activitypub",
  "id": "https://rhiaro.co.uk/2016/05/minimal-activitypub",
  "type": "Article",
  "name": "Minimal ActivityPub update client",
  "content": "Today I finished morph, a client for posting ActivityStreams2...",
  "attributedTo": "https://rhiaro.co.uk/#amy",
  "to": "https://rhiaro.co.uk/followers/", 
  "cc": "https://e14n.com/evan"
}
// example 7
let likeOfArticle = {
  "@context": "https://www.w3.org/ns/activitypub",
  "type": "Like",
  // #TODO: Fix bug where a comma was missing at end of here
  "actor": "https://dustycloud.org/chris/",
  "name": "Chris liked 'Minimal ActivityPub update client'",
  "object": "https://rhiaro.co.uk/2016/05/minimal-activitypub",
  "to": ["https://rhiaro.co.uk/#amy",
         "https://dustycloud.org/followers",
         "https://rhiaro.co.uk/followers/"],
  "cc": "https://e14n.com/evan"
}


// 7.1 Create Activity - https://w3c.github.io/activitypub/#create-activity-outbox

// Run tests if this file is executed
if (require.main === module) {
  run(tests)
    .then(() => process.exit())
    .catch(() => proceess.exit(1))
}

// Given an HTTP Response, read the whole response body and return as string
async function readResponseBody(res) {
  let body = '';
  return new Promise((resolve, reject) => {
    res.on('error', reject);
    res.on('data', (chunk) => body += chunk)
    res.on('end', () => resolve(body))
  })
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

// given a node.http handler function accepting (req, res), make it listen
// then send an http.request, return a Promise of response
async function sendRequest(handler, request) {
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