const { debuglog } = require('../util')
const { distbinBodyTemplate } = require('./partials')
const { encodeHtmlEntities } = require('../util')
const { everyPageHead } = require('./partials')
const http = require('http')
const https = require('https')
const { readableToString } = require('../util')
const { sanitize } = require('./sanitize')
const { sendRequest } = require('../util')
const url = require('url')

const failedToFetch = Symbol('is this a Link that distbin failed to fetch?')

// create handler to to render a single activity to a useful page
exports.createHandler = ({apiUrl, activityId, externalUrl }) => {
  return async function (req, res) {
    const activityUrl = apiUrl + req.url;
    const activityRes = await sendRequest(http.request(activityUrl))
    if (activityRes.statusCode !== 200) {
      // proxy
      res.writeHead(activityRes.statusCode, activityRes.headers)
      activityRes.pipe(res, { end: true }).on('finish', res.end)
      return
    }

    const activityWithoutDescendants = activityWithUrlsRelativeTo(JSON.parse(await readableToString(activityRes)), externalUrl)
    const repliesUrl = url.resolve(activityUrl, activityWithoutDescendants.replies)
    const descendants = await fetchDescendants(repliesUrl)

    const activity = Object.assign(activityWithoutDescendants, {
      replies: descendants
    })

    const ancestors = await fetchReplyAncestors(activity)

    async function fetchDescendants(repliesUrl) {
      const repliesCollectionResponse = await sendRequest(http.get(repliesUrl))
      if (repliesCollectionResponse.statusCode !== 200) {
        return {
          name: `Failed to fetch replies at ${repliesUrl} (code ${repliesCollectionResponse.statusCode})`
        }
      }
      const repliesCollection = JSON.parse(await readableToString(repliesCollectionResponse))
      if (repliesCollection.totalItems <= 0) return repliesCollection
      repliesCollection.items = await Promise.all(repliesCollection.items.map(async function(activity) {
        // activity with resolved .replies collection
        const withAbsoluteUrls = activityWithUrlsRelativeTo(activity, repliesUrl)
        return Object.assign(withAbsoluteUrls, {
          replies: await fetchDescendants(withAbsoluteUrls.replies),
        })
      }))
      return repliesCollection
    }

    res.writeHead(200, {
      'content-type': 'text/html'
    })
    res.end(`
      <!doctype html>
      <head>
        ${everyPageHead()}
        <style>
        .primary-activity main {
          font-size: 1.2em;
        }
        .primary-activity.at-least-viewport-height {
          min-height: calc(100vh - 5.5em);          
        }
        .primary-activity {
          margin: 1rem auto;
        }
        .ancestors,
        .descendants {
          border-left: 1px solid #efefef;
          padding-left: 1em;
        }
        .activity-item main {
          margin: 1rem auto; /* intended to be same as <p> to force same margins even if main content is not a p */
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
        </style>
      </head>

      ${distbinBodyTemplate(`
        ${renderAncestorsSection(ancestors)}

        <div class="primary-activity">
          ${renderActivity(activity)}
        </div>
        ${renderDescendantsSection(activity.replies)} 

        <script>
        (function () {
          var primary = document.querySelector('.primary-activity');
          if ( ! isElementInViewport(primary)) {
            primary.classList.add('at-least-viewport-height')
            primary.scrollIntoView()
          }

          // offset
          // document.body.scrollTop = document.body.scrollTop - 2 * parseFloat(getComputedStyle(primary).fontSize)

          // http://stackoverflow.com/questions/123999/how-to-tell-if-a-dom-element-is-visible-in-the-current-viewport/7557433#7557433
          function isElementInViewport (el) {
            var rect = el.getBoundingClientRect();
            return (
                rect.top >= 0 &&
                rect.left >= 0 &&
                rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) && /*or $(window).height() */
                rect.right <= (window.innerWidth || document.documentElement.clientWidth) /*or $(window).width() */
            );
          }
        }());
        </script>
      `)}
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
  const published =
    (activity.object && activity.object.published)
    || activity.published

  return `
    <article class="activity-item">
      ${
        activity.name
          ? `<h1>${activity.name}</h1>`
          :
        activity.object && activity.object.name
          ? `<h1>${activity.object.name}</h1>`
          : ''
      }
      <main>${
        sanitize(
          activity.content
            ? activity.content
            :
          activity.object
            ? activity.object.content
            :
          activity.name
            ||
          activity.url
            ? `<a href="${activity.url}">${activity.url}</a>`
            :
          activity.id
            ? `<a href="${activity.id}">${activity.id}</a>`
            : ''
        )
      }</main>

      ${/* TODO format published datetime, add byline */''}
      <footer>
        <div class="activity-footer-bar">
          <span>
            <a href="${encodeHtmlEntities(activity.url)}">${
              published
                ? formatDate(new Date(Date.parse(published)))
                : 'permalink'
            }</a>
          </span>
          &nbsp;
          <span>
            <a href="/?inReplyTo=${encodeHtmlEntities(activity.url)}">reply</a>
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
  let inner = '';
  if (replies.totalItems === 0) return ''
  if ( ! replies.items && replies.name) {
    inner = replies.name
  } else if (replies.items.length === 0) {
    inner = 'uh... totalItems > 0 but no items included. #TODO'
  } else {
    inner = replies.items.map(a => `
      ${renderActivity(a)}
      ${renderDescendantsSection(a.replies)}
    `).join('')
  }
  return `
    <div class="descendants">
      ${inner}
    </div>
  `
}

// Render a single ancestor activity
function renderAncestor (ancestor) {
  if (ancestor[failedToFetch]) {
    // assume its a broken link
    return `
      <article class="activity-item">
        <a href="${ancestor.href}">${ancestor.href}</a> (${
          ancestor[failedToFetch] === true
            ? "couldn't fetch more info"
            : ancestor[failedToFetch]
        })
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
  const parentUrl = activity.object && activity.object.inReplyTo
  if ( ! parentUrl) {
    return []
  }
  let parent
  try {
    parent = activityWithUrlsRelativeTo(await fetchActivity(parentUrl), parentUrl)
  } catch (err) {
    switch (err.code) {
      case 'ECONNREFUSED':
      case 'ENOTFOUND':
        // don't recurse since we can't fetch the parent
        return [{
          type: 'Link',
          href: parentUrl,
          [failedToFetch]: err.code,
        }]
    }
    throw err
  }
  // #TODO support limiting at some reasonable amount of depth to avoid too big
  return [parent].concat(await fetchReplyAncestors(parent))
}

async function fetchActivity(activityUrl) {
  const parsedUrl = url.parse(activityUrl)
  let createRequest;
  switch (parsedUrl.protocol) {
    case 'https:':
      createRequest = https.request
      break
    case 'http:':
      createRequest = http.request
      break
    default:
      throw new Error("Can't fetch activity with unsupported protocol in URL (only http, https supported): "+ activityUrl)
  }

  debuglog("req activity "+activityUrl)
  const activityResponse = await sendRequest(createRequest(Object.assign(parsedUrl, {
    headers: {
      accept: 'application/activity+json, application/ld+json; profile="https://www.w3.org/ns/activitystreams#, text/html'
    }
  })))
  debuglog(`res activity ${activityResponse.statusCode} ${activityUrl}`)

  switch (activityResponse.statusCode) {
    case 200:
      //cool
      break
    case 406:
      // unacceptable. Server doesn't speak a content-type I know.
      return {
        url: activityUrl
      }
    default:
      console.warn('unexpected fetchActivity statusCode', activityResponse.statusCode, activityUrl)
  }

  // if (activityResponse.statusCode === 500) {
  //   return {
  //     url: activityUrl,
  //     name: "500 fetching activity: " + await readableToString(activityResponse)
  //   }
  // }
  const resContentType = activityResponse.headers['content-type']
    ? activityResponse.headers['content-type'].split(';')[0].toLowerCase() // strip off params like charset, profile, etc
    : undefined
  switch (resContentType) {
    case 'application/json':
    case 'application/activity+json':
      let a = JSON.parse(await readableToString(activityResponse))
      // ensure there is a .url value
      return Object.assign(a, {
        url: a.url || activityUrl
      })
    case 'text/html':
      // Make an activity-like thing
      return {
        url: activityUrl,
        // TODO parse <title> for .name ?
      }
    default:
      throw new Error("Unexpected fetched activity content-type: " + resContentType + " " + activityUrl + " " )
  }
}

// given an activity with some URL values as maybe relative URLs,
// return the activity with them made absolute URLs
// TODO: use json-ld logic for this incl e.g. @base
function activityWithUrlsRelativeTo(activity, relativeTo) {
  const propsWithUrls = ['replies', 'url']
  const withAbsoluteUrls = Object.assign(activity, propsWithUrls.reduce((a, prop) => {
    const isRelativeUrl = u => u && ! url.parse(u).host
    if (isRelativeUrl(activity[prop]) ) {
      return Object.assign(a, {
        [prop]: url.resolve(relativeTo, activity[prop])
      })
    }
  }, {}))
  return withAbsoluteUrls;
}

function formatDate(date, relativeTo = new Date) {
    const MONTH_STRINGS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
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