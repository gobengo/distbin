const http = require('http')
const { encodeHtmlEntities, readableToString, sendRequest } = require('../util')
const url = require('url')

const { everyPageHead } = require('./partials')

const failedToFetch = Symbol('is this a Link that distbin failed to fetch?')

// create handler to to render a single activity to a useful page
exports.createHandler = ({apiUrl, activityId}) => {
  return async function (req, res) {
    const activityRes = await sendRequest(http.request(apiUrl + req.url))
    if (activityRes.statusCode !== 200) {
      // proxy
      res.writeHead(activityRes.statusCode)
      activityRes.pipe(res, { end: true }).on('finish', res.end)
      return
    }
    const activity = JSON.parse(await readableToString(activityRes))
    const ancestors = await fetchReplyAncestors(activity)
    const renderAncestor = (ancestor) => {
      if (ancestor[failedToFetch]) {
        // assume its a broken link
        return `
          <article>
            <a href="${ancestor.href}">${ancestor.href}</a> (couldn't fetch more info)
          </article>
        `
      }
      return `
        <article>
          <a href="${ancestor.url}">
            <main>${encodeHtmlEntities(ancestor.object.content)}</main>
          </a>
        </article>
      `
    }

    res.writeHead(200)
    res.end(`
      <!doctype html>
      <head>
        ${everyPageHead()}
      </head>

      ${ancestors.length
        ? `
          ${ancestors.reverse().map(renderAncestor).join('<hr />')}
          <hr />
          `
        : ''
      }


      <article>
        ${activity.object.name
          ? `<h1>${activity.object.name}</h1>`
          : ''}
        <main>${encodeHtmlEntities(activity.object.content)}</main>
        ${/* TODO format published datetime, add byline */''}
        <p>at ${activity.published}</p>
      </article>
      <details>
        <summary>Raw</summary>
        <pre><code>${encodeHtmlEntities(JSON.stringify(activity, null, 2))}</code></pre>
      </details>
    `)
  }
}

async function fetchReplyAncestors(activity) {
  const parentUrl = activity.object.inReplyTo
  if ( ! parentUrl) {
    return []
  }
  let parent
  try {
    parent = await fetchActivity(parentUrl)
  } catch (err) {
    switch (err.code) {
      case 'ECONNREFUSED':
        // don't recurse since we can't fetch the parent
        return [{
          type: 'Link',
          href: parentUrl,
          [failedToFetch]: true,
        }]
    }
    throw err
  }
  // #TODO support limiting at some reasonable amount of depth to avoid too big
  return [parent].concat(await fetchReplyAncestors(parent))
}

async function fetchActivity(activityUrl) {
  const activityResponse = await sendRequest(http.request(Object.assign(url.parse(activityUrl), {
    headers: {
      accept: 'application/ld+json; profile="https://www.w3.org/ns/activitystreams#'
    }
  })))

  return JSON.parse(await readableToString(activityResponse))
}