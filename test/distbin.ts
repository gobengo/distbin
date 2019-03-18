// tests for distbin-specific stuff (arbitrary, non-protocol things)

import * as assert from "assert"
import * as http from "http"
import { get } from "lodash"
import * as url from "url"
import { testCli } from "."
import distbin from "../"
import { discoverOutbox } from "../src/activitypub"
import * as activitypub from "../src/activitypub"
import { ASJsonLdProfileContentType } from "../src/activitystreams"
import { createLogger } from "../src/logger"
import { Activity, ASObject, DistbinActivity, Extendable, HttpRequestResponder, isActivity, JSONLD,
  LDObject, LDValue, LDValues } from "../src/types"
import { ensureArray, first, isProbablyAbsoluteUrl, linkToHref, readableToString, sendRequest } from "../src/util"
import { listen, postActivity, requestForListener } from "./util"

const logger = createLogger("test/distbin")
const tests = module.exports

tests.discoverOutbox = async () => {
  const distbinUrl = await listen(http.createServer(distbin()))
  const outbox = await discoverOutbox(distbinUrl)
  assert.equal(outbox, `${distbinUrl}/activitypub/outbox`)
}

tests["distbin can be imported"] = () => {
  assert(distbin, "distbin is truthy")
}

tests["can create a distbin"] = () => {
  distbin()
}

tests["can send http requests to a distbin.Server"] = async () => {
  const res = await sendRequest(await requestForListener(distbin()))
  assert.equal(res.statusCode, 200)
}

tests["/ route can be fetched as JSONLD and includes pointers to things like outbox"] = async () => {
  const res = await sendRequest(await requestForListener(distbin(), {
    headers: {
      accept: "application/ld+json",
    },
  }))
  assert.equal(res.statusCode, 200)

  const resBody = await readableToString(res)
  const rootResource = JSON.parse(resBody)
  // #TODO: maybe a more fancy JSON-LD-aware check
  assert(Object.keys(rootResource).includes("outbox"), "/ points to outbox")
  assert(Object.keys(rootResource).includes("inbox"), "/ points to inbox")
}

tests["can fetch /recent to see what's been going on"] = async () => {
  const res = await sendRequest(await requestForListener(distbin(), {
    headers: {
      accept: "application/ld+json",
    },
    path: "/recent",
  }))
  assert.equal(res.statusCode, 200)
  const resBody = await readableToString(res)
  const recentCollection = JSON.parse(resBody)
  assert.equal(recentCollection.type, "OrderedCollection")
  assert(Array.isArray(recentCollection.items), ".items is an Array")
}

