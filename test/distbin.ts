// tests for distbin-specific stuff (arbitrary, non-protocol things)

const activitypub = require('../src/activitypub')
const assert = require('assert')
import { testCli } from '.'
const distbin = require('../')
const http = require('http')
const { isProbablyAbsoluteUrl } = require('./util')
const { listen } = require('./util')
const { readableToString } = require('../src/util')
const { requestForListener } = require('./util')
const { linkToHref } = require('../src/util')
const { sendRequest } = require('../src/util')
import * as url from 'url'
import { HttpRequestResponder, Activity, isActivity, ASObject, Extendable, LDValue, LDValues, LDObject, DistbinActivity, JSONLD } from './types'

let tests = module.exports

tests['distbin can be imported'] = () => {
  assert(distbin, 'distbin is truthy')
}

tests['can create a distbin'] = () => {
  distbin()
}

tests['can send http requests to a distbin.Server'] = async function () {
  const res = await sendRequest(await requestForListener(distbin()))
  assert.equal(res.statusCode, 200)
}

tests['/ route can be fetched as JSONLD and includes pointers to things like outbox'] = async function () {
  const res = await sendRequest(await requestForListener(distbin(), {
    headers: {
      'accept': 'application/ld+json'
    }
  }))
  assert.equal(res.statusCode, 200)

  const resBody = await readableToString(res)
  const rootResource = JSON.parse(resBody)
  // #TODO: maybe a more fancy JSON-LD-aware check
  assert(Object.keys(rootResource).includes('outbox'), '/ points to outbox')
  assert(Object.keys(rootResource).includes('inbox'), '/ points to inbox')
}

tests['can fetch /recent to see what\'s been going on'] = async function () {
  const res = await sendRequest(await requestForListener(distbin(), {
    path: '/recent',
    headers: {
      'accept': 'application/ld+json'
    }
  }))
  assert.equal(res.statusCode, 200)
  const resBody = await readableToString(res)
  const recentCollection = JSON.parse(resBody)
  assert.equal(recentCollection.type, 'OrderedCollection')
  assert(Array.isArray(recentCollection.items), '.items is an Array')
}

tests['can page through /public collection.current'] = async function () {
  const d = distbin()
  const toCreate = [
    { name: 'first!' },
    { name: 'second' },
    { name: 'third' },
    { name: 'forth' }
  ].map(a => Object.assign(a, {
    cc: ['https://www.w3.org/ns/activitystreams#Public']
  }))
  let created = []
  for (let i = 0; i < toCreate.length; i++) {
    created.push(await postActivity(d, toCreate[i]))
  }
  // const createdFull = await Promise.all(created.map(async function (url) {
  //   return JSON.parse(await readableToString(await sendRequest(http.request(url))))
  // }))
  // console.log('createdFull', createdFull)
  assert.equal(created.length, 4)
  const collectionUrl = '/activitypub/public'
  const collectionRes = await sendRequest(await requestForListener(d, {
    path: collectionUrl,
    headers: {
      'accept': 'application/ld+json',
      'Prefer': 'return=representation; max-member-count="1"'
    }
  }))
  const collection = JSON.parse(await readableToString(collectionRes))
  assert.equal(collection.type, 'Collection')
  assert.equal(collection.items.length, 1)
  // we get the most recently created one
  assert.equal(url.parse(collection.items[0].url).pathname, url.parse(created[created.length - 1]).pathname)
  assert(!collection.next, 'collection does not have a next property')
  assert(collection.current, 'collection has a .current property')
  assert(collection.first, 'collection has a .first property')
  const page1Url = url.resolve(collectionUrl, linkToHref(collection.current))
  // page 1
  const page1Res = await sendRequest(await requestForListener(d, {
    path: page1Url,
    headers: {
      'accept': 'application/ld+json',
      // NOTE! getting 2 this time
      'Prefer': 'return=representation; max-member-count="1"'
    }
  }))
  assert.equal(page1Res.statusCode, 200)
  const page1 = JSON.parse(await readableToString(page1Res))
  assert.equal(page1.type, 'OrderedCollectionPage')
  assert.equal(page1.startIndex, 0)
  assert.equal(page1.orderedItems.length, 1)
  assert(page1.next, 'has a next property')

  // page 2 (get 2 items, not 1)
  const page2Url = url.resolve(page1Url, page1.next)
  const page2Res = await sendRequest(await requestForListener(d, {
    path: page2Url,
    headers: {
      'accept': 'application/ld+json',
      // NOTE! getting 2 this time
      'Prefer': 'return=representation; max-member-count="2"'
    }
  }))
  assert.equal(page2Res.statusCode, 200)
  const page2 = JSON.parse(await readableToString(page2Res))
  assert.equal(page2.type, 'OrderedCollectionPage')
  assert.equal(page2.startIndex, 1)
  assert.equal(page2.orderedItems.length, 2)
  assert(page2.next, 'has a next property')
  // should have second most recently created
  assert.equal(url.parse(page2.orderedItems[0].url).pathname, url.parse(created[created.length - 2]).pathname)
  assert.equal(url.parse(page2.orderedItems[1].url).pathname, url.parse(created[created.length - 3]).pathname)
  // ok so if we post one more new thing, the startIndex on page2 should go up by one.
  const fifth = {
    cc: ['https://www.w3.org/ns/activitystreams#Public'],
    name: 'fifth'
  }
  created.push(await postActivity(d, fifth))
  const page2AfterFifthRes = await sendRequest(await requestForListener(d, {
    path: page2Url,
    headers: {
      'accept': 'application/ld+json',
      'Prefer': 'return=representation; max-member-count="2"'
    }
  }))
  const page2AfterFifth = JSON.parse(await readableToString(page2AfterFifthRes))
  assert.equal(page2AfterFifth.startIndex, 2)
  // page 3
  const page3Url = url.resolve(page2Url, page2.next)
  const page3Res = await sendRequest(await requestForListener(d, {
    path: page3Url,
    headers: {
      'accept': 'application/ld+json',
      'Prefer': 'return=representation; max-member-count="2"'
    }
  }))
  assert.equal(page3Res.statusCode, 200)
  const page3 = JSON.parse(await readableToString(page3Res))
  assert.equal(page3.type, 'OrderedCollectionPage')
  assert.equal(page3.startIndex, 4)
  assert.equal(page3.orderedItems.length, 1)
  assert.equal(url.parse(page3.orderedItems[0].url).pathname, url.parse(created[created.length - 5]).pathname)
  // page3 can specify a next, but when fetched it shouldn't have any items
  // or continue pointing to next
  if (page3.next) {
    const page4Url = url.resolve(page3Url, page3.next)
    const page4Res = await sendRequest(await requestForListener(d, {
      path: page4Url,
      headers: {
        'accept': 'application/ld+json',
        'Prefer': 'return=representation; max-member-count="2"'
      }
    }))
    assert.equal(page4Res.statusCode, 200)
    const page4 = JSON.parse(await readableToString(page4Res))
    assert.equal(page4.orderedItems.length, 0)
    assert(!page4.next)
  }
}

