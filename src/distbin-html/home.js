const http = require('http')
const { publicCollectionId } = require('../activitypub')
const querystring = require('querystring')
const url = require('url')
const { encodeHtmlEntities, readableToString, sendRequest } = require('../util')
const { everyPageHead } = require('./partials')
const { distbinBodyTemplate } = require('./partials')
const { aboveFold } = require('./partials')
const { requestUrl } = require('../util')
const { isProbablyAbsoluteUrl } = require('../util')
const { createHttpOrHttpsRequest } = require('../util')

exports.createHandler = function ({ apiUrl, externalUrl }) {
  return async function (req, res) {
    switch (req.method.toLowerCase()) {
      // POST is form submission to create a new post
      case 'post':
        const submission = await readableToString(req)
        // assuming application/x-www-form-urlencoded
        const formFields = querystring.parse(submission)
        const { content, inReplyTo, attachment } = formFields;
        if (attachment && ! isProbablyAbsoluteUrl(attachment)) {
          throw new Error("attachment must be a URL, but got "+attachment)
        }
        const attachmentLink = await getAttachmentLinkForUrl(attachment)

        let location;
        try {
          location = parseLocationFormFields(formFields)
        } catch (error) {
          console.error(error)
          throw new Error("Error parsing location form fields")
        }

        let note = Object.assign(
          {
            'type': 'Note',
            'content': content,
            'cc': [publicCollectionId, inReplyTo].filter(Boolean),
            generator: {
              type: 'Application',
              name: 'distbin-html',
              url: externalUrl,
              // @todo add .url of externalUrl
            },
            attachment: attachmentLink ? [attachmentLink] : undefined,
          },
          inReplyTo ? { inReplyTo } : {}
        )
        const activity = {
          '@context': 'https://www.w3.org/ns/activitystreams',
          type: 'Create',
          object: note,
          location,
        }
        // submit to outbox
        // #TODO discover outbox URL
        const postToOutboxRequest = http.request(Object.assign(url.parse(apiUrl + '/activitypub/outbox'), {
          headers: {
            'content-type': 'application/ld+json; profile="https://www.w3.org/ns/activitystreams#"'
          },
          method: 'post',
          path: '/activitypub/outbox'
        }))
        postToOutboxRequest.write(JSON.stringify(activity))
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
        const safeAttachmentUrl = encodeHtmlEntities(query.attachment || '');
        res.writeHead(200, {
          'content-type': 'text/html',
        })
        res.write(distbinBodyTemplate(`
          ${/*aboveFold*/(`
            <style>
            .post-form textarea {
              height: calc(100% - 14em - 8px); /* everything except the rest of this form */
              min-height: 4em;
            }
            .post-form textarea,
            .post-form input,
            .post-form-show-more > summary {
              border: 0;
              font: inherit;
              padding: 1em;
              margin-bottom: 2px; /* account for webkit :focus glow overflow */
            }
            .post-form-stretch {
              width: calc(100% + 2em);
              margin-left: -1em;
              margin-right: -1em;
            }
            .post-form .post-form-label-with-input {
              margin: 1em 0;
            }
            .post-form-show-more {
            }
            .post-form input[type=submit]:hover,
            .post-form summary {
              cursor: pointer;
            }
            </style>
            <form class="post-form" method="post">
              <input name="name" type="text" placeholder="Title (optional)" value="${safeTitleDefault}" class="post-form-stretch"></input>
              <textarea name="content" placeholder="Write anonymously, get feedback" class="post-form-stretch"></textarea>
              <input name="inReplyTo" type="text" placeholder="replying to another URL? (optional)" value="${safeInReplyToDefault}" class="post-form-stretch"></input>
              <details class="post-form-show-more">
                <summary class="post-form-stretch">More</summary>
                <input name="attachment" type="text" placeholder="Attachment URL (optional)" class="post-form-stretch" value="${safeAttachmentUrl}"></input>
              </details>
              <input type="submit" value="post" class="post-form-stretch" />
            </form>
            <script>
            (function () {
              var contentInput = document.querySelector('.post-form *[name=content]')
              contentInput.scrollIntoViewIfNeeded();
              contentInput.focus();
            }())
            </script>
          `)}
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

function parseLocationFormFields(formFields) {
  let location = { type: 'Place' }
  const fieldNames = [
    'location.latitude',
    'location.longitude',
    'location.altitude',
    'location.accuracy',
    'location.radius',
  ]
  fieldNames.forEach(k => {
    let fieldVal = formFields[k]
    if ( ! fieldVal) return;
    let propName = k.split('.')[1];
    location[propName] = parseFloat(fieldVal, 10);
  })
  if (Object.keys(location).length === 1) {
    // there were no location formFields
    return;
  }
  return location
}

async function getAttachmentLinkForUrl(attachment) {
  let attachmentLink = attachment && {
    type: 'Link',
    href: attachment,
  };
  if (attachment && attachmentLink) {
    // try to request the URL to figure out what kind of media type it responds with
    // then we can store a hint to future clients that render it
    let connectionError;
    let attachmentResponse;
    try {
      attachmentResponse = await sendRequest(createHttpOrHttpsRequest(Object.assign(url.parse(attachment))))            
    } catch (error) {
      connectionError = error;
      console.warn("Error prefetching attachment URL "+attachment)
      console.error(error)
    }
    if (connectionError) {
      attachmentLink['https://distbin.com/ns/linkPrefetch'] = {
        error: {
          message: connectionError.message
        }
      }
    } else if (attachmentResponse.statusCode === 200) {
      const contentType = attachmentResponse.headers['content-type']
      if (contentType) {
        attachmentLink['https://distbin.com/ns/linkPrefetch'] = {
          published: new Date().toISOString(),
          supportedMediaTypes: [contentType],
        }
      }
    } else {
      // no connection error, not 200, must be another
      attachmentLink['https://distbin.com/ns/linkPrefetch'] = {
        error: {
          status: attachmentResponse.statusCode
        }
      }
    }
  }
  return attachmentLink
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