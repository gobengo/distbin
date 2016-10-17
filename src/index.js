const url = require('url')
const uuid = require('node-uuid')

// given a non-uri activity id, return an activity URI
const activityUri = (uuid) => `urn:uuid:${uuid}`

// Factory function for another node.http handler function that defines distbin's web logic
// (routes requests to sub-handlers with common error handling)
module.exports = function () {
  // #TODO: This should be size-bound e.g. LRU
  // #TODO: This should be persistent :P
  const activities = new Map()
  return function (req, res) {
    const requestPath = url.parse(req.url).pathname
    const simpleRoutes = {
      '/': index,
      '/recent': recentHandler({ activities }),
      '/activitypub/outbox': outboxHandler({ activities }),
      '/activitypub/public': publicCollectionHandler({ activities })
    }
    let handler = simpleRoutes[requestPath]

    if (!handler) {
      const activityUuidMatch = requestPath.match('^/activities/([^/]+)')
      if (activityUuidMatch) {
        const activityUuid = activityUuidMatch[1]
        handler = activityHandler({ activities, activityUuid })
      }
    }

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

// get specific activity by id
function activityHandler ({ activities, activityUuid }) {
  return function (req, res) {
    const uri = activityUri(activityUuid)
    const activity = activities.get(uri)
    if (!activity) {
      res.writeHead(404)
      res.end('There is no activity ' + uri)
      return
    }
    // woo its here
    res.writeHead(200)
    res.end(JSON.stringify(activity, null, 2))
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
        'outbox': 'activitypub:outbox'
      }
    ],
    'type': 'Service',
    'name': 'distbin',
    'summary': 'A public service to store and retrieve posts and enable (federated, standards-compliant) social interaction around them',
    'outbox': '/activitypub/outbox',
    'recent': '/recent'
  }, null, 2))
}

// fetch a collection of recent Activities/things
function recentHandler ({ activities }) {
  return (req, res) => {
    const maxMemberCount = requestMaxMemberCount(req) || 10
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*'
    })
    res.end(JSON.stringify({
      '@context': 'https://www.w3.org/ns/activitystreams',
      'summary': 'Things that have recently been created',
      'type': 'OrderedCollection',
      // Get recent 10 items
      'items': [...activities.values()].reverse().slice(-1 * maxMemberCount),
      'totalItems': activities.size,
      // empty string is relative URL for 'self'
      'current': ''
    }, null, 2))
  }
}

// route for ActivityPub Outbox
// https://w3c.github.io/activitypub/#outbox
function outboxHandler ({ activities }) {
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
        const newThing = Object.assign(JSON.parse(requestBody), {
          // #TODO: validate that newThing wasn't submitted with an .id, even though spec says to rewrite it
          id: activityUri(newuuid),
          // #TODO: what if it already had published?
          published: (new Date()).toISOString()
        })
        // #TODO: read request body, validate, and save it somewhere...
        const location = '/activities/' + newuuid
        activities.set(newThing.id, newThing)
        res.writeHead(201, { location })
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
  return (req, res) => {
    const publicCollection = {
      '@context': 'https://www.w3.org/ns/activitypub',
      'id': 'https://www.w3.org/ns/activitypub/Public',
      'type': 'Collection'
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

async function readableToString (readable) {
  let body = ''
  return new Promise((resolve, reject) => {
    readable.on('error', reject)
    readable.on('data', (chunk) => {
      body += chunk
      return body
    })
    readable.on('end', () => resolve(body))
  })
}
