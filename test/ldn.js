const assert = require('assert')
const fetch = require('node-fetch')
const { listen } = require('./util')
const { distbin } = require('../src')
const http = require('http')
const fs = require('fs')
const uuid = require('uuid')
const jsonld = require('jsonld')
const url = require('url')

jsonld.documentLoader = createCustomDocumentLoader()

let tests = module.exports

tests['can OPTIONS inbox'] = async () => {
  const distbinUrl = await listen(http.createServer(distbin()))
  const res = await fetch(`${distbinUrl}/activitypub/inbox`, { method: 'OPTIONS' })
  assert.equal(res.status, 200)
  const acceptPost = res.headers.get('accept-post').split(',').map(m => m.trim())
  const shouldAcceptPostOf = ['application/ld+json', 'application/activity+json', 'application/json', 'application/ld+json; profile="https://www.w3.org/ns/activitystreams"']
  shouldAcceptPostOf.forEach(m => {
    assert(acceptPost.includes(m), `Accept-Post header includes ${m}`)
  })
}

tests['can GET inbox'] = async () => {
  const distbinUrl = await listen(http.createServer(distbin()))
  // post first
  await fetch(`${distbinUrl}/activitypub/inbox`, {
    method: 'POST',
    body: JSON.stringify(createNotification(), null, 2)
  })
  // get
  const res = await fetch(`${distbinUrl}/activitypub/inbox`, {
    headers: {
      accept: 'application/ld+json'
    }
  })
  assert.equal(res.headers.get('content-type').split(';')[0], 'application/ld+json')
  assert.equal(res.status, 200)
  const inbox = await res.json();
  const compaction = {
    "@context": [
      "https://www.w3.org/ns/activitystreams",
      {
        "ldp:contains": {
          "@id": "ldp:contains",
          "@container": "@set"
        }
      }
    ]
  }
  const compacted = await jsonld.promises.compact(inbox, compaction)
  const contains = compacted['ldp:contains']
  assert(Array.isArray(contains))
  const containsIds = contains.map(a => a.id).filter(Boolean)
  assert.equal(containsIds.length, 1)
  const type = compacted.type
  assert((Array.isArray(type) ? type : [type]).includes('ldp:Container'))
}

tests['can POST notifications to inbox'] = async () => {
  const distbinUrl = await listen(http.createServer(distbin()))
  const notification = createNotification()
  // post
  const inboxUrl = `${distbinUrl}/activitypub/inbox`;
  const res = await fetch(inboxUrl, {
    method: 'POST',
    body: JSON.stringify(notification, null, 2)
  })
  let body = await res.text()
  assert([201, 202].includes(res.status), 'status is either 200 or 201')
  // response has a Location header
  const location = res.headers.get('location')
  assert(location, 'POST notification responds with a Location header')
  const resolvedLocation = url.resolve(inboxUrl, location)
  // can GET that location
  const notificationRes = await fetch(resolvedLocation, {
    headers: {
      accept: 'application/ld+json'
    }
  })
  assert.equal(notificationRes.status, 200, 'can GET inbox notification URI')
  assert.equal(notificationRes.headers.get('content-type').split(';')[0], 'application/ld+json', 'notification GET responds with ld+json content-type')
  const gotNotification = await notificationRes.json()
  assert.equal(gotNotification.id, notification.id)
}

tests['fails gracefully on unexpected data in POST notifications to inbox'] = async () => {
  const distbinUrl = await listen(http.createServer(distbin()))
  const notification = {
    "@context": "http://schema.org/",
    "@id": "http://example.net/note#foo",
    "citation": { "@id": "http://example.org/article#results" }
  }
  // post
  const res = await fetch(`${distbinUrl}/activitypub/inbox`, {
    method: 'POST',
    body: JSON.stringify(notification, null, 2)
  })
  let body = await res.text()
  assert([201, 202].includes(res.status), 'status is either 200 or 201')
}

function createNotification() {
  return {
    "@context": "https://www.w3.org/ns/activitystreams",
    "id": `urn:uuid:${uuid()}`,
    "actor": {
      "name": "Ben"
    },
    "type": "Create",
    "object": {
      "type": "Note",
      "content": "<p>Hello, world!</p>"
    }
  }
}


if (require.main === module) {
  require('./').run(tests)
    .then(() => process.exit())
    .catch(() => process.exit(1))
}

function createCustomDocumentLoader() {
  // define a mapping of context URL => context doc
  var CONTEXTS = {
    "https://www.w3.org/ns/activitystreams": fs.readFileSync(__dirname + '/as2context.json', 'utf8')
  }

  // grab the built-in node.js doc loader
  var nodeDocumentLoader = jsonld.documentLoaders.node();
  // or grab the XHR one: jsonld.documentLoaders.xhr()
  // or grab the jquery one: jsonld.documentLoaders.jquery()

  // change the default document loader using the callback API
  // (you can also do this using the promise-based API, return a promise instead
  // of using a callback)
  var customLoader = function(url, callback) {
    if(url in CONTEXTS) {
      return callback(
        null, {
          contextUrl: null, // this is for a context via a link header
          document: CONTEXTS[url], // this is the actual document that was loaded
          documentUrl: url // this is the actual context URL after redirects
        });
    }
    // call the underlining documentLoader using the callback API.
    nodeDocumentLoader(url, callback);
    /* Note: By default, the node.js document loader uses a callback, but
    browser-based document loaders (xhr or jquery) return promises if they
    are supported (or polyfilled) in the browser. This behavior can be
    controlled with the 'usePromise' option when constructing the document
    loader. For example: jsonld.documentLoaders.xhr({usePromise: false}); */
  };
  return customLoader
}
