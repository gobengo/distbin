// tests for distbin-specific stuff (arbitrary, non-protocol things)

const activitypub = require('../src/activitypub')
const assert = require('assert')
const distbin = require('../')
const http = require('http')
const { listen } = require('./util')
const { readableToString } = require('../src/util')
const { requestForListener } = require('./util')
const { sendRequest } = require('../src/util')
const url = require('url')

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
    'content': 'Hello, world',
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
      path: location,
    })
  )
  assert.equal(getActivityResponse.statusCode, 200)
  const newActivity = JSON.parse(await readableToString(getActivityResponse))

  assert(newActivity.inbox, 'activity should have an .inbox property')
}

// #TODO is notifying the .inReplyTo inbox even encouraged/allowed by activitypub await listen(http.createServer(distbinB))
tests['Posting a reply will notify be received the inReplyTo inbox (even if another distbin)'] = async function () {
  // ok so we're going to make to distbins, A and B, and test that A delivers to B
  const distbinA = distbin()
  const distbinB = distbin()
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
    cc: [parentUrl],
  })
  // then verify that it is in distbinA's inbox
  const replyId = JSON.parse(await readableToString(await sendRequest(http.request(replyUrl)))).id
  const distbinAInbox = JSON.parse(await readableToString(await sendRequest(
    await requestForListener(distbinA, '/activitypub/inbox'))))
  assert(distbinAInbox.items.find(a => a.id === replyId), 'distbinA inbox contains reply')
}