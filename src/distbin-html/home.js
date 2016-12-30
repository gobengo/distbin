const http = require('http')
const { publicCollectionId } = require('../activitypub')
const querystring = require('querystring')
const url = require('url')
const { encodeHtmlEntities, readableToString, sendRequest } = require('../util')
const { everyPageHead } = require('./partials')
const { distbinBodyTemplate } = require('./partials')
const { aboveFold } = require('./partials')
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
        postToOutboxResponse = await sendRequest(postToOutboxRequest)
        // handle form submission by posting to outbox
        res.writeHead(302, { location: postToOutboxResponse.headers.location })
        res.end()
        return
        break;
      // GET renders home page will all kinds of stuff
      case 'get':
        const query = url.parse(req.url, true).query; // todo sanitize
        const safeInReplyToDefault = encodeHtmlEntities(query.inReplyTo || '');
        const safeTitleDefault = encodeHtmlEntities(query.title || '');
        res.writeHead(200)
        res.write(distbinBodyTemplate(`
          ${aboveFold(`
            <style>
            .post-form textarea {
              height: calc(100% - 10em); /* everything except the rest of this form */
              min-height: 4em;
            }
            .post-form textarea,
            .post-form input {
              border: 0;
              font: inherit;
              padding: 1em;
              width:100%;
              margin-bottom: 2px; /* account for webkit :focus glow overflow */
            }
            .post-form textarea,
            .post-form input {
              width: calc(100% + 2em);
              margin-left: -1em;
              margin-right: -1em;
            }
            .post-form .post-form-label-with-input {
              margin: 1em 0;
            }
            </style>
            <form class="post-form" method="post">
              <input name="name" type="text" placeholder="Title (optional)" value="${safeTitleDefault}"></input>
              <textarea name="content" placeholder="Write anonymously, get feedback"></textarea>
              <input name="inReplyTo" type="text" placeholder="replying to another URL? (optional)" value="${safeInReplyToDefault}"></input>
              <input type="submit" value="post" />
            </form>
            <script>
            (function () {
              var contentInput = document.querySelector('.post-form *[name=content]')
              contentInput.scrollIntoViewIfNeeded();
              contentInput.focus();
            }())
            </script>
          `)}
          <p>
          <details>
            <summary>or POST via API</summary>
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