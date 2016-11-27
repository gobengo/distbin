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

    const activityWithoutDescendants = JSON.parse(await readableToString(activityRes))
    const repliesUrl = url.resolve(activityUrl, activityWithoutDescendants.replies)
    const descendants = await fetchDescendants(repliesUrl)

    const activity = Object.assign(activityWithoutDescendants, {
      replies: descendants
    })

    const ancestors = await fetchReplyAncestors(activity)

    async function fetchDescendants(repliesUrl) {
      const repliesCollection = JSON.parse(await readableToString(await sendRequest(http.get(repliesUrl))))
      if (repliesCollection.totalItems <= 0) return repliesCollection
      repliesCollection.items = await Promise.all(repliesCollection.items.map(async function(activity) {
        // activity with resolved .replies collection
        return Object.assign(activity, {
          replies: await fetchDescendants(url.resolve(repliesUrl, activity.replies))
        })
      }))
      return repliesCollection
    }

    res.writeHead(200)
    res.end(`
      <!doctype html>
      <head>
        ${everyPageHead()}
        <style>
        .primary-activity main {
          font-size: 1.2em;
        }
        .primary-activity {
          margin: 2em auto;
        }
        .ancestors,
        .descendants {
          border-left: 1px solid #efefef;
          padding-left: 1em;
        }
        .activity-item main {
          margin: 1em auto; /* intended to be same as <p> to force same margins even if main content is not a p */
        }
        .activity-footer-bar a {
          text-decoration: none;
        }
        .activity-footer-bar > .action-show-raw > details,
        .activity-footer-bar > .action-show-raw > details > summary {
          display: inline
        }

        .activity-item .activity-footer-bar {
          opacity: 0.3;
        }
        .activity-item:hover .activity-footer-bar {
          opacity: inherit;
        }
        </style>
      </head>

      ${renderAncestorsSection(ancestors)}

      <div class="primary-activity">
        ${renderActivity(activity)}
      </div>
      ${renderDescendantsSection(activity.replies)} 

      <script>
      document.querySelector('.primary-activity').scrollIntoView()
      </script>
    `)
  }
}

function renderDescendant(activity) {
  return `
    <div class="activity-descendant">
      ${renderActivity(activity)}
    </div>
  `
}

// todo sandbox .content like
/*
<iframe
        sandbox
        width=100%
        height=100%
        srcdoc="${encodeHtmlEntities(activity.object.content)}"
        marginwidth="0"
        marginheight="0"
        hspace="0"
        vspace="0"
        frameborder="0"
        scrolling="no"
      ></iframe>
*/
function renderActivity(activity) {
  return `
    <article class="activity-item">
      ${activity.object.name
        ? `<h1>${activity.object.name}</h1>`
        : ''}
      <main>${encodeHtmlEntities(activity.object.content)}</main>

      ${/* TODO format published datetime, add byline */''}
      <footer>
        <div class="activity-footer-bar">
          <span>
            <a href="${activity.url}" target="_blank">${formatDate(new Date(Date.parse(activity.published)))}</a>
          </span>
          &nbsp;
          <span class="action-show-raw">
            <details>
              <summary>{&hellip;}</summary>
              <pre><code>${encodeHtmlEntities(JSON.stringify(activity, null, 2))}</code></pre>
            </details>
          </span>
        </div>
      </footer>
    </article>

  `
}

function renderActivityTree(a) {
  return `
    <div class="activity-tree">
      ${renderActivity(a)}
      ${renderDescendantsSection(a.replies)}    
    </div>
  `
}

function renderDescendantsSection(replies) {
  if (replies.totalItems === 0) return ''
  if (replies.items.length === 0) return 'uh... totalItems > 0 but no items included. #TODO'
  return `
    <div class="descendants">
      ${replies.items.map(a => `
        ${renderActivity(a)}
        ${renderDescendantsSection(a.replies)}
      `).join('')}
    </div>
  `
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
  return renderActivity(ancestor)
}

// Render an item and its ancestors for each ancestor in the array.
// This results in a nested structure conducive to indent-styling
function renderAncestorsSection (ancestors=[]) {
  if ( ! ancestors.length) return '';
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

function formatDate(date, relativeTo = new Date) {
    var diffMs = date.getTime() - relativeTo.getTime(),
        dateString;
    // Future
    if (diffMs > 0) {
        throw new Error('formatDate cannot format dates in the future')
    }
    // Just now (0s)
    if (diffMs > -1000) {
        return '1s';
    }
    // Less than 60s ago -> 5s
    if (diffMs > -60 * 1000) {
        return Math.round( -1 * diffMs / 1000) + 's';
    }
    // Less than 1h ago -> 5m
    if (diffMs > -60 * 60 * 1000) {
        return Math.round( -1 * diffMs / (1000 * 60)) + 'm';
    }
    // Less than 24h ago -> 5h
    if (diffMs > -60 * 60 * 24 * 1000) {
        return Math.round( -1 * diffMs / (1000 * 60 * 60)) + 'hrs';
    }
    // >= 24h ago -> 6 Jul
    dateString = date.getDate() + ' ' + MONTH_STRINGS[date.getMonth()];
    // or like 6 Jul 2012 if the year if its different than the relativeTo year
    if (date.getFullYear() !== relativeTo.getFullYear()) {
        dateString += ' ' + date.getFullYear();
    }
    return dateString;
};