tests["can page through /public collection.current"] = async () => {
  const d = distbin()
  const toCreate = [
    { name: "first!" },
    { name: "second" },
    { name: "third" },
    { name: "forth" },
  ].map((a) => Object.assign(a, {
    cc: ["https://www.w3.org/ns/activitystreams#Public"],
  }))
  const created: string[] = []
  for (const a of toCreate) {
    created.push(await postActivity(d, a))
  }
  // const createdFull = await Promise.all(created.map(async function (url) {
  //   return JSON.parse(await readableToString(await sendRequest(http.request(url))))
  // }))
  // console.log('createdFull', createdFull)
  assert.equal(created.length, 4)
  const collectionUrl = "/activitypub/public"
  const collectionRes = await sendRequest(await requestForListener(d, {
    headers: {
      Prefer: 'return=representation; max-member-count="1"',
      accept: "application/ld+json",
    },
    path: collectionUrl,
  }))
  const collection = JSON.parse(await readableToString(collectionRes))
  assert.equal(collection.type, "Collection")
  assert.equal(collection.items.length, 1)
  // we get the most recently created one
  ensureArray(collection.items[0].url).forEach((itemUrl: string) => {
    assert.equal(url.parse(itemUrl).pathname,
                 url.parse(created[created.length - 1]).pathname)
  })
  assert(!collection.next, "collection does not have a next property")
  assert(collection.current, "collection has a .current property")
  assert(collection.first, "collection has a .first property")
  const page1Url = url.resolve(collectionUrl, linkToHref(collection.current))
  // page 1
  const page1Res = await sendRequest(await requestForListener(d, {
    headers: {
      // NOTE! getting 2 this time
      Prefer: 'return=representation; max-member-count="1"',
      accept: "application/ld+json",
    },
    path: page1Url,
  }))
  assert.equal(page1Res.statusCode, 200)
  const page1 = JSON.parse(await readableToString(page1Res))
  assert.equal(page1.type, "OrderedCollectionPage")
  assert.equal(page1.startIndex, 0)
  assert.equal(page1.orderedItems.length, 1)
  assert(page1.next, "has a next property")

  // page 2 (get 2 items, not 1)
  const page2Url = url.resolve(page1Url, page1.next)
  const page2Res = await sendRequest(await requestForListener(d, {
    headers: {
      // NOTE! getting 2 this time
      Prefer: 'return=representation; max-member-count="2"',
      accept: "application/ld+json",
    },
    path: page2Url,
  }))
  assert.equal(page2Res.statusCode, 200)
  const page2 = JSON.parse(await readableToString(page2Res))
  assert.equal(page2.type, "OrderedCollectionPage")
  assert.equal(page2.startIndex, 1)
  assert.equal(page2.orderedItems.length, 2)
  assert(page2.next, "has a next property")
  // should have second most recently created
  ensureArray(page2.orderedItems[0].url).forEach((itemUrl: string) =>
    assert.equal(url.parse(itemUrl).pathname,
                 url.parse(created[created.length - 2]).pathname))
  ensureArray(page2.orderedItems[1].url).forEach((itemUrl: string) =>
    assert.equal(url.parse(itemUrl).pathname,
                 url.parse(created[created.length - 3]).pathname))
  // ok so if we post one more new thing, the startIndex on page2 should go up by one.
  const fifth = {
    cc: ["https://www.w3.org/ns/activitystreams#Public"],
    name: "fifth",
  }
  created.push(await postActivity(d, fifth))
  const page2AfterFifthRes = await sendRequest(await requestForListener(d, {
    headers: {
      Prefer: 'return=representation; max-member-count="2"',
      accept: "application/ld+json",
    },
    path: page2Url,
  }))
  const page2AfterFifth = JSON.parse(await readableToString(page2AfterFifthRes))
  assert.equal(page2AfterFifth.startIndex, 2)
  // page 3
  const page3Url = url.resolve(page2Url, page2.next)
  const page3Res = await sendRequest(await requestForListener(d, {
    headers: {
      Prefer: 'return=representation; max-member-count="2"',
      accept: "application/ld+json",
    },
    path: page3Url,
  }))
  assert.equal(page3Res.statusCode, 200)
  const page3 = JSON.parse(await readableToString(page3Res))
  assert.equal(page3.type, "OrderedCollectionPage")
  assert.equal(page3.startIndex, 4)
  assert.equal(page3.orderedItems.length, 1)
  // assert.equal(url.parse(page3.orderedItems[0].url).pathname, url.parse(created[created.length - 5]).pathname)
  ensureArray(page3.orderedItems[0].url).forEach((itemUrl: string) =>
    assert.equal(url.parse(itemUrl).pathname,
                 url.parse(created[created.length - 5]).pathname))
  // page3 can specify a next, but when fetched it shouldn't have any items
  // or continue pointing to next
  if (page3.next) {
    const page4Url = url.resolve(page3Url, page3.next)
    const page4Res = await sendRequest(await requestForListener(d, {
      headers: {
        Prefer: 'return=representation; max-member-count="2"',
        accept: "application/ld+json",
      },
      path: page4Url,
    }))
    assert.equal(page4Res.statusCode, 200)
    const page4 = JSON.parse(await readableToString(page4Res))
    assert.equal(page4.orderedItems.length, 0)
    assert(!page4.next)
  }
}

// Example 8,9: Submitting an Activity to the Outbox
tests["posted activities have an .inbox (e.g. to receive replies in)"] = async () => {
  // Create an Activity by POSTing to outbox
  const distbinListener = distbin()
  const req = await requestForListener(distbinListener, {
    headers: activitypub.clientHeaders({
      "content-type": ASJsonLdProfileContentType,
    }),
    method: "post",
    path: "/activitypub/outbox",
  })
  req.write(JSON.stringify({
    "@context": "https://www.w3.org/ns/activitypub",
    "content": "Hello, world",
    "type": "Article",
  }))
  const postActivityRequest = await sendRequest(req)
  assert.equal(postActivityRequest.statusCode, 201)
  // Determine Location of new Activity
  const location = first(postActivityRequest.headers.location)
  assert(location, "Location header is present in response")
  // Now get the new Activity

  const getActivityResponse = await sendRequest(
    await requestForListener(distbinListener, {
      headers: activitypub.clientHeaders(),
      path: location,
    }),
  )
  assert.equal(getActivityResponse.statusCode, 200)
  const newActivity = JSON.parse(await readableToString(getActivityResponse))

  assert(newActivity.inbox, "activity should have an .inbox property")
}

