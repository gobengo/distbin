const http = require('http')
const { publicCollectionId } = require('../activitypub')
const querystring = require('querystring')
const url = require('url')
const { encodeHtmlEntities, readableToString, sendRequest } = require('../util')

const htmlEntities = {
  checked: '&#x2611;',
  unchecked: '&#x2610;'
}
const requestUrl = (req) => `http://${req.headers.host}${req.url}`

exports.createHandler = function ({ apiUrl }) {
  return async function (req, res) {
    switch (req.method.toLowerCase()) {
      case 'get':
        res.writeHead(200)
        res.write(`
          <head>
            <style>
            html {
              font-family: Georgia, "Times New Roman", serif;
              font-size: 18px;
              line-height: 1.5em;
            }
            body {
              margin: 0 auto;
              max-width: 42em;
              padding: 2em;
            }
            pre {
              max-width: 100%;
              overflow: auto;
            }
            </style>
          </head>
          <h1>distbin</h1>
            <p>
              <dfn>distbin</dfn> is a <strong>dist</strong>ributed <a href="https://en.wikipedia.org/wiki/Pastebin">paste<strong>bin</strong></a>.
              i.e. it is a service where anyone can post documents on the web.
            </p>
            <p>
              What makes distbin unique is that it [eventually] supports distributed social interactions around these documents using candidate web standards emerging from the <a href="https://www.w3.org/wiki/Socialwg">W3C Social Web Working Group</a>, for example the <a href="https://www.w3.org/TR/activitystreams-core/">Activity Streams</a> vocabulary and <a href="https://www.w3.org/TR/webmention/">Webmention</a>, <a href="https://www.w3.org/TR/activitypub/">ActivityPub</a>, and <a href="https://www.w3.org/TR/ldn/">Linked Data Notifications</a> protocols.
            </p>
            <p>
              Status: <strong>very</strong> much toy status right now. Activities are not persisted outside of process memory. No Authorization checks exist at all.
            </p>
          <h2>Planned Features and Progress</h2>
          <details>
            <ul>
              <li>distbin-api
                <ul>
                  <li><a href="https://www.w3.org/TR/activitypub/">ActivityPub</a> - <a href="/activitypub">/activitypub</a>
                    <ul>
                      <li>${htmlEntities.checked} <a href="https://www.w3.org/TR/activitypub/#outbox">Outbox</a> exists and can activities can be POSTed to it - <a href="/activitypub/outbox">/activitypub/outbox</a></li>
                      <li>${htmlEntities.checked} Retrieval of recent items in <a href="https://www.w3.org/TR/activitypub/#public-addressing">Public Collection</a>
                        <ul>
                          <li>${htmlEntities.checked} Respect 'max-member-count' param in <a href="https://tools.ietf.org/html/rfc7240">RFC7240</a> HTTP Prefer request header (or querystring for URIs)</li>
                        </ul>
                      </li>
                      <li>${htmlEntities.unchecked} when activities are received in the outbox, <a href="https://www.w3.org/TR/activitypub/#server-to-server-interactions">notify/deliver</a> to other mentioned servers</li>
                      <li>${htmlEntities.unchecked} receive/render activities from other parts of the web according to <a href="https://www.w3.org/TR/activitypub/#inbox-delivery">Inbox Delivery</a></li> 
                    </ul>
                  </li>
                  <li><a href="https://www.w3.org/TR/micropub">Micropub</a>
                    <ul>
                      <li>${htmlEntities.unchecked} <a href="https://www.w3.org/TR/micropub/#create">Create</a> posts</li>
                      <li>${htmlEntities.unchecked} <a href="https://www.w3.org/TR/micropub/#querying">Querying</a> posts and capabilities</li>
                    </ul>
                  </li>
                  <li>
                    <a href="https://www.w3.org/TR/webmention/">Webmention</a>
                    <ul>
                      <li>${htmlEntities.unchecked} when posts are created that refer to other web resources, notify those other resources using Webmention</li>
                      <li>${htmlEntities.unchecked} Receive/render webmentions when other parts of the web mention distbin resources</li>
                    </ul>
                  </li>
                  <li>API Authorization using OAuth2. Everyone is authorized to create a post, even anonymously, and receive an API token to manage that post. If a creator wants to authenticate, e.g. for ego or attribution, support federated authentication using something like <a href="http://openid.net/connect/">OpenID Connect</a> and/or <a href="http://accountchooser.net/">accountchooser.net</a>. This has the property of delegating authentication to providers of the users' choice instead of creating yet another identity provider.</li>
                </ul>
              </li>
              <li>
                distbin-html - UI to consume and interact with posts in distbin. Hopefully a pure one-way dependency to distbin-api and thus swappable for other UI preferences
                <ul>
                  <li>${htmlEntities.checked} This homepage</li>
                  <li>${htmlEntities.unchecked} shareable pages for each created post and maybe each activity</li>
                </ul>
              </li>
            </ul>
          </details>
        `)
        // create new
        res.write(`
          <h2>Post a Note</h2>
          <p>It will be added to the Public Collection
          <style>
          .post-form textarea {
            width: 100%;
          }
          .post-form input[type=submit] {
            width: 100%;
          }
          </style>
          <form class="post-form" method="post">
            <textarea name="content"></textarea>
            <input type="submit" value="post" />
          </form>
          <p>
            In addition to using the above form, you can create posts via the ActivityPub API:
            <details>
              <pre>${encodeHtmlEntities(`
    curl -XPOST "${requestUrl(req)}activitypub/outbox" -d @- <<EOF
    {
      "@context": "https://www.w3.org/ns/activitypub",
      "type": "Note",
      "content": "This is a note",
      "published": "2015-02-10T15:04:55Z",
      "to": ["https://example.org/~john/"],
      "cc": ["https://example.com/~erik/followers"]
    }
    EOF`)}</pre>
            </details>
          </p>
        `)
        // recent
        res.write(`
          <h2>Public Activity</h2>
          <p>Fetched from <a href="/activitypub/public">/activitypub/public</a></p>
          <pre>${
            // #TODO: discover /public url via HATEOAS
            await readableToString(await sendRequest(http.request(apiUrl + '/activitypub/public')))
          }</pre>
        `)
        // show other links
        res.write(`
          <h2>More Info/Links</h2>
          <p>
            This URL as application/json (<code>curl -H "Accept: application/json" ${requestUrl(req)}</code>)
          </p>
          <pre>${
            await readableToString(await sendRequest(http.request(apiUrl)))
          }</pre>
        `)
        res.end()
        return
      case 'post':
        const submission = await readableToString(req)
        // assuming application/x-www-form-urlencoded
        const { content } = querystring.parse(submission)
        // don't allow HTML
        const safeContent = escape(content)
        // let note = {
        //   "@context": "https://www.w3.org/ns/activitystreams",
        //   "type": "Create",
        //   "object": {
        //     "type": "Note",
        //     "content": safeContent,
        //   },
        //   'cc': publicCollectionId
        // }
        let note = {
          '@context': 'https://www.w3.org/ns/activitystreams',
          'type': 'Note',
          'content': safeContent,
          'cc': publicCollectionId
        }
        // submit to outbox
        // #TODO is it more 'precise' to convert this to an activity here?
        // #TODO discover outbox URL
        const postToOutboxRequest = http.request(Object.assign(url.parse(apiUrl + '/activitypub/outbox'), {
          headers: {
            'content-type': 'application/ld+json; profile="https://www.w3.org/ns/activitystreams#"'
          },
          method: 'post',
          path: '/activitypub/outbox'
        }))
        postToOutboxRequest.write(JSON.stringify(note))
        await sendRequest(postToOutboxRequest)
        // handle form submission by posting to outbox
        res.writeHead(302, { location: req.url })
        res.end()
    }
  }
}
