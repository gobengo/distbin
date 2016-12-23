const {
  as2ObjectIsActivity,
  targetAndDeliver,
  publicCollectionId
 } = require('./activitypub')
const {
  debuglog,
  readableToString,
  route,
} = require('./util')
const path = require('path')
const url = require('url')
const uuid = require('node-uuid')

// given a non-uri activity id, return an activity URI
const activityUri = (uuid) => `urn:uuid:${uuid}`

// Factory function for another node.http handler function that defines distbin's web logic
// (routes requests to sub-handlers with common error handling)
module.exports = function distbin({
  // Juse use Map as default, but users should provide more bette data structures
  // #TODO: This should be size-bound e.g. LRU
  // #TODO: This should be persistent :P
  activities = new Map(),
  inbox = new Map(),
  // used for delivering to other inboxes so they can find this guy
  externalUrl
} = {}) {
  return function (req, res) {
    externalUrl = externalUrl || `http://${req.headers.host}${req.url}`
    const routes = new Map([
      ['/', () => index],
      ['/recent', () => recentHandler({ activities })],
      ['/activitypub/inbox', () => inboxHandler({ activities, inbox })],
      ['/activitypub/outbox', () => outboxHandler({ activities, externalUrl })],
      ['/activitypub/public', () => publicCollectionHandler({ activities })],
      // /activities/{activityUuid}.{format}
      [/^\/activities\/([^\/]+?)(\.(.+))$/,
        (activityUuid, _, format) => activityWithExtensionHandler({ activities, activityUuid, format })],
      // /activities/{activityUuid}
      [/^\/activities\/([^\/]+)$/,
        (activityUuid) => activityHandler({ activities, activityUuid })],
      [/^\/activities\/([^\/]+)\/replies$/,
        (activityUuid) => activityRepliesHandler({ activities, activityUuid })],
    ])

    let handler = route(routes, req)

    if (!handler) {
      handler = error(404)
    }
    try {
      return handler(req, res)
    } catch (err) {
      return error(500, err)(req, res)
    }
  }
}

// Return new value for a JSON-LD object's value, appending to any existing one
function jsonldAppend(oldVal, valToAppend) {
  let newVal;
  switch (typeof oldVal) {
    case 'object':
      if (Array.isArray(oldVal)) {
        newVal = oldVal.concat(valToAppend)
      } else {
        newVal = [oldVal, valToAppend]
      }
      break
    case 'undefined':
      newVal = valToAppend
      break
    default:
      newVal = [oldVal, valToAppend]
      break
  }
  return newVal
}

function isHostedLocally(activityFreshFromStorage) {
  return ! activityFreshFromStorage.hasOwnProperty('url')
}

// return a an extended version of provided activity with some extra metadata properties like 'inbox', 'url', 'replies'
// if 'baseUrl' opt is provided, those extra properties will be absolute URLs, not relative
const locallyHostedActivity = function (activity, { externalUrl='' } = {}) {
  if (activity.url) {
    debuglog("Unexpected .url property when processing activity assumed to be locally hosted\n"+JSON.stringify(activity))
    throw new Error("Unexpected .url property when processing activity assumed to be locally hosted")
  }
  const uuidMatch = activity.id.match(/^urn:uuid:([^$]+)$/);
  if ( ! uuidMatch) throw new Error("Couldn't determine UUID for activity with id", activity.id)
  const uuid = uuidMatch[1]
  // Each activity should have an ActivityPub/LDN inbox where it can receive notifications.
  let inboxUrl = url.resolve(externalUrl, '/activitypub/inbox') // TODO should this be an inbox specific to this activity?
  const activityUrl = url.resolve(externalUrl, '/activities/'+uuid)
  const repliesUrl = url.resolve(externalUrl, '/activities/'+uuid+'/replies')
  return Object.assign({}, activity, {
    inbox: jsonldAppend(activity.inbox, inboxUrl),
    url: jsonldAppend(activity.url, activityUrl),
    replies: repliesUrl,
  }) 
}

// get specific activity by id
function activityHandler ({ activities, activityUuid }) {
  return async function (req, res) {
    const uri = activityUri(activityUuid)
    const activity = await Promise.resolve(activities.get(uri))
    // #TODO: If the activity isn't addressed to the public, we should enforce access controls here.
    if (!activity) {
      res.writeHead(404)
      res.end('There is no activity ' + uri)
      return
    }
    // return the activity
    const extendedActivity = locallyHostedActivity(activity)
    // woo its here
    res.writeHead(200)
    res.end(JSON.stringify(extendedActivity, null, 2))
  }
}

function activityWithExtensionHandler({ activities, activityUuid, format }) {
  return async function (req, res) {
    if (format !== 'json') {
      res.writeHead(404)
      res.end('Unsupported activity extension .'+format)
      return
    }
    return activityHandler({ activities, activityUuid })(req, res)
  }
}