// #TODO is notifying the .inReplyTo inbox even encouraged/allowed by activitypub?
tests["Posting a reply will notify the inReplyTo inbox (even if another distbin)"] = async () => {
  // ok so we're going to make two distbins, A and B, and test that A delivers to B
  const distbinA = distbin()
  const distbinB = distbin({ deliverToLocalhost: true })
  // post a parent to distbinA
  const parentUrl = await postActivity(distbinA, {
    content: "Reply to this if you think FSW could happen",
    type: "Note",
  })
  // ok now to post the reply to distbinB
  const replyUrl = await postActivity(distbinB, {
    cc: [parentUrl],
    content: "Dear Anonymous, I believe in FSW",
    inReplyTo: parentUrl,
    type: "Note",
  })
  // then verify that it is in distbinA's inbox
  const replyId = JSON.parse(await readableToString(await sendRequest(http.request(replyUrl)))).id
  const distbinAInbox = JSON.parse(await readableToString(await sendRequest(
    await requestForListener(distbinA, "/activitypub/inbox"))))
  const replyFromDistbinAInbox = distbinAInbox.items.find((a: DistbinActivity) => {
    const idMatches = a.id === replyId
    if (idMatches) { return true }
    const wasDerivedFrom = a["http://www.w3.org/ns/prov#wasDerivedFrom"]
    if ( ! wasDerivedFrom) { return false }
    function nodeWasDerivedFrom(o: ASObject|string, nodeId: string): boolean {
      if (typeof o === "object") { return o.id === nodeId } else if (typeof o === "string") { return o === nodeId }
      return false
    }
    const matchesReplyId = (o: DistbinActivity|string): boolean => nodeWasDerivedFrom(o, replyId)
    if (wasDerivedFrom instanceof Array) {
      return wasDerivedFrom.some(matchesReplyId)
    } else if (isActivity(wasDerivedFrom)
            || typeof wasDerivedFrom === "string") {
      return matchesReplyId(wasDerivedFrom)
    } else if (typeof wasDerivedFrom === "object") {
      for (const id of [(wasDerivedFrom as ASObject).id, (wasDerivedFrom as JSONLD)["@id"]]) {
        if (typeof id === "string") { return matchesReplyId(id) }
      }
      return false
    } else {
      const exhaustiveCheck: never = wasDerivedFrom;
    }
  })
  assert(replyFromDistbinAInbox, "distbinA inbox contains reply")
  assert.equal(isProbablyAbsoluteUrl(replyFromDistbinAInbox.replies), true,
    "activity is delivered with .replies as a valid absolute url")

  // So now distbinA is storing a replicated copy of the reply canonically hosted on distbinB.
  // What happens if we try to request this reply's id on distbinA
  // const replicatedReplyResponse = await sendRequest(await requestForListener(distbinA, {
  //   path: '/activities/'+replyFromDistbinAInbox.uuid
  // }))
  // assert.equal(replicatedReplyResponse.statusCode, 302)
  // assert(isProbablyAbsoluteUrl(replicatedReplyResponse.headers.location), 'location header is absolute URL')
}

