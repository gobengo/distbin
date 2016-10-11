const url = require('url');
const uuid = require('node-uuid');

// Store is a Map that can only be added to.
// #TODO: This should be size-bound e.g. LRU
// #TODO: This should be persistent :P
class Store extends Map {
  clear() {
    throw new Error("clearing not allowed")
  }
  delete() {
    throw new Error("deleting not allowed")
  }
  set(key, val) {
    if (this.has(key)) {
      throw new Error("Can't set existing key "+key)
    }
    return super.set(key, val)
  }
}

// #TODO: This should be provided to handlers in a way that is not module-scope, e.g. with a more top-level object
const store = new Store

module.exports = function () {
  return async function (req, res) {
    const handler = {
      '/': index,
      '/recent': recent,
      '/activitypub/outbox': outbox,
      '/activitypub/public': public,
    }[url.parse(req.url).pathname] || error(404)
    try {
      return handler(req, res);
    } catch (err) {
      return error(500, err)(req, res);
    }
  }
}

// root route, do nothing for now but 200
function index(req, res) {
  res.writeHead(200)
  res.end(JSON.stringify({
    "@context": [
      "https://www.w3.org/ns/activitystreams",
      {
        "activitypub": "https://www.w3.org/ns/activitypub#",
        "outbox": "activitypub:outbox"
      }
    ],
    "type": "Service",
    "name": "distbin",
    "summary": "A public service to store and retrieve posts and enable (federated, standards-compliant) social interaction around them",
    "outbox": "/activitypub/outbox",
    "recent": "/recent",
  }, null, 2))
}

// fetch a collection of recent Activities/things
function recent(req, res) {
  const maxMemberCount = requestMaxMemberCount(req) || 10;
  res.writeHead(200, {
    'Access-Control-Allow-Origin': '*'
  })
  res.end(JSON.stringify({
    "@context": "https://www.w3.org/ns/activitystreams",
    "summary": "Things that have recently been created",
    "type": "OrderedCollection",
    // Get recent 10 items
    "items": [...store.values()].reverse().slice(-1 * maxMemberCount),
    "totalItems": store.size,
    // empty string is relative URL for 'self'
    "current": "",
  }, null, 2))
}

// route for ActivityPub Outbox
// https://w3c.github.io/activitypub/#outbox
async function outbox(req, res) {
  switch (req.method.toLowerCase()) {
    case 'get':
      res.writeHead(200);
      res.end(JSON.stringify({
        "@context": "https://www.w3.org/ns/activitystreams",
        type: "OrderedCollection",
        items: []
      }, null, 2))
      break;
    case 'post':
      const requestBody = await readableToString(req)
      const newuuid = uuid()
      const newThing = Object.assign(JSON.parse(requestBody), {
        // #TODO: validate that newThing wasn't submitted with an .id, even though spec says to rewrite it
        id: `urn:uuid:${newuuid}`,
        // #TODO: what if it already had published?
        published: (new Date).toISOString()
      })
      // #TODO: read request body, validate, and save it somewhere...
      const location = '/activitypub/outbox/'+newuuid
      store.set(newThing.id, newThing)
      res.writeHead(201, { location });
      res.end();
      break;
    default:
      return error(405, 'Method not allowed: ')(req, res)
  }
}

// route for ActivityPub Public Collection
// https://w3c.github.io/activitypub/#public-addressing
function public(req, res) {
  const publicCollection = {
    "@context": "https://www.w3.org/ns/activitypub",
    "id": "https://www.w3.org/ns/activitypub/Public",
    "type": "Collection"
  }
  res.writeHead(200)
  res.end(JSON.stringify(publicCollection, null, 2))
}

function error(statusCode, error) {
  if (error) {
    console.error(error);
  }
  return (req, res) => {
    res.writeHead(statusCode)
    const responseText = error ? error.toString() : statusCode.toString()
    res.end(responseText)    
  }
}

// utilities

// Check request parameters (http Prefer, then querystring) for a max-member-count
function requestMaxMemberCount(req) {
  const headerMatch = req.headers.prefer ? req.headers.prefer.match(/max-member-count="(\d+)"/) : null
  if (headerMatch) return parseInt(headerMatch[1], 10)
  // check querystring
  return parseInt(url.parse(req.url, true).query['max-member-count'], 10)
}

async function readableToString(readable) {
  let body = '';
  return new Promise((resolve, reject) => {
    readable.on('error', reject);
    readable.on('data', (chunk) => body += chunk)
    readable.on('end', () => resolve(body))
  })
}
