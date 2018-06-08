import * as assert from "assert"
import * as http from "http"
import fetch from "node-fetch"
import { v4 as uuid } from "node-uuid"
import * as url from "url"
import distbin from "../"
import { jsonld } from "../src/util"
import { testCli } from "./"
import { listen } from "./util"

const tests = module.exports

tests["can OPTIONS inbox"] = async () => {
  const distbinUrl = await listen(http.createServer(distbin()))
  const res = await fetch(`${distbinUrl}/activitypub/inbox`, { method: "OPTIONS" })
  assert.equal(res.status, 200)
  const acceptPost = res.headers.get("accept-post").split(",").map((m: string) => m.trim())
  const shouldAcceptPostOf = [
    "application/ld+json", "application/activity+json", "application/json",
    'application/ld+json; profile="https://www.w3.org/ns/activitystreams"',
  ]
  shouldAcceptPostOf.forEach((m) => {
    assert(acceptPost.includes(m), `Accept-Post header includes ${m}`)
  })
}

tests["can GET inbox"] = async () => {
  const distbinUrl = await listen(http.createServer(distbin()))
  const notification = createNotification()
  // post first
  await fetch(`${distbinUrl}/activitypub/inbox`, {
    body: JSON.stringify(notification, null, 2),
    method: "POST",
  })
  // get
  const res = await fetch(`${distbinUrl}/activitypub/inbox`, {
    headers: {
      accept: "application/ld+json",
    },
  })
  assert.equal(res.headers.get("content-type").split(";")[0], "application/ld+json")
  assert.equal(res.status, 200)
  const inbox = await res.json()
  const compaction = {
    "@context": [
      "https://www.w3.org/ns/activitystreams",
      {
        "ldp:contains": {
          "@container": "@set",
          "@id": "ldp:contains",
        },
      },
    ],
  }
  const compacted = await jsonld.compact(inbox, compaction)
  // inbox needs @id to pass https://linkedresearch.org/ldn/tests/receiver
  assert(compacted.id, "inbox has an @id")
  const contains = compacted["ldp:contains"]
  assert(Array.isArray(contains))
  assert.equal(contains.length, 1)
  const type = compacted.type
  assert((Array.isArray(type) ? type : [type]).includes("ldp:Container"))
}

tests["can POST notifications to inbox"] = async () => {
  const distbinUrl = await listen(http.createServer(distbin()))
  const notificationId = String(Math.random()).slice(2)
  const notification = createNotification({ id: notificationId })
  // post
  const inboxUrl = `${distbinUrl}/activitypub/inbox`
  const res = await fetch(inboxUrl, {
    body: JSON.stringify(notification, null, 2),
    method: "POST",
  })
  assert([201, 202].includes(res.status), "status is either 200 or 201")
  // response has a Location header
  const location = res.headers.get("location")
  assert(location, "POST notification responds with a Location header")
  const resolvedLocation = url.resolve(inboxUrl, location)
  // can GET that location
  const notificationRes = await fetch(resolvedLocation, {
    headers: {
      accept: "application/ld+json",
    },
  })
  assert.equal(notificationRes.status, 200, "can GET inbox notification URI")
  assert.equal(
    notificationRes.headers.get("content-type").split(";")[0],
    "application/ld+json",
    "notification GET responds with ld+json content-type",
  )
  const gotNotification = await notificationRes.json()
  // new id is provisioned
  assert.notEqual(gotNotification.id, notification.id)
  // notifications once fetched are derivedFrom the thing that was sent
  const compaction = { "@context": [
    { wasDerivedFrom: "http://www.w3.org/ns/prov#wasDerivedFrom" },
    "http://www.w3.org/ns/activitystreams",
  ]}
  const compactedForDerivedFrom = await jsonld.compact(gotNotification, compaction)
  const wasDerivedFrom = compactedForDerivedFrom.wasDerivedFrom
  assert.ok(wasDerivedFrom)
  assert.equal(wasDerivedFrom.id, notificationId)
}

tests["fails gracefully on unexpected data in POST notifications to inbox"] = async () => {
  const distbinUrl = await listen(http.createServer(distbin()))
  const notification = {
    citation: { "@id": "http://example.org/article#results" },
  }
  // post
  const res = await fetch(`${distbinUrl}/activitypub/inbox`, {
    body: JSON.stringify(notification, null, 2),
    method: "POST",
  })
  assert([201, 202].includes(res.status), "status is either 200 or 201")
}

tests["Inbox handles notifications with ambiguous @id URIs by ignoring the id"] = async () => {
  const distbinUrl = await listen(http.createServer(distbin()))
  const notification = {
    "@context": "https://www.w3.org/ns/activitystreams",
    "@id": "./foo",
  }
  // post
  const inboxUrl = `${distbinUrl}/activitypub/inbox`
  const res = await fetch(inboxUrl, {
    body: JSON.stringify(notification, null, 2),
    headers: {
      "content-type": "application/ld+json",
    },
    method: "POST",
  })
  const location = url.resolve(inboxUrl, res.headers.get("location"))
  const notificationRes = await fetch(location, {headers: {accept: "application/ld+json"}})
  const fetchedNotification = await notificationRes.json()
  assert.notEqual(fetchedNotification.id, notification["@id"], "notification got an unambiguous id provisioned")
  assert(!("@id" in fetchedNotification), "fetchedNotification does not have a @id")
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

function createNotification(props = {}) {
  return Object.assign({
    "@context": "https://www.w3.org/ns/activitystreams",
    "actor": {
      name: "Ben",
    },
    "id": `urn:uuid:${uuid()}`,
    "object": {
      content: "<p>Hello, world!</p>",
      type: "Note",
    },
    "type": "Create",
  }, props)
}

if (require.main === module) {
  testCli(tests)
}
