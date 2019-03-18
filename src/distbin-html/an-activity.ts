import { ASJsonLdProfileContentType, isASLink } from "../activitystreams"
import { Activity, ASLink, ASObject, Collection,
         isActivity, LDObject, Place } from "../types"
import { HasLinkPrefetchResult, LinkPrefetchFailure, LinkPrefetchResult,
         LinkPrefetchSuccess} from "../types"
import { createHttpOrHttpsRequest } from "../util"
import { debuglog, first } from "../util"
import { encodeHtmlEntities } from "../util"
import { isProbablyAbsoluteUrl } from "../util"
import { readableToString } from "../util"
import { sendRequest } from "../util"
import { ensureArray } from "../util"
import { flatten } from "../util"
import { distbinBodyTemplate } from "./partials"
import { everyPageHead } from "./partials"
import { sanitize } from "./sanitize"
import { internalUrlRewriter } from "./url-rewriter"

import { IncomingMessage, ServerResponse } from "http"
import * as marked from "marked"
import * as url from "url"

import { createLogger } from "../logger"
const logger = createLogger(__filename)

const failedToFetch = Symbol("is this a Link that distbin failed to fetch?")

// create handler to to render a single activity to a useful page
export const createHandler = ({apiUrl, activityId, externalUrl, internalUrl}:
  {apiUrl: string, activityId: string, externalUrl: string, internalUrl: string}) => {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const activityUrl = apiUrl + req.url
    const activityRes = await sendRequest(createHttpOrHttpsRequest(activityUrl))
    if (activityRes.statusCode !== 200) {
      // proxy
      res.writeHead(activityRes.statusCode, activityRes.headers)
      activityRes.pipe(res, { end: true }).on("finish", res.end)
      return
    }

    const incomingActivity = JSON.parse(await readableToString(activityRes))
    const activityWithoutDescendants = activityWithUrlsRelativeTo(incomingActivity, externalUrl)
    const repliesUrls = ensureArray(activityWithoutDescendants.replies)
      .map((repliesUrl: string) => {
        return url.resolve(activityUrl, repliesUrl)
      })
    const descendants = flatten(await Promise.all(
      repliesUrls.map((repliesUrl) => fetchDescendants(repliesUrl, internalUrlRewriter(internalUrl, externalUrl))),
    ))
    const activity = Object.assign(activityWithoutDescendants, {
      replies: descendants,
    })
    const ancestors = await fetchReplyAncestors(externalUrl, activity, internalUrlRewriter(internalUrl, externalUrl))

    async function fetchDescendants(repliesUrl: string, urlRewriter: (u: string) => string) {
      const repliesCollectionResponse = await sendRequest(createHttpOrHttpsRequest(urlRewriter(repliesUrl)))
      if (repliesCollectionResponse.statusCode !== 200) {
        return {
          name: `Failed to fetch replies at ${repliesUrl} (code ${repliesCollectionResponse.statusCode})`,
        }
      }
      const repliesCollection = JSON.parse(await readableToString(repliesCollectionResponse))

      if (repliesCollection.totalItems <= 0) { return repliesCollection }
      repliesCollection.items = await Promise.all(repliesCollection.items.map(async (replyActivity: Activity) => {
        // activity with resolved .replies collection
        const withAbsoluteUrls = activityWithUrlsRelativeTo(replyActivity, repliesUrl)
        const { replies } = withAbsoluteUrls
        const nextRepliesUrl = (typeof replies === "string")
          ? replies
          : (Array.isArray(replies) && replies.length)
            && replies[0]
        return Object.assign(withAbsoluteUrls, {
          replies: (typeof nextRepliesUrl === "string")
            ? await fetchDescendants(nextRepliesUrl, urlRewriter)
            : replies,
        })
      }))

      return repliesCollection
    }

    res.writeHead(200, {
      "content-type": "text/html",
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
        ${createActivityCss()}
        </style>
      </head>

      ${distbinBodyTemplate({ externalUrl })(`
        ${renderAncestorsSection(ancestors, externalUrl)}

        <div class="primary-activity">
          ${renderObject(activity, externalUrl)}
        </div>
        ${renderDescendantsSection(ensureArray(activity.replies)[0], externalUrl)}

        <script>
        (function () {
          var primary = document.querySelector('.primary-activity');
          if ( ! isElementInViewport(primary)) {
            primary.classList.add('at-least-viewport-height')
            primary.scrollIntoView()
          }

          // offset
          // document.body.scrollTop = document.body.scrollTop - 2 * parseFloat(getComputedStyle(primary).fontSize)

          // https://bit.ly/1jThLtH
          function isElementInViewport (el) {
            var rect = el.getBoundingClientRect();
            return (
                rect.top >= 0 &&
                rect.left >= 0 &&
                rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
                rect.right <= (window.innerWidth || document.documentElement.clientWidth)
            );
          }
        }());
        </script>
      `)}
    `)
  }
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
export const renderActivity = (activity: Activity, externalUrl: string) => renderObject(activity, externalUrl)

type URLString = string
const href = (linkable: URLString|ASLink|ASObject): string => {
  if (typeof linkable === "string") { return linkable; }
  if (isASLink(linkable)) { return linkable.href }
  if (linkable.url) { return href(first(linkable.url)) }
  return
}

export function renderObject(activity: ASObject, externalUrl: string) {
  const object = (isActivity(activity) && typeof activity.object === "object") ? activity.object : activity
  const published = object.published
  const generator = formatGenerator(activity)
  const location = formatLocation(activity)
  const attributedTo = formatAttributedTo(activity)
  const tags = formatTags(activity)
  const activityUrl = ensureArray(activity.url)[0]
  const activityObject = isActivity(activity) &&
    ensureArray(activity.object).filter((o: ASObject|string) => typeof o === "object")[0]
  const mainHtml = (() => {
    try {
      const maybeMarkdown =
        activity.content
          ? activity.content
        : activityObject && (typeof activityObject === "object") && activityObject.content
          ? activityObject.content
        : activity.name || activity.url
          ? `<a href="${activity.url}">${activity.url}</a>`
        : activity.id
          ? `<a href="${activity.id}">${activity.id}</a>`
        : ""
      const html = marked(maybeMarkdown)
      const sanitized = sanitize(html);
      return sanitized;
    } catch (error) {
      logger.error("Error rendering activity object.", activity, error)
      return `<p>distbin failed to render this</p>`
    }
  })()
  return `
    <article class="activity-item">
      <header>
        ${attributedTo || ""}
      </header>
      ${
  activity.name
    ? `<h1>${activity.name}</h1>`
    : activityObject && (typeof activityObject === "object") && activityObject.name
      ? `<h1>${activityObject.name}</h1>`
      : ""
}
      <main>${mainHtml}</main>

      ${
  tags
    ? `
          <div class="activity-tags">
            ${tags}
          </div>
        `
    : ""
}

      <div class="activity-attachments">
        ${ensureArray(isActivity(activity) && (typeof activity.object === "object") && activity.object.attachment)
          .map((attachment: ASObject & HasLinkPrefetchResult) => {
            if (!attachment) { return "" }
            switch (attachment.type) {
              case "Link":
                const prefetch: LinkPrefetchResult = attachment["https://distbin.com/ns/linkPrefetch"]
                if (prefetch.type === "LinkPrefetchFailure") {
                  return
                }
                const linkPrefetchSuccess = prefetch as LinkPrefetchSuccess
                if (!(linkPrefetchSuccess && linkPrefetchSuccess.supportedMediaTypes)) { return "" }
                if (linkPrefetchSuccess.supportedMediaTypes.find((m: string) => m.startsWith("image/"))) {
                  return linkPrefetchSuccess.link && `
                    <img src="${linkPrefetchSuccess.link.href}" />
                  `
                }
                break
              default:
                break
            }
            return ""
          })
          .filter(Boolean)
          .join("\n")
        }
      </div>

      ${/* TODO add byline */""}
      <footer>
        <div class="activity-footer-bar">
          <span>
            <a href="${activityUrl && encodeHtmlEntities(href(activityUrl))}">${
  published
    ? formatDate(new Date(Date.parse(published)))
    : "permalink"
}</a>
          </span>
          &nbsp;
          <span>
            <a href="${externalUrl}?inReplyTo=${encodeHtmlEntities(href(activityUrl))}">reply</a>
          </span>
          &nbsp;
          <span class="action-show-raw">
            <details>
              <summary>{&hellip;}</summary>
              <pre><code>${encodeHtmlEntities(JSON.stringify(activity, null, 2))}</code></pre>
            </details>
          </span>
          ${
  generator
    ? `&nbsp;via ${generator}`
    : ""
}
          ${
  location
    ? `&nbsp;<span class="action-location">${location}</span>`
    : ""
}
        </div>
      </footer>
    </article>

  `
}

function formatTags(o: ASObject) {
  const tags = ensureArray(isActivity(o) && typeof o.object === "object" && o.object.tag
                           || o.tag).filter(Boolean)
  return tags.map(renderTag).filter(Boolean).join("&nbsp;")
  function renderTag(tag: ASObject) {
    const text = tag.name || tag.id || first(tag.url)
    if (!text) { return }
    const safeText = encodeHtmlEntities(text)
    const tagUrl = tag.url || tag.id || (isProbablyAbsoluteUrl(text) ? text : "")
    let rendered
    if (tagUrl) {
      rendered = `<a href="${encodeHtmlEntities(tagUrl)}" class="activity-tag">${safeText}</a>`
    } else {
      rendered = `<span class="activity-tag">${safeText}</span>`
    }
    return rendered
  }
}

function formatAttributedTo(activity: ASObject|Activity) {
  const attributedTo = activity.attributedTo
    || (isActivity(activity)) && (typeof activity.object === "object") && activity.object.attributedTo
  if (!attributedTo) { return }
  let formatted = ""
  let authorUrl
  if (typeof attributedTo === "string") {
    formatted = encodeHtmlEntities(attributedTo)
  } else if (typeof attributedTo === "object") {
    formatted = encodeHtmlEntities(attributedTo.name || first(attributedTo.url))
    authorUrl = attributedTo.url
  }
  if (authorUrl) {
    formatted = `<a rel="author" href="${encodeHtmlEntities(href(first(authorUrl)))}">${formatted}</a>`
  }
  if (!formatted) { return }
  return `
    <address class="activity-attributedTo">${formatted}</address>
  `
}

function formatLocation(activity: ASObject) {
  const location: Place = activity && activity.location
  if (!location) { return }
  let imgUrl
  let linkTo
  if (location.latitude && location.longitude) {
    imgUrl = [
      `https://maps.googleapis.com/maps/api/staticmap?`,
      `center=${location.latitude},${location.longitude}&zoom=11&size=480x300&sensor=false`,
    ].join("")
    linkTo = `https://www.openstreetmap.org/search?query=${location.latitude},${location.longitude}`
  } else if (location.name) {
    // use name as center, don't specify zoom
    imgUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${location.name}&size=480x300&sensor=false`
    linkTo = `https://www.openstreetmap.org/search?query=${location.name}`
  }
  const glyph = `
    <a class="glyph" ${location.name ? `title="${encodeHtmlEntities(location.name)}"` : ""}>
      &#127757;
    </a>
  `
  if (!imgUrl) {
    return glyph
  }
  return `
    <details>
      <summary>
        ${glyph}
      </summary>
      <ul>
        ${location.latitude ? `<li>latitude: ${location.latitude}</li>` : ""}
        ${location.longitude ? `<li>longitude: ${location.longitude}</li>` : ""}
        ${location.altitude ? `<li>altitude: ${location.altitude}${location.units || "m"}</li>` : ""}
        ${location.radius ? `<li>radius: ${location.radius}${location.units || "m"}</li>` : ""}
        ${location.accuracy ? `<li>accuracy: ${location.accuracy}%</li>` : ""}
      </ul>
      <div class="activity-location-map">
        <a href="${linkTo}" target="_blank">
          <img src="${imgUrl}" />
        </a>
      </div>
    </details>
  `
}