function activityRepliesHandler ({ activities, activityUuid }) {
  return async function (req, res) {
    const uri = activityUri(activityUuid)
    const activity = await Promise.resolve(activities.get(uri))
    // #TODO: If the activity isn't addressed to the public, we should enforce access controls here.
    if (!activity) {
      res.writeHead(404)
      res.end('There is no activity ' + uri)
      return
    }
    const allActivities = Array.from(await Promise.resolve(activities.values()))
    const replies = Array.from(allActivities)
      .filter(activity => {
        const parent = activity && activity.object && activity.object.inReplyTo;
        if ( ! parent) return;
        // TODO .inReplyTo could be a urn, http URL, something else?
        return url.parse(parent).pathname === '/activities/'+activityUuid
      })
      .map(activity => {
        if (isHostedLocally(activity)) {
          return locallyHostedActivity(activity)
        }
        return activity
      })
    res.writeHead(200)
    res.end(JSON.stringify({
      type: 'Collection',
      name: 'replies to item with UUID '+activityUuid,
      totalItems: replies.length,
      // TODO: sort/paginate/limit this
      items: replies,
    }, null, 2))
  }
}

// root route, do nothing for now but 200
function index (req, res) {
  res.writeHead(200)
  res.end(JSON.stringify({
    '@context': [
      'https://www.w3.org/ns/activitystreams',
      {
        'activitypub': 'https://www.w3.org/ns/activitypub#',
        'inbox': 'activitypub:inbox',
        'outbox': 'activitypub:outbox'
      }
    ],
    'type': 'Service',
    'name': 'distbin',
    'summary': 'A public service to store and retrieve posts and enable (federated, standards-compliant) social interaction around them',
    'inbox': '/activitypub/inbox',
    'outbox': '/activitypub/outbox',
    'recent': '/recent'
  }, null, 2))
}

// fetch a collection of recent Activities/things
function recentHandler ({ activities }) {
  return async function (req, res) {
    const maxMemberCount = requestMaxMemberCount(req) || 10
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*'
    })
    res.end(JSON.stringify({
      '@context': 'https://www.w3.org/ns/activitystreams',
      'summary': 'Things that have recently been created',
      'type': 'OrderedCollection',
      // Get recent 10 items
      'items': [...(await Promise.resolve(activities.values()))].reverse().slice(-1 * maxMemberCount),
      'totalItems': await activities.size,
      // empty string is relative URL for 'self'
      'current': ''
    }, null, 2))
  }
}

// route for ActivityPub Inbox
// https://w3c.github.io/activitypub/#inbox
function inboxHandler ({ activities, inbox }) {
  return async function (req, res) {
    switch (req.method.toLowerCase()) {
      case 'get':
        const maxMemberCount = requestMaxMemberCount(req) || 10
        res.writeHead(200)
        res.end(JSON.stringify({
          '@context': 'https://www.w3.org/ns/activitystreams',
          type: 'OrderedCollection',
          items: [...(await Promise.resolve(inbox.values()))].reverse().slice(-1 * maxMemberCount),
          totalItems: await inbox.size,
          // empty string is relative URL for 'self'
          current: ''
        }, null, 2))
        break
      case 'post':
        debuglog('receiving inbox POST')
        const requestBody = await readableToString(req)
        debuglog(requestBody)
        let parsed
        try {
          parsed = JSON.parse(requestBody)
        } catch (e) {
          res.writeHead(400)
          res.end("Couldn't parse request body as JSON: " + requestBody)
          return
        }
        const existsAlreadyInInbox = parsed.id ? await Promise.resolve(inbox.get(parsed.id)) : false
        if (existsAlreadyInInbox) {
          // duplicate!
          res.writeHead(409)
          res.end('There is already an activity in the inbox with id ' + parsed.id)
          return
        }

        if (!parsed.id) {
          parsed.id = activityUri(uuid())
        }

        // If receiving a notification about an activity we've seen before (e.g. it is canonically hosted here),
        // this will be true
        const existsAlreadyInActivities = parsed.id ? await Promise.resolve(activities.get(parsed.id)) : false
        if (existsAlreadyInActivities) {
          // #TODO merge or something? Consider storing local ones and remote ones in different places
          debuglog('Inbox received activity already stored in activities store. Not overwriting internal one. But #TODO')
        }

        await Promise.all([
          inbox.set(parsed.id, parsed),
          // todo: Probably setting on inbox should automagically add to global set of activities
          existsAlreadyInActivities ? null : activities.set(parsed.id, parsed),
        ])

        res.writeHead(202)
        res.end()
        break
      default:
        return error(405, 'Method not allowed: ')(req, res)
    }
  }
}

// given a AS2 object, return it's JSON-LD @id
const getJsonLdId = (obj) => {
  const jsonLdId = typeof obj === 'string' ? obj : (obj.id || obj['@id'])
  return jsonLdId
}

