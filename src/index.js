module.exports = function () {
  return async function (req, res) {
    const handle = (handler) => {
      try {
        return handler(req, res);
      } catch (err) {
        return error(500, err)(req, res);
      }
    }
    switch (req.url) {
      case '/':
        return handle(index)
      case '/outbox':
        return handle(outbox)
      case '/public':
        return handle(public)
      default:
        return handle(error(404))
    }
  }
}

// root route, do nothing for now but 200
function index(req, res) {
  res.writeHead(200)
  res.end('distbin')
}

// route for ActivityPub Outbox
// https://w3c.github.io/activitypub/#outbox
function outbox(req, res) {
  switch (req.method.toLowerCase()) {
    case 'get':
      res.writeHead(200);
      res.end(JSON.stringify({
        type: "OrderedCollection"
      }, null, 2))
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
  return (req, res) => {
    res.writeHead(statusCode)
    const responseText = error ? error.toString() : statusCode.toString()
    res.end(responseText)    
  }
}