function formatGenerator(o: ASObject) {
  const object: ASObject = isActivity(o) && (typeof o.object === "object") && o.object
  const generator = object && object.generator
  if (!generator) { return "" }
  let generatorText
  if (typeof generator === "object") {
    if (generator.name) { generatorText = generator.name } else if (generator.id) { generatorText = generator.id }
    let generatorUrl
    if (generator.url) { generatorUrl = generator.url } else if (generator.id) { generatorUrl = generator.id }
    if (generatorUrl) {
      return `<a target="_blank" href="${generatorUrl}">${generatorText}</a>`
    }
  }
  if (generatorText) {
    return generatorText
  }
  return ""
}

export const createActivityCss = () => {
  return `
    .ancestors,
    .descendants {
      border-left: 1px solid #efefef;
      padding-left: 1em;
    }
    .activity-item main,
    .activity-item .activity-attachments,
    .activity-item .activity-attributedTo {
      margin: 1rem auto; /* intended to be same as <p> to force same margins even if main content is not a p */
    }

    .activity-item .activity-attributedTo {
      font-style: normal;
    }

    .activity-item .activity-tag {
      display: inline-block;
      padding: 0.5em;
      border: 1px solid #eee;
    }

    .activity-footer-bar {
      line-height: 1em;
    }
    .activity-footer-bar .glyph {
      vertical-align: text-bottom;
    }
    .activity-footer-bar a {
      text-decoration: none;
    }
    .activity-footer-bar details,
    .activity-footer-bar details > summary {
      display: inline
    }
    .activity-footer-bar details > summary {
      cursor: pointer;
    }
    .activity-footer-bar details[open] {
      display: block;
    }
    .activity-item .activity-footer-bar,
    .activity-item .activity-footer-bar a {
      color: rgba(0, 0, 0, 0.3)
    }
    .activity-item .activity-attachments img {
      max-width: 100%;
    }
    .activity-location-map img {
      width: 100%;
    }
    .action-show-raw pre {
      color: initial
    }
  `
}