// Example 8,9: Submitting an Activity to the Outbox
tests['posted activities have an .inbox (e.g. to receive replies in)'] = async function () {
  // Create an Activity by POSTing to outbox
  const distbinListener = distbin()
  const req = await requestForListener(distbinListener, {
    headers: activitypub.clientHeaders({
      'content-type': 'application/ld+json; profile="https://www.w3.org/ns/activitystreams#"'
    }),
    method: 'post',
    path: '/activitypub/outbox'
  })
  req.write(JSON.stringify({
    '@context': 'https://www.w3.org/ns/activitypub',
    'type': 'Article',
    'content': 'Hello, world'
  }))
  const postActivityRequest = await sendRequest(req)
  assert.equal(postActivityRequest.statusCode, 201)
  // Determine Location of new Activity
  const location = postActivityRequest.headers.location
  assert(location, 'Location header is present in response')
  // Now get the new Activity

  const getActivityResponse = await sendRequest(
    await requestForListener(distbinListener, {
      headers: activitypub.clientHeaders(),
      path: location
    })
  )
  assert.equal(getActivityResponse.statusCode, 200)
  const newActivity = JSON.parse(await readableToString(getActivityResponse))

  assert(newActivity.inbox, 'activity should have an .inbox property')
}

// #TODO is notifying the .inReplyTo inbox even encouraged/allowed by activitypub?
tests['Posting a reply will notify the inReplyTo inbox (even if another distbin)'] = async function () {
  // ok so we're going to make two distbins, A and B, and test that A delivers to B
  const distbinA = distbin()
  const distbinB = distbin()
  // post a parent to distbinA
  const parentUrl = await postActivity(distbinA, {
    type: 'Note',
    content: 'Reply to this if you think FSW could happen'
  })
  // ok now to post the reply to distbinB
  const replyUrl = await postActivity(distbinB, {
    type: 'Note',
    content: 'Dear Anonymous, I believe in FSW',
    inReplyTo: parentUrl,
    cc: [parentUrl]
  })
  // then verify that it is in distbinA's inbox
  const replyId = JSON.parse(await readableToString(await sendRequest(http.request(replyUrl)))).id
  const distbinAInbox = JSON.parse(await readableToString(await sendRequest(
    await requestForListener(distbinA, '/activitypub/inbox'))))
  const replyFromDistbinAInbox = distbinAInbox.items.find((a: DistbinActivity) => {
    debugger
    const idMatches = a.id === replyId
    if (idMatches) return true
    const wasDerivedFrom = a['http://www.w3.org/ns/prov#wasDerivedFrom']
    if ( ! wasDerivedFrom) return false
    function nodeWasDerivedFrom(o: ASObject|string, nodeId: string): boolean {
      if (typeof o === 'object') return o.id === nodeId
      else if (typeof o === 'string') return o === nodeId
      return false
    }
    const matchesReplyId = (o: DistbinActivity|string): boolean => nodeWasDerivedFrom(o, replyId)    
    if (wasDerivedFrom instanceof Array) {
      return wasDerivedFrom.some(matchesReplyId)
    } else if (isActivity(wasDerivedFrom)
            || typeof wasDerivedFrom === 'string') {
      return matchesReplyId(wasDerivedFrom)
    } else if (typeof wasDerivedFrom === 'object') {
      for (let id of [(<ASObject>wasDerivedFrom).id, (<JSONLD>wasDerivedFrom)['@id']]) {
        if (typeof id === 'string') return matchesReplyId(id)
      }
      return false
    } else {
      const _exhaustiveCheck: never = wasDerivedFrom;
    }
  })
  assert(replyFromDistbinAInbox, 'distbinA inbox contains reply')
  assert.equal(isProbablyAbsoluteUrl(replyFromDistbinAInbox.replies), true,
    'activity is delivered with .replies as a valid absolute url')

  // So now distbinA is storing a replicated copy of the reply canonically hosted on distbinB.
  // What happens if we try to request this reply's id on distbinA
  // const replicatedReplyResponse = await sendRequest(await requestForListener(distbinA, {
  //   path: '/activities/'+replyFromDistbinAInbox.uuid
  // }))
  // assert.equal(replicatedReplyResponse.statusCode, 302)
  // assert(isProbablyAbsoluteUrl(replicatedReplyResponse.headers.location), 'location header is absolute URL')
}

