const url = require('url')

exports.debuglog = require('util').debuglog('distbin')

exports.readableToString = async function (readable) {
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

exports.requestUrl = (req) => `http://${req.headers.host}${req.url}`

// given a map of strings/regexes to listener factories,
// return a matching route (or undefined if no match)
exports.route = (routes, req) => {
  const path = url.parse(req.url).pathname
  for (let [route, createHandler] of routes.entries()) {
    if (typeof route === 'string') {
      // exact match
      if (path !== route) continue
      return createHandler()
    }
    if (route instanceof RegExp) {
      let match = path.match(route)
      if (!match) continue
      return createHandler(...match.slice(1))
    }
  }
}

exports.sendRequest = async function (request) {
  return new Promise((resolve, reject) => {
    request.once('response', resolve)
    request.once('error', reject)
    if (!request.ended) request.end()
  })
}

const SURROGATE_PAIR_REGEXP = /[\uD800-\uDBFF][\uDC00-\uDFFF]/g
// Match everything outside of normal chars and " (quote character)
const NON_ALPHANUMERIC_REGEXP = /([^#-~| |!])/g
/**
 * Escapes all potentially dangerous characters, so that the
 * resulting string can be safely inserted into attribute or
 * element text.
 * @param value
 * @returns {string} escaped text
 */
exports.encodeHtmlEntities = function encodeEntities (value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(SURROGATE_PAIR_REGEXP, function (value) {
      var hi = value.charCodeAt(0)
      var low = value.charCodeAt(1)
      return '&#' + (((hi - 0xD800) * 0x400) + (low - 0xDC00) + 0x10000) + ';'
    })
    .replace(NON_ALPHANUMERIC_REGEXP, function (value) {
      return '&#' + value.charCodeAt(0) + ';'
    })
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// given a function that accepts a "node-style" errback as its last argument, return
// a function that returns a promise instead
exports.denodeify = function denodeify (funcThatAcceptsErrback) {
  return function (...args) {
    return new Promise((resolve, reject) => {
      funcThatAcceptsErrback.apply(this, args.concat([(err, ...results) => {
        if (err) return reject(err)
        return resolve.apply(this, results)
      }]))
    })
  }.bind(this)
}