class ASObjectWithFetchedReplies extends ASObject {
  public replies: Collection<ASObjectWithFetchedReplies>
}

function renderDescendantsSection(replies: Collection<ASObjectWithFetchedReplies>, externalUrl: string) {
  let inner = ""
  if (replies.totalItems === 0) { return "" }
  if (!replies.items && replies.name) {
    inner = replies.name
  } else if (replies.items.length === 0) {
    inner = "uh... totalItems > 0 but no items included. #TODO"
  } else {
    inner = replies.items.map((a: ASObjectWithFetchedReplies) => `
      ${renderObject(a, externalUrl)}
      ${renderDescendantsSection(a.replies, externalUrl)}
    `).join("")
  }
  return `
    <div class="descendants">
      ${inner}
    </div>
  `
}

// Render a single ancestor activity
function renderAncestor(ancestor: Activity|LinkPrefetchFailure, externalUrl: string): string {
  if (ancestor.type === "LinkPrefetchFailure") {
    const linkFetchFailure = ancestor as LinkPrefetchFailure
    const linkHref = linkFetchFailure.link.href
    // assume its a broken link
    return `
      <article class="activity-item">
        <a href="${linkHref}">${linkHref}</a> (${linkFetchFailure.error || "couldn't fetch more info"})
      </article>
    `
  }
  return renderObject(ancestor, externalUrl)
}

