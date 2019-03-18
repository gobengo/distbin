import { requestUrl } from "../util"
import { distbinBodyTemplate } from "./partials"

import {IncomingMessage, ServerResponse} from "http"
import { resolve as urlResolve } from "url"

export const createHandler = ({ externalUrl }: {externalUrl: string}) => {
  return (req: IncomingMessage, res: ServerResponse) => {
    res.writeHead(200, {
      "content-type": "text/html",
    })
    res.end(distbinBodyTemplate({ externalUrl })(`
      ${createAboutMessage()}
      ${createReplySection({ externalUrl, inReplyTo: urlResolve(externalUrl, `.${req.url}`) })}
    `))
  }
}

function createReplySection({ inReplyTo, externalUrl }: {inReplyTo: string, externalUrl: string}) {
  return `
    <style>
    .distbin-reply-section header {
      margin-top: 1em;
      margin-bottom: 0.5em;
    }
    </style>
    <div class="distbin-reply-section">
      <header>
        <strong>reply</strong>
      </header>
      ${createReplyForm({ inReplyTo, externalUrl })}
    </div>
  `
}

function createReplyForm({ inReplyTo, externalUrl }: {inReplyTo: string, externalUrl: string}) {
  return `
    <style>
    .post-form textarea {
      min-height: 4em;
    }
    .post-form textarea,
    .post-form input {
      border: 0;
      font: inherit;
      padding: 0.5em;
      width:100%;
      margin-bottom: 2px; /* account for webkit :focus glow overflow */
    }
    .post-form textarea,
    .post-form input {
      width: calc(100% + 1em);
      margin-left: -0.5em;
      margin-right: -0.5em;
    }
    .post-form .post-form-label-with-input {
      margin: 1em 0;
    }
    </style>
    <form class="post-form" method="post" action="${externalUrl}">
      <input name="name" type="text" placeholder="Title (optional)"></input>
      <textarea name="content" placeholder="Share your reaction, get feedback"></textarea>
      <input name="inReplyTo" type="hidden" value="${inReplyTo}"></input>
      <input type="submit" value="post" />
    </form>
  `
}

const htmlEntities = {
  checked: "&#x2611;",
  unchecked: "&#x2610;",
}

