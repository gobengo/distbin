const assert = require('assert')
const fetch = require('node-fetch')
const { listen } = require('./util')
const { distbin } = require('../src')
const http = require('http')
const fs = require('fs')
const uuid = require('uuid')
const { jsonld } = require('../src/util')
const url = require('url')

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
  const notification = createNotification()
  // post first
  await fetch(`${distbinUrl}/activitypub/inbox`, {
    method: 'POST',
    body: JSON.stringify(notification, null, 2)
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
  const compacted = await jsonld.compact(inbox, compaction)
  const contains = compacted['ldp:contains']
  assert(Array.isArray(contains))
  const containsIds = contains.map(a => a.id).filter(Boolean)
  assert.equal(containsIds.length, 1)
  assert.equal(containsIds[0], notification.id)
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

tests['Inbox handles notifications with ambiguous @id URIs by ignoring the id'] = async () => {
  const distbinUrl = await listen(http.createServer(distbin()))
  const notification = {
    "@context": "https://www.w3.org/ns/activitystreams",
    "@id": "./foo",
  }
  // post
  const inboxUrl = `${distbinUrl}/activitypub/inbox`
  const res = await fetch(inboxUrl, {
    method: 'POST',
    body: JSON.stringify(notification, null, 2),
    headers: {
      'content-type': 'application/ld+json'
    }
  })
  const location = url.resolve(inboxUrl, res.headers.get('location'))
  const notificationRes = await fetch(location, { headers: { accept: 'application/ld+json' }})
  const fetchedNotification = await notificationRes.json()
  assert(fetchedNotification.id.startsWith('urn:uuid'), 'notification got a urn:uuid id')
  assert( ! ('@id' in fetchedNotification), 'fetchedNotification does not have a @id')
  // TODO: but it should work if @base is specified
}

// tests['Inbox handles notifications relative @id and @base'] = async () => {
//   const distbinUrl = await listen(http.createServer(distbin()))
//   const notification = {
//     "@context": [{
//       "@base": "http://bengo.is/",
//     }, "https://www.w3.org/ns/activitystreams"],
//     "@id": "i",
//   }
//   // post
//   const inboxUrl = `${distbinUrl}/activitypub/inbox`
//   const res = await fetch(inboxUrl, {
//     method: 'POST',
//     body: JSON.stringify(notification, null, 2),
//     headers: {
//       'content-type': 'application/ld+json'
//     }
//   })
//   const location = url.resolve(inboxUrl, res.headers.get('location'))
//   const notificationRes = await fetch(location, { headers: { accept: 'application/ld+json' }})
//   const fetchedNotification = await notificationRes.json()
//   assert.equal(fetchedNotification.id, 'http://bengo.is/i')
//   assert( ! ('@id' in fetchedNotification), 'fetchedNotification does not have a @id')
// }



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