// Render an item and its ancestors for each ancestor in the array.
// This results in a nested structure conducive to indent-styling
function renderAncestorsSection(ancestors: Array<Activity|LinkPrefetchFailure> = [], externalUrl: string): string {
  if (!ancestors.length) { return "" }
  const [ancestor, ...olderAncestors] = ancestors
  return `
    <div class="ancestors">
      ${olderAncestors.length ? renderAncestorsSection(olderAncestors, externalUrl) : ""}
      ${renderAncestor(ancestor, externalUrl)}
    </div>
  `
}

async function fetchReplyAncestors(
  baseUrl: string,
  activity: Activity,
  urlRewriter: (u: string) => string,
): Promise<Array<Activity|LinkPrefetchFailure>> {
  const inReplyTo = flatten(ensureArray(activity.object)
    .filter((o: object|string): o is object => typeof o === "object")
    .map((o: Activity) => ensureArray(o.inReplyTo)),
  )[0]
  const parentUrl = inReplyTo && url.resolve(baseUrl, href(inReplyTo))
  if (!parentUrl) {
    return []
  }
  let parent: Activity
  try {
    parent = activityWithUrlsRelativeTo(await fetchActivity(urlRewriter(parentUrl)), parentUrl)
  } catch (err) {
    switch (err.code) {
      case "ECONNREFUSED":
      case "ENOTFOUND":
      case "ENETUNREACH":
        // don't recurse since we can't fetch the parent
        return [new LinkPrefetchFailure({
          error: err,
          link: {
            href: parentUrl,
            type: "Link",
          },
        })]
    }
    throw err
  }
  // #TODO support limiting at some reasonable amount of depth to avoid too big
  const ancestorsOfParent = await fetchReplyAncestors(baseUrl, parent, urlRewriter)
  const ancestorsOrFailures = [parent, ...ancestorsOfParent]
  return ancestorsOrFailures
}

