// tests for distbin-specific stuff (arbitrary, non-protocol things)

const activitypub = require('../src/activitypub')
const assert = require('assert')
const distbin = require('../')
const http = require('http')
const { isProbablyAbsoluteUrl } = require('./util')
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

// #TODO is notifying the .inReplyTo inbox even encouraged/allowed by activitypub?
tests['Posting a reply will notify be received the inReplyTo inbox (even if another distbin)'] = async function () {
  // ok so we're going to make to distbins, A and B, and test that A delivers to B
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
    cc: [parentUrl],
  })
  // then verify that it is in distbinA's inbox
  const replyId = JSON.parse(await readableToString(await sendRequest(http.request(replyUrl)))).id
  const distbinAInbox = JSON.parse(await readableToString(await sendRequest(
    await requestForListener(distbinA, '/activitypub/inbox'))))
  const replyFromDistbinAInbox = distbinAInbox.items.find(a => a.id === replyId)
  assert(replyFromDistbinAInbox, 'distbinA inbox contains reply')
  assert.equal(isProbablyAbsoluteUrl(replyFromDistbinAInbox.replies), true,
    'activity is delivered with .replies as a valid absolute url')

  // So now distbinA is storing a replicated copy of the reply canonically hosted on distbinB.
  // What happens if we try to request this reply's id on distbinA
  const replicatedReplyResponse = await sendRequest(await requestForListener(distbinA, {
    path: '/activities/'+replyFromDistbinAInbox.uuid
  }))
  assert.equal(replicatedReplyResponse.statusCode, 302)
  assert(isProbablyAbsoluteUrl(replicatedReplyResponse.headers.location), 'location header is absolute URL')
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
    cc: [parentUrl],
  })
  const replyId = JSON.parse(await readableToString(await sendRequest(http.get(replyUrl)))).id
  // this is a reply to something else to test filtering
  const notReplyUrl = await postActivity(distbinA, {
    type: 'Note',
    content: 'Not a reply',
    inReplyTo: parentUrl+'foo',
  })
  const parent = JSON.parse(await readableToString(await sendRequest(http.get(parentUrl))))
  assert.equal(typeof parent.replies, 'string', 'has .replies URL')
  const repliesResponse = await sendRequest(http.get(url.resolve(parentUrl, parent.replies)))
  assert.equal(repliesResponse.statusCode, 200, 'can fetch URL of .replies and get response')
  const repliesCollection = JSON.parse(await readableToString(repliesResponse))
  // should be one reply
  assert.equal(repliesCollection.totalItems, 1, 'replies collection .totalItems is right')
  assert(repliesCollection.items, 'has .items')
  assert.equal(repliesCollection.items[0].id, replyId, '.items contains the reply')
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
  })));
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
  })));
  assert.equal(activityResponse.statusCode, 200)
  const fetchedActivity = JSON.parse(await readableToString(activityResponse))
}

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