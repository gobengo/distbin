const http = require('http')
const { encodeHtmlEntities, readableToString, sendRequest } = require('../util')
const url = require('url')

const { everyPageHead } = require('./partials')

const failedToFetch = Symbol('is this a Link that distbin failed to fetch?')

// create handler to to render a single activity to a useful page
exports.createHandler = ({apiUrl, activityId}) => {
  return async function (req, res) {
    const activityUrl = apiUrl + req.url;
    const activityRes = await sendRequest(http.request(activityUrl))
    if (activityRes.statusCode !== 200) {
      // proxy
      res.writeHead(activityRes.statusCode)
      activityRes.pipe(res, { end: true }).on('finish', res.end)
      return
    }
    const activity = JSON.parse(await readableToString(activityRes))
    const ancestors = await fetchReplyAncestors(activity)

    res.writeHead(200)
    res.end(`
      <!doctype html>
      <head>
        ${everyPageHead()}
        <style>
        .ancestors {
          border-left: 1px solid #ddd;
          padding-left: 1em;
        }
        .activity-item main {
          margin: 1em auto; /* intended to be same as <p> to force same margins even if main content is not a p */
        }
        </style>
      </head>

      ${renderAncestorsSection(ancestors)}

      <article class="activity-item">
        ${activity.object.name
          ? `<h1>${activity.object.name}</h1>`
          : ''}
        <main>${encodeHtmlEntities(activity.object.content)}</main>
        ${/* TODO format published datetime, add byline */''}
        <footer>at ${activity.published}</footer>
      </article>
      <details>
        <summary>Raw</summary>
        <pre><code>${encodeHtmlEntities(JSON.stringify(activity, null, 2))}</code></pre>
      </details>

      <hr />
      <strong>Replies</strong>
      <pre>
        ${await readableToString(await sendRequest(http.get(url.resolve(activityUrl, activity.replies))))}
      </pre>
      <p>WIP</p>
    `)
  }
}

// Render a single ancestor activity
function renderAncestor (ancestor) {
  if (ancestor[failedToFetch]) {
    // assume its a broken link
    return `
      <article class="activity-item">
        <a href="${ancestor.href}">${ancestor.href}</a> (couldn't fetch more info)
      </article>
    `
  }
  return `
    <article class="activity-item">
      <a href="${ancestor.url}">
        <main>${encodeHtmlEntities(ancestor.object.content)}</main>
      </a>
    </article>
  `
}

// Render an item and its ancestors for each ancestor in the array.
// This results in a nested structure conducive to indent-styling
function renderAncestorsSection (ancestors) {
  const [ancestor, ...olderAncestors] = ancestors;
  return `
    <div class="ancestors">
      ${olderAncestors.length ? renderAncestorsSection(olderAncestors) : ''}
      ${renderAncestor(ancestor)}
    </div>
  `
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