async function fetchActivity(activityUrl: string) {
  const activityUrlOrRedirect = activityUrl
  let activityResponse = await sendRequest(createHttpOrHttpsRequest(Object.assign(url.parse(activityUrlOrRedirect), {
    headers: {
      accept: `${ASJsonLdProfileContentType}, text/html`,
    },
  })))
  let redirectsLeft = 3
  /* eslint-disable no-labels */
  followRedirects: while (redirectsLeft > 0) {
    switch (activityResponse.statusCode) {
      case 301:
      case 302:
        const resolvedUrl = url.resolve(activityUrl, ensureArray(activityResponse.headers.location)[0])
        activityResponse = await sendRequest(createHttpOrHttpsRequest(Object.assign(url.parse(resolvedUrl), {
          headers: {
            accept: `${ASJsonLdProfileContentType}, text/html`,
          },
        })))
        redirectsLeft--
        continue followRedirects
      case 406:
        // unacceptable. Server doesn't speak a content-type I know.
        return {
          url: activityUrl,
        }
      case 200:
        // cool
        break followRedirects
      default:
        logger.warn("unexpected fetchActivity statusCode", activityResponse.statusCode, activityUrl)
        break followRedirects
    }
  }
  /* eslint-enable no-labels */

  const resContentType = activityResponse.headers["content-type"]
    // strip off params like charset, profile, etc
    ? ensureArray(activityResponse.headers["content-type"])[0].split(";")[0].toLowerCase()
    : undefined
  switch (resContentType) {
    case "application/json":
    case "application/activity+json":
      const a = JSON.parse(await readableToString(activityResponse))
      // ensure there is a .url value
      return Object.assign(a, {
        url: a.url || activityUrl,
      })
    case "text/html":
      // Make an activity-like thing
      return {
        url: activityUrl,
        // TODO parse <title> for .name ?
      }
    default:
      throw new Error("Unexpected fetched activity content-type: " + resContentType + " " + activityUrl + " ")
  }
}

const isRelativeUrl = (u: string) => u && ! url.parse(u).host

// given an activity with some URL values as maybe relative URLs,
// return the activity with them made absolute URLs
// TODO: use json-ld logic for this incl e.g. @base
function activityWithUrlsRelativeTo(activity: Activity, relativeTo: string): Activity {
  interface IUrlUpdates {
    replies?: typeof activity.replies,
    url?: typeof activity.url,
  }
  const updates: IUrlUpdates = {}
  const resolveUrl = (baseUrl: string, relativeUrl: string): string => {
    // prepend '.' to baseUrl can have subpath and not get dropped
    const resolved = url.resolve(baseUrl, `.${relativeUrl}`)
    return resolved;
  }
  if (activity.replies) {
    updates.replies = ((replies) => {
      if (typeof replies === "string" && isRelativeUrl(replies)) { return resolveUrl(relativeTo, replies) }
      return replies
    })(activity.replies)
  }
  if (activity.url) {
    updates.url = ensureArray(activity.url).map((u) => {
      if (typeof u === "string" && isRelativeUrl(u)) { return resolveUrl(relativeTo, u) }
      if (isASLink(u) && isRelativeUrl(u.href)) {
        return Object.assign({}, u, {
          href: resolveUrl(relativeTo, u.href),
        })
      }
      return u
    })
  }
  const withAbsoluteUrls = Object.assign({}, activity, updates)
  return withAbsoluteUrls
}

function formatDate(date: Date, relativeTo = new Date()) {
  const MONTH_STRINGS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  const diffMs = date.getTime() - relativeTo.getTime()
  let dateString
  // Future
  if (diffMs > 0) {
    throw new Error("formatDate cannot format dates in the future")
  }
  // Just now (0s)
  if (diffMs > -1000) {
    return "1s"
  }
  // Less than 60s ago -> 5s
  if (diffMs > -60 * 1000) {
    return Math.round(-1 * diffMs / 1000) + "s"
  }
  // Less than 1h ago -> 5m
  if (diffMs > -60 * 60 * 1000) {
    return Math.round(-1 * diffMs / (1000 * 60)) + "m"
  }
  // Less than 24h ago -> 5h
  if (diffMs > -60 * 60 * 24 * 1000) {
    return Math.round(-1 * diffMs / (1000 * 60 * 60)) + "hrs"
  }
  // >= 24h ago -> 6 Jul
  dateString = date.getDate() + " " + MONTH_STRINGS[date.getMonth()]
  // or like 6 Jul 2012 if the year if its different than the relativeTo year
  if (date.getFullYear() !== relativeTo.getFullYear()) {
    dateString += " " + date.getFullYear()
  }
  return dateString
};
