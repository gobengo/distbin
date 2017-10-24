/// <reference types="node" />
const jsonldRdfaParser = require('jsonld-rdfa-parser')
const jsonldLib = require('jsonld')
jsonldLib.registerRDFParser('text/html', jsonldRdfaParser)
const url = require('url')
import * as http from "http";
const https = require('https')
const fs = require('fs')
const path = require('path')

export const debuglog = require('util').debuglog('distbin')

export const readableToString = function (readable): Promise<string> {
  let body: string = ''
  return new Promise((resolve, reject) => {
    readable.on('error', reject)
    readable.on('data', (chunk) => {
      body += chunk
      return body
    })
    readable.on('end', () => resolve(body))
  })
}

export const requestUrl = (req) => `http://${req.headers.host}${req.url}`

// given a map of strings/regexes to listener factories,
// return a matching route (or undefined if no match)
export const route = (routes, req) => {
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

export const sendRequest = function (request): Promise<http.IncomingMessage> {
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
export const encodeHtmlEntities = function encodeEntities (value) {
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
export const denodeify = function denodeify (funcThatAcceptsErrback) {
  return function (...args) {
    return new Promise((resolve, reject) => {
      funcThatAcceptsErrback.apply(this, args.concat([(err, ...results) => {
        if (err) return reject(err)
        return resolve.apply(this, results)
      }]))
    })
  }.bind(this)
}

export const rdfaToJsonLd = async function rdfaToJsonLd (html) {
  return denodeify(jsonldLib.fromRDF)(html, { format: 'text/html' })
  // // use it
  // jsonldLib.fromRDF(html, {format: 'text/html'}, function(err, data) {
}

export const isProbablyAbsoluteUrl = function isProbablyAbsoluteUrl (url) {
  const absoluteUrlPattern = new RegExp('^(?:[a-z]+:)?//', 'i')
  return absoluteUrlPattern.test(url)
}

// given an http request, return a number that is the maximum number of results this client wants in this response
export const requestMaxMemberCount = function requestMaxMemberCount (req) {
  const headerMatch = req.headers.prefer ? req.headers.prefer.match(/max-member-count="(\d+)"/) : null
  if (headerMatch) return parseInt(headerMatch[1], 10)
  // check querystring
  return parseInt(url.parse(req.url, true).query['max-member-count'], 10)
}

export const createHttpOrHttpsRequest = function createHttpOrHttpsRequest (urlOrObj) {
  let parsedUrl = urlOrObj
  if (typeof urlOrObj === 'string') {
    parsedUrl = url.parse(urlOrObj)
  }
  let createRequest
  switch (parsedUrl.protocol) {
    case 'https:':
      createRequest = https.request.bind(https)
      break
    case 'http:':
      createRequest = http.request.bind(http)
      break
    default:
      const activityUrl = url.format(parsedUrl)
      throw new Error("Can't fetch activity with unsupported protocol in URL (only http, https supported): " + activityUrl)
  }
  return createRequest(urlOrObj)
}

// given a Link object or url string, return an href string that can be used to refer to it
export const linkToHref = function linkToHref (hrefOrLinkObj) {
  if (typeof hrefOrLinkObj === 'string') return hrefOrLinkObj
  if (typeof hrefOrLinkObj === 'object') return hrefOrLinkObj.href
  throw new Error('Unexpected link type: ' + typeof hrefOrLinkObj)
}

jsonldLib.documentLoader = createCustomDocumentLoader()

export const jsonld = jsonldLib.promises

function createCustomDocumentLoader () {
  // define a mapping of context URL => context doc
  var CONTEXTS = {
    'https://www.w3.org/ns/activitystreams': fs.readFileSync(path.join(__dirname, '/as2context.json'), 'utf8')
  }

  // grab the built-in node.js doc loader
  var nodeDocumentLoader = jsonldLib.documentLoaders.node()
  // or grab the XHR one: jsonldLib.documentLoaders.xhr()
  // or grab the jquery one: jsonldLib.documentLoaders.jquery()

  // change the default document loader using the callback API
  // (you can also do this using the promise-based API, return a promise instead
  // of using a callback)
  var customLoader = function (url, callback) {
    if (url in CONTEXTS) {
      return callback(
        null, {
          contextUrl: null, // this is for a context via a link header
          document: CONTEXTS[url], // this is the actual document that was loaded
          documentUrl: url // this is the actual context URL after redirects
        })
    }
    // call the underlining documentLoader using the callback API.
    nodeDocumentLoader(url, callback)
    /* Note: By default, the node.js document loader uses a callback, but
    browser-based document loaders (xhr or jquery) return promises if they
    are supported (or polyfilled) in the browser. This behavior can be
    controlled with the 'usePromise' option when constructing the document
    loader. For example: jsonldLib.documentLoaders.xhr({usePromise: false}); */
  }
  return customLoader
}