tests['When GET an activity, it has information about any replies it may have'] = async function () {
  // ok so we're going to make to distbins, A and B, and test that A delivers to B
  const distbinA = distbin()
  // post a parent to distbinA
  const parentUrl = await postActivity(distbinA, {
    type: 'Note',
    content: 'Reply to this if you think FSW could happen'
  })
  // ok now to post the reply
  const replyUrl = await postActivity(distbinA, {
    type: 'Note',
    content: 'Dear Anonymous, I believe in FSW',
    inReplyTo: parentUrl,
    cc: [parentUrl]
  })
  const reply = JSON.parse(await readableToString(await sendRequest(http.get(replyUrl))))
  const parent = JSON.parse(await readableToString(await sendRequest(http.get(parentUrl))))
  assert.equal(typeof parent.replies, 'string', 'has .replies URL')
  const repliesResponse = await sendRequest(http.get(url.resolve(parentUrl, parent.replies)))
  assert.equal(repliesResponse.statusCode, 200, 'can fetch URL of .replies and get response')
  const repliesCollection = JSON.parse(await readableToString(repliesResponse))
  // should be one reply
  assert.equal(repliesCollection.totalItems, 1, 'replies collection .totalItems is right')
  assert(repliesCollection.items, 'has .items')
  assert.equal(repliesCollection.items[0].id, reply.id, '.items contains the reply')
}

tests['Activities can have a .generator'] = async function () {
  const distbinA = distbin()
  const activityToPost = {
    type: 'Note',
    content: 'this has a generator',
    generator: {
      type: 'Application',
      name: 'distbin-html',
      url: 'http://distbin.com'
    }
  }
  const activityUrl = await postActivity(distbinA, activityToPost)
  const activity = JSON.parse(await readableToString(await sendRequest(http.get(activityUrl))))
  // note: it was converted to a 'Create' activity
  assert(activity.object.generator, 'has a generator')
}

tests['GET an activity has a .url that resolves'] = async function () {
  const activityUrl = await postActivity(distbin(), {
    type: 'Note',
    content: 'you can read this without knowing wtf JSON is!'
  })
  const activityResponse = await sendRequest(http.request(Object.assign(url.parse(activityUrl), {
    headers: {
      accept: 'text/html'
    }
  })))
  assert.equal(activityResponse.statusCode, 200)
  const fetchedActivity = JSON.parse(await readableToString(activityResponse))
  assert(fetchedActivity.url, 'has .url property')
  const urlResponse = await sendRequest(http.request(url.resolve(activityUrl, fetchedActivity.url)))
  assert.equal(urlResponse.statusCode, 200)
}

tests['GET {activity.id}.json always sends json response, even if html if preferred by user-agent'] = async function () {
  const activityUrl = await postActivity(distbin(), {
    type: 'Note',
    content: 'Hi'
  })
  const activityResponse = await sendRequest(http.request(Object.assign(url.parse(activityUrl + '.json'), {
    headers: {
      accept: 'text/html,*/*'
    }
  })))
  assert.equal(activityResponse.statusCode, 200)
  const fetchedActivity = JSON.parse(await readableToString(activityResponse))
  assert.ok(fetchedActivity)
}

// post an activity to a distbin, and return its absolute url
async function postActivity (distbinListener: HttpRequestResponder, activity: LDObject<ASObject>) {
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

if (require.main === module) {
  testCli(tests)
}
