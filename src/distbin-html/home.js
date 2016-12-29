const http = require('http')
const { publicCollectionId } = require('../activitypub')
const querystring = require('querystring')
const url = require('url')
const { encodeHtmlEntities, readableToString, sendRequest } = require('../util')
const { everyPageHead } = require('./partials')
const { distbinBodyTemplate } = require('./partials')

const { requestUrl } = require('../util')

exports.createHandler = function ({ apiUrl }) {
  return async function (req, res) {
    switch (req.method.toLowerCase()) {
      // POST is form submission to create a new post
      case 'post':
        const submission = await readableToString(req)
        // assuming application/x-www-form-urlencoded
        const { content, inReplyTo } = querystring.parse(submission)
        let note = Object.assign(
          {
            '@context': 'https://www.w3.org/ns/activitystreams',
            'type': 'Note',
            'content': content,
            'cc': [publicCollectionId, inReplyTo].filter(Boolean)
          },
          inReplyTo ? { inReplyTo } : {}
        )
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
        return
      // GET renders home page will all kinds of stuff
      case 'get':
        res.writeHead(200)
        res.write(distbinBodyTemplate(`
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
            <label>in reply to (optional)</label> <input name="inReplyTo" type="text" placeholder="URL"></input>
            <textarea name="content"></textarea>
            <input type="submit" value="post" />
          </form>
          <p>
            In addition to using the above form, you can create posts via the ActivityPub API:
            <details>
              <pre>${encodeHtmlEntities(`
curl -XPOST "${requestUrl(req)}activitypub/outbox" -d @- <<EOF
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Note",
  "content": "This is a note",
  "published": "2015-02-10T15:04:55Z",
  "cc": ["${publicCollectionId}"]
}
EOF`)}
              </pre>
            </details>
          </p>
        `))
        res.end()
        return
    }
  }
}

// function createMoreInfo(req, apiUrl) {
//   return `
//     <h2>More Info/Links</h2>
//     <p>
//       This URL as application/json (<code>curl -H "Accept: application/json" ${requestUrl(req)}</code>)
//     </p>
//     <pre>${
//       encodeHtmlEntities(
//         await readableToString(
//           await sendRequest(
//             http.request(apiUrl)
//           )
//         )
//       )
//     }</pre>
//   `
// }