// return whether a given activity targets another resource (e.g. in to, cc, bcc)
const activityHasTarget = (activity, target) => {
  const targetId = getJsonLdId(target)
  if (!targetId) {
    throw new Error("Couldn't determine @id of " + target)
  }
  for (const targetList of [activity.to, activity.cc, activity.bcc]) {
    if (!targetList) continue
    const idsOfTargets = (Array.isArray(targetList) ? targetList : [targetList]).map(getJsonLdId)
    if (idsOfTargets.includes(targetId)) return true
  }
  return false
}

// route for ActivityPub Outbox
// https://w3c.github.io/activitypub/#outbox
function outboxHandler ({
  activities,
  // external location of distbin (used for delivery)
  externalUrl
}) {
  return async function (req, res) {
    switch (req.method.toLowerCase()) {
      case 'get':
        res.writeHead(200)
        res.end(JSON.stringify({
          '@context': 'https://www.w3.org/ns/activitystreams',
          type: 'OrderedCollection',
          items: []
        }, null, 2))
        break
      case 'post':
        const requestBody = await readableToString(req)
        const newuuid = uuid()
        let parsed
        try {
          parsed = JSON.parse(requestBody)
        } catch (e) {
          res.writeHead(400)
          res.end("Couldn't parse request body as JSON: " + requestBody)
          return
        }

        // https://w3c.github.io/activitypub/#object-without-create
        // The server must accept a valid [ActivityStreams] object that isn't a subtype of Activity in the POST request to the outbox.
        // The server then must attach this object as the object of a Create Activity.
        const submittedActivity = as2ObjectIsActivity(parsed) ? parsed : Object.assign(
          {
            '@context': 'https://www.w3.org/ns/activitystreams',
            'type': 'Create',
            'object': parsed
          },
          // copy over audience from submitted object to activity
          ['to', 'cc', 'bcc'].reduce((props, key) => {
            if (key in parsed) props[key] = parsed[key]
            return props
          }, {})
        )

        const newActivity = Object.assign(submittedActivity, {
          // #TODO: validate that newActivity wasn't submitted with an .id, even though spec says to rewrite it
          id: activityUri(newuuid),
          // #TODO: what if it already had published?
          published: (new Date()).toISOString()
        })
        // #TODO: validate the activity. Like... you probably shouldn't be able to just send '{}'
        const location = '/activities/' + newuuid

        // Save
        activities.set(newActivity.id, newActivity)

        res.writeHead(201, { location })

        try {
          // Target and Deliver to other inboxes
          const activityToDeliver = locallyHostedActivity(newActivity, { externalUrl })
          await targetAndDeliver(activityToDeliver)
        } catch (e) {
          if (e.name === 'SomeDeliveriesFailed') {
            // #TODO: Retry some day
            res.end(JSON.stringify({
              content: "Activity was created, but delivery to some others servers' inbox failed. They will not be retried.",
              failures: e.failures
            }))
            return
          }
          throw e
        }

        res.end()
        break
      default:
        return error(405, 'Method not allowed: ')(req, res)
    }
  }
}

// route for ActivityPub Public Collection
// https://w3c.github.io/activitypub/#public-addressing
function publicCollectionHandler ({ activities }) {
  return async function (req, res) {
    const maxMemberCount = requestMaxMemberCount(req) || 10
    const publicActivities = []
    for (let activity of [...await Promise.resolve(activities.values())].reverse()) {
      if (activityHasTarget(activity, publicCollectionId)) publicActivities.push(activity)
      if (publicActivities.length >= maxMemberCount) break;
    }
    const publicCollection = {
      '@context': 'https://www.w3.org/ns/activitystreams',
      'id': 'https://www.w3.org/ns/activitypub/Public',
      'type': 'Collection',
      // Get recent 10 items
      'items': publicActivities.map(activity => {
        if (isHostedLocally(activity)) {
          return locallyHostedActivity(activity);
        }
        return activity
      }),
      'totalItems': await activities.size,
      // empty string is relative URL for 'self'
      'current': ''
    }
    res.writeHead(200)
    res.end(JSON.stringify(publicCollection, null, 2))
  }
}

function error (statusCode, error) {
  if (error) {
    console.error(error)
  }
  return (req, res) => {
    res.writeHead(statusCode)
    const responseText = error ? error.toString() : statusCode.toString()
    res.end(responseText)
  }
}

// utilities

// Check request parameters (http Prefer, then querystring) for a max-member-count
function requestMaxMemberCount (req) {
  const headerMatch = req.headers.prefer ? req.headers.prefer.match(/max-member-count="(\d+)"/) : null
  if (headerMatch) return parseInt(headerMatch[1], 10)
  // check querystring
  return parseInt(url.parse(req.url, true).query['max-member-count'], 10)
}
