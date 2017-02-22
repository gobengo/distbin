const distbin = require('../../')
const { postActivity } = require('../util')
const { listen } = require('../util')
const url = require('url')
const querystring = require('querystring')
const { readableToString } = require('../../src/util')
const { sendRequest } = require('../../src/util')
const http = require('http')
const assert = require('assert')
const sanitize = require('../../src/distbin-html/sanitize')

const distbinHtml = require('../../src/distbin-html')
let tests = module.exports;

tests['/ serves html'] = async function () {
  const dh = distbinHtml.createHandler({
    apiUrl: 'badurl',
    externalUrl: 'badurl'
  })
  const dhUrl = await listen(http.createServer(dh))
  const dhResponse = await sendRequest(http.request(Object.assign(url.parse(dhUrl), {
    headers: {
      accept: 'text/html'
    }
  })));
  assert.equal(dhResponse.statusCode, 200)
  assert.equal(dhResponse.headers['content-type'], 'text/html')
}

tests['POST / creates activities'] = async function () {
  const dbUrl = await listen(http.createServer(distbin()))
  const dh = distbinHtml.createHandler({
    apiUrl: dbUrl,
    externalUrl: 'badurl'
  })
  const dhUrl = await listen(http.createServer(dh))
  const postFormRequest = http.request(Object.assign(url.parse(dhUrl), {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded'
    }
  }))
  postFormRequest.write(querystring.stringify({
    name: 'activity name',
    content: 'lorem ipsum',
    attachment: dbUrl
  }))
  const dhResponse = await sendRequest(postFormRequest);
  assert.equal(dhResponse.statusCode, 302)
  assert(dhResponse.headers.location)
  // Ensure a generator was set
  // Note: getting from distbin, not distbin-html.
  const postedActivityUrl = url.resolve(dbUrl, dhResponse.headers.location)
  const activityResponse = await sendRequest(http.request(Object.assign(url.parse(postedActivityUrl), {
    headers: {
      accept: 'application/json'
    }
  })));
  const activity = JSON.parse(await readableToString(activityResponse))
  assert(activity.object.generator, 'distbin-html form submission sets distbin-html as the .generator')
  assert.equal(Array.isArray(activity.object.attachment), true, '.attachment is an Array')
  assert.equal(activity.object.attachment.length, 1, '.attachment[] is there and has the attachment link')
  const attachmentLink = activity.object.attachment[0]
  assert.equal(attachmentLink.href, dbUrl)
  const linkPrefetch = attachmentLink['https://distbin.com/ns/linkPrefetch']
  assert.equal(typeof linkPrefetch.published, 'string', 'linkPrefetch.published is a string')
  assert.equal(linkPrefetch.supportedMediaTypes[0], 'application/json', 'linkPrefetch.supportedMediaTypes[0] is the right media type')
}

tests['/activities/:id renders the .generator.name'] = async function () {
  const dbUrl = await listen(http.createServer(distbin()))
  const dh = distbinHtml.createHandler({
    apiUrl: dbUrl,
    externalUrl: 'badurl'
  })
  const dhUrl = await listen(http.createServer(dh))
  const postFormRequest = http.request(Object.assign(url.parse(dhUrl), {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded'
    }
  }))
  postFormRequest.write(querystring.stringify({
    name: 'activity name',
    content: 'This should have a generator.name of distbin-html',
  }))
  const dhResponse = await sendRequest(postFormRequest);
  assert.equal(dhResponse.statusCode, 302)
  assert(dhResponse.headers.location)
  // Ensure a generator was set
  const postedActivityUrl = url.resolve(dhUrl, dhResponse.headers.location)
  const activityResponse = await sendRequest(http.request(Object.assign(url.parse(postedActivityUrl), {
    headers: {
      accept: 'text/html'
    }
  })));
  const activityHtml = await readableToString(activityResponse)
  assert(sanitize.toText(activityHtml).includes('via distbin-html'), 'html response includes .generator.name')
  // todo rdfa?
}
