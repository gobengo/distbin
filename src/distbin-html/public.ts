import { IncomingMessage, ServerResponse } from "http"
import * as querystring from "querystring"
import * as url from "url"
import { sendRequest } from "../util";
import { encodeHtmlEntities } from "../util"
import { first } from "../util"
import { readableToString } from "../util"
import { requestMaxMemberCount } from "../util"
import { createHttpOrHttpsRequest } from "../util"
import { linkToHref } from "../util"
import { createActivityCss, renderActivity } from "./an-activity"
import { distbinBodyTemplate } from "./partials"

export const createHandler = ({ apiUrl }: {apiUrl: string}) => {
  return async (req: IncomingMessage, res: ServerResponse) => {
    res.writeHead(200)
    res.end(distbinBodyTemplate(`
      ${await createPublicBody(req, {
        apiUrl,
      })}
    `))
  }
}

async function createPublicBody(req: IncomingMessage, { apiUrl }: {apiUrl: string}) {
  const limit = requestMaxMemberCount(req) || 10
  if (typeof limit !== "number") {
    throw new Error("max-member-count must be a number")
  }
  const query = url.parse(req.url, true).query
  let pageUrl = first(query.page)
  let pageMediaType = query.pageMediaType || "application/json"
  if (!pageUrl) {
    const publicCollectionUrl = apiUrl + "/activitypub/public"
    const publicCollectionRequest = createHttpOrHttpsRequest(Object.assign(url.parse(publicCollectionUrl), {
      headers: {
        Prefer: `return=representation; max-member-count="${limit}"`,
      },
    }))
    const publicCollection = JSON.parse(await readableToString(await sendRequest(publicCollectionRequest)))
    pageUrl = url.resolve(publicCollectionUrl, linkToHref(publicCollection.current))
    if (typeof publicCollection.current === "object") {
      pageMediaType = publicCollection.current.mediaType || pageMediaType
    }
  }
  const pageRequest = createHttpOrHttpsRequest(Object.assign(url.parse(pageUrl), {
    headers: {
      Accept: pageMediaType,
      Prefer: `return=representation; max-member-count="${limit}"`,
    },
  }))
  const pageResponse = await sendRequest(pageRequest)
  const page = JSON.parse(await readableToString(pageResponse))
  const nextQuery = page.next && Object.assign({}, url.parse(req.url, true).query, {
    page: page.next && url.resolve(pageUrl, linkToHref(page.next)),
  })
  const nextUrl = nextQuery && `?${querystring.stringify(nextQuery)}`
  const msg = `
    <style>
      ${createActivityCss()}
    </style>
    <h2>Public Activity</h2>
    <p>Fetched from <a href="${pageUrl}">${pageUrl}</a></p>
    <details>
      <summary>{&hellip;}</summary>
      <pre><code>${
  encodeHtmlEntities(
    // #TODO: discover /public url via HATEOAS
    JSON.stringify(page, null, 2),
  )
  // linkify values of 'url' property (quotes encode to &#34;)
    .replace(/&#34;url&#34;: &#34;(.+?)(?=&#34;)&#34;/g, '&#34;url&#34;: &#34;<a href="$1">$1</a>&#34;')
}</code></pre>
    </details>
    <div>
      ${(page.orderedItems || page.items || []).map(renderActivity).join("\n")}
    </div>
    <p>
    ${
  [
    page.startIndex
      ? `${page.startIndex} previous items`
      : "",
    nextUrl
      ? `<a href="${nextUrl}">Next Page</a>`
      : "",
  ].filter(Boolean).join(" - ")
}
    </p>
  `
  return msg
}