function createAboutMessage() {
  const msg = `
      <p>
        <strong><dfn>distbin</dfn></strong> is a <strong>dist</strong>ributed
        <a href="https://en.wikipedia.org/wiki/Pastebin">paste<strong>bin</strong></a>.
        i.e. it is a service where anyone can post things on the web, and others can react
        by posting anywhere else on the web (including here).
      </p>
      <p>
        Of course, there are lots of other places you can post things. Most people communicate
        online dozens of times per day. But all these places where we post and talk and learn
        are isolated. We talk <i>in</i> them, but they don't talk to each other.
      </p>
      <p>
        Because they're isolated, we don't get much choice in how we communicate with our
        friends. We react to things wherever we find them. Your contributions to the web are
        fragmented, with no easy way to go back and remember or save them.
      </p>
      <p>
        Participating in places we don't choose also has some hidden risks. What if one of
        them goes down, gets bought, censored, surveiled, or moderated by policies you don't
        agree with?
      </p>
      <p>
        What makes distbin unique is that it supports distributed social interactions.
        For example, your reply to a post on this distbin can be hosted by another
        distbin. Or your personal blog. Or your corporate intranet. The conversation can
        be spread out across the web, instead of siloed in just one place.
      </p>
      <p>
        With a distributed social web, you could have long term ownership of the things
        you create online and the way you consume and socialize around them. distbin is
        the first tool anyone (especially non-programmers!) can use to communicate in this way.
      </p>
      <p>
        Sound interesting? Post your thoughts below to try it out or come to see the
        <a href="https://github.com/gobengo/distbin">source</a>.
      </p>
    <details>
      <summary>
        Technical Info, Planned Features, and Progress
      </summary>
      <p>
        Distributed social features are powered by relatively new (2018) web standards from
        the <a href="https://www.w3.org/wiki/Socialwg">W3C Social Web Working Group</a>,
        for example the
        <a href="https://www.w3.org/TR/activitystreams-core/">Activity Streams</a>
        vocabulary and <a href="https://www.w3.org/TR/webmention/">Webmention</a>,
        <a href="https://www.w3.org/TR/activitypub/">ActivityPub</a>, and
        <a href="https://www.w3.org/TR/ldn/">Linked Data Notifications</a> protocols.
      </p>
      <ul>
        <li>distbin-api
          <ul>
            <li><a href="https://www.w3.org/TR/activitypub/">ActivityPub</a> - <a href="/activitypub">/activitypub</a>
              <ul>
                <li>${htmlEntities.checked}
                  <a href="https://www.w3.org/TR/activitypub/#outbox">Outbox</a>
                  exists and can activities can be POSTed to it -
                  <a href="/activitypub/outbox">/activitypub/outbox</a>
                </li>
                <li>${htmlEntities.checked} Retrieval of recent items in
                <a href="https://www.w3.org/TR/activitypub/#public-addressing">Public Collection</a>
                  <ul>
                    <li>${htmlEntities.checked} Respect 'max-member-count' param in
                    <a href="https://tools.ietf.org/html/rfc7240">RFC7240</a> HTTP Prefer
                    request header (or querystring for URIs)</li>
                  </ul>
                </li>
                <li>
                  ${htmlEntities.checked} when activities are received in the outbox,
                  <a href="https://www.w3.org/TR/activitypub/#server-to-server-interactions">
                  notify/deliver</a> to other targeted servers
                </li>
                <li>
                  ${htmlEntities.checked} receive activities from other parts of the web
                  according to <a href="https://www.w3.org/TR/activitypub/#inbox-delivery">Inbox Delivery</a>
                  <ul>
                    <li>${htmlEntities.checked} Render these related activities on the target's html representation</li>
                  </ul>
                </li>
              </ul>
            </li>
            <li><a href="https://www.w3.org/TR/micropub">Micropub</a>
              <ul>
                <li>${htmlEntities.unchecked}
                  <a href="https://www.w3.org/TR/micropub/#create">Create</a> posts
                </li>
                <li>
                  ${htmlEntities.unchecked}
                  <a href="https://www.w3.org/TR/micropub/#querying">Querying</a> posts and capabilities</li>
              </ul>
            </li>
            <li>
              <a href="https://www.w3.org/TR/webmention/">Webmention</a>
              <ul>
                <li>${htmlEntities.unchecked} when posts are created that refer to other web resources,
                notify those other resources using Webmention</li>
                <li>${htmlEntities.unchecked} Receive/render webmentions when other parts of the web
                mention distbin resources</li>
              </ul>
            </li>
            <li>
              API Authorization using OAuth2. Everyone is authorized to create a post,
              even anonymously, and receive an API token to manage that post.
              If a creator wants to authenticate, e.g. for ego or attribution,
              support federated authentication using something like
              <a href="http://openid.net/connect/">OpenID Connect</a> and/or
              <a href="http://accountchooser.net/">accountchooser.net</a>. This has the property
              of delegating authentication to providers of the users' choice instead of creating
              yet another identity provider.
            </li>
          </ul>
        </li>
        <li>
          distbin-html - UI to consume and interact with posts in distbin. Hopefully a pure
          one-way dependency to distbin-api and thus swappable for other UI preferences
          <ul>
            <li>${htmlEntities.checked} This homepage</li>
            <li>${htmlEntities.checked} shareable pages for each activity</li>
            <li>${htmlEntities.unchecked} activities and Posts are different things.
              Sometimes activities create posts; sometimes not. Differentiate between how these
              are rendered (or defensibly decide not to).</li>
          </ul>
        </li>
      </ul>
    </details>
  `
  return msg
}