// #TODO is notifying the .inReplyTo inbox even encouraged/allowed by activitypub?
tests["can configure spam checking for inbox to reject some things" +
      "(server:security-considerations:filter-incoming-content)"] = async () => {
  // ok so we're going to make two distbins, A and B, and test that A delivers to B
  const distbinA = distbin({
    inboxFilter: async (obj: ASObject) => {
      const content = get(obj, "object.content")
      if (content && content.toLowerCase().includes("viagra")) {
        return false
      }
      return true
    },
  })
  const distbinB = distbin({
    deliverToLocalhost: true,
  })
  // post a parent to distbinA
  const parentUrl = await postActivity(distbinA, {
    content: "Spam me",
    type: "Note",
  })
  // ok now to post the reply to distbinB
  const replyUrl = await postActivity(distbinB, {
    cc: [parentUrl],
    content: "Click here for free Viagra",
    inReplyTo: parentUrl,
    type: "Note",
  })
  // then verify that it is NOT in distbinA's inbox
  const reply = JSON.parse(await readableToString(await sendRequest(http.request(replyUrl))))
  const deliveryFailures = reply["distbin:activityPubDeliveryFailures"]
  assert.ok(deliveryFailures)
  assert.ok(deliveryFailures.some((failure: {message: string, name: string}) => {
    return failure.message.includes("This activity has been blocked by the configured inboxFilter")
  }))
  const distbinAInbox = JSON.parse(await readableToString(await sendRequest(
    await requestForListener(distbinA, "/activitypub/inbox"))))
  assert.equal(distbinAInbox.totalItems, 0, "distbinA inbox does NOT contain spam reply")
}

tests["When GET an activity, it has information about any replies it may have"] = async () => {
  // ok so we're going to make to distbins, A and B, and test that A delivers to B
  const distbinA = distbin()
  // post a parent to distbinA
  const parentUrl = await postActivity(distbinA, {
    content: "Reply to this if you think FSW could happen",
    type: "Note",
  })
  // ok now to post the reply
  const replyUrl = await postActivity(distbinA, {
    cc: [parentUrl],
    content: "Dear Anonymous, I believe in FSW",
    inReplyTo: parentUrl,
    type: "Note",
  })
  const reply = JSON.parse(await readableToString(await sendRequest(http.get(replyUrl))))
  const parent = JSON.parse(await readableToString(await sendRequest(http.get(parentUrl))))
  assert.equal(typeof parent.replies, "string", "has .replies URL")
  const repliesResponse = await sendRequest(http.get(url.resolve(parentUrl, parent.replies)))
  assert.equal(repliesResponse.statusCode, 200, "can fetch URL of .replies and get response")
  const repliesCollection = JSON.parse(await readableToString(repliesResponse))
  // should be one reply
  assert.equal(repliesCollection.totalItems, 1, "replies collection .totalItems is right")
  assert(repliesCollection.items, "has .items")
  assert.equal(repliesCollection.items[0].id, reply.id, ".items contains the reply")
}

tests["Activities can have a .generator"] = async () => {
  const distbinA = distbin()
  const activityToPost = {
    content: "this has a generator",
    generator: {
      name: "distbin-html",
      type: "Application",
      url: "http://distbin.com",
    },
    type: "Note",
  }
  const activityUrl = await postActivity(distbinA, activityToPost)
  const activity = JSON.parse(await readableToString(await sendRequest(http.get(activityUrl))))
  // note: it was converted to a 'Create' activity
  assert(activity.object.generator, "has a generator")
}

tests["GET an activity has a .url that resolves"] = async () => {
  const activityUrl = await postActivity(distbin(), {
    content: "you can read this without knowing wtf JSON is!",
    type: "Note",
  })
  const activityResponse = await sendRequest(http.request(Object.assign(url.parse(activityUrl), {
    headers: {
      accept: "text/html",
    },
  })))
  assert.equal(activityResponse.statusCode, 200)
  const fetchedActivity = JSON.parse(await readableToString(activityResponse))
  assert(fetchedActivity.url, "has .url property")
  await Promise.all(ensureArray(fetchedActivity.url).map(async (fetchedActivityUrl: string) => {
    const resolvedUrl = url.resolve(activityUrl, fetchedActivityUrl)
    logger.debug("resolvedUrl", JSON.stringify({ fetchedActivityUrl, resolvedUrl, activityUrl, fetchedActivity }, null, 2))
    const urlResponse = await sendRequest(http.request(resolvedUrl))
    assert.equal(urlResponse.statusCode, 200)
  }))
}

tests["GET {activity.id}.json always sends json response, even if html if preferred by user-agent"] = async () => {
  const activityUrl = await postActivity(distbin(), {
    content: "Hi",
    type: "Note",
  })
  const activityResponse = await sendRequest(http.request(Object.assign(url.parse(activityUrl + ".json"), {
    headers: {
      accept: "text/html,*/*",
    },
  })))
  assert.equal(activityResponse.statusCode, 200)
  const fetchedActivity = JSON.parse(await readableToString(activityResponse))
  assert.ok(fetchedActivity)
}

if (require.main === module) {
  testCli(tests)
}
