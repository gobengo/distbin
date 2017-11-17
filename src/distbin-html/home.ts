const http = require('http')
import {IncomingMessage, ServerResponse} from 'http'
const { publicCollectionId } = require('../activitypub')
import { discoverOutbox } from '../activitypub'
const querystring = require('querystring')
const url = require('url')
const { encodeHtmlEntities, readableToString, sendRequest } = require('../util')
const { distbinBodyTemplate } = require('./partials')
import { requestUrl } from '../util'
const { isProbablyAbsoluteUrl } = require('../util')
const { createHttpOrHttpsRequest } = require('../util')
import { ASLink, LinkPrefetchResult, LinkPrefetchFailure, LinkPrefetchSuccess, HasLinkPrefetchResult } from '../types'
import { ASJsonLdProfileContentType } from '../activitystreams'

exports.createHandler = function ({ apiUrl, externalUrl }:{apiUrl:string,externalUrl:string}) {
  return async function (req: IncomingMessage, res:ServerResponse) {
    switch (req.method.toLowerCase()) {
      // POST is form submission to create a new post
      case 'post':
        const submission = await readableToString(req)
        // assuming application/x-www-form-urlencoded
        const formFields = querystring.parse(submission)
        const { content, inReplyTo, attachment } = formFields
        if (attachment && !isProbablyAbsoluteUrl(attachment)) {
          throw new Error('attachment must be a URL, but got ' + attachment)
        }
        const attachmentLink = await getAttachmentLinkForUrl(attachment)

        let location
        try {
          location = parseLocationFormFields(formFields)
        } catch (error) {
          console.error(error)
          throw new Error('Error parsing location form fields')
        }

        let attributedTo = <any>{}
        if (formFields['attributedTo.name']) {
          attributedTo.name = formFields['attributedTo.name']
        }
        const attributedToUrl = formFields['attributedTo.url']
        if (attributedToUrl) {
          if (!isProbablyAbsoluteUrl(attributedToUrl)) {
            throw new Error('Invalid non-URL value for attributedTo.url: ' + attributedToUrl)
          }
          attributedTo.url = attributedToUrl
        }
        if (Object.keys(attributedTo).length === 0) {
          attributedTo = undefined
        }

        let tag
        if (formFields['tag_csv']) {
          tag = formFields['tag_csv'].split(',').map((n: string) => {
            return {
              name: n.trim()
            }
          })
        }

        let note = Object.assign(
          {
            'type': 'Note',
            'content': content,
            generator: {
              type: 'Application',
              name: 'distbin-html',
              url: externalUrl
              // @todo add .url of externalUrl
            },
            attachment: attachmentLink ? [attachmentLink] : undefined,
            tag
          },
          inReplyTo ? { inReplyTo } : {}
        )
        const activity = {
          '@context': 'https://www.w3.org/ns/activitystreams',
          type: 'Create',
          object: note,
          location,
          cc: [publicCollectionId, inReplyTo].filter(Boolean),
          attributedTo
        }
        // submit to outbox
        // #TODO discover outbox URL
        const outboxUrl = await discoverOutbox(apiUrl)
        const postToOutboxRequest = http.request(Object.assign(url.parse(outboxUrl), {
          headers: {
            'content-type': ASJsonLdProfileContentType
          },
          method: 'post',
        }))
        postToOutboxRequest.write(JSON.stringify(activity))
        const postToOutboxResponse = await sendRequest(postToOutboxRequest)
        switch (postToOutboxResponse.statusCode) {
          case 201:
            const postedLocation = postToOutboxResponse.headers.location
            // handle form submission by posting to outbox
            res.writeHead(302, { location: postedLocation })
            res.end()
            break
          case 500:
            res.writeHead(500)
            postToOutboxResponse.pipe(res)
            break
          default:
            throw new Error('unexpected upstream response')
        }
        break
      // GET renders home page will all kinds of stuff
      case 'get':
        const query = url.parse(req.url, true).query // todo sanitize
        const safeInReplyToDefault = encodeHtmlEntities(query.inReplyTo || '')
        const safeTitleDefault = encodeHtmlEntities(query.title || '')
        const safeAttachmentUrl = encodeHtmlEntities(query.attachment || '')
        res.writeHead(200, {
          'content-type': 'text/html'
        })
        res.write(distbinBodyTemplate(`
          ${(`
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
            .cursor-pointer:hover {
              cursor: pointer;
            }
            </style>
            <script>
            window.addGeolocation = function (addLocationEl) {
              var currentlyInsertedEl = addLocationEl;
              var locationInputGroup = addLocationEl.closest('.post-form-geolocation-input-group')
              if ( ! locationInputGroup) {
                throw new Error("addGeolocation must be called with an element inside a .post-form-geolocation-input-group")
              }
              // show loading indicator
              var gettingLocationEl = document.createElement('span');
              gettingLocationEl.innerHTML = 'Getting Location...'
              addLocationEl.parentNode.replaceChild(gettingLocationEl, addLocationEl)
              currentlyInsertedEl = gettingLocationEl
              // ok now to request location
              navigator.geolocation.getCurrentPosition(success, failure);
              function success(position) {
                var coords= position.coords || {};
                console.log('Your position', position)
                var coordPropsToFormFields = {
                  'altitude': 'location.altitude',
                  'latitude': 'location.latitude',
                  'longitude': 'location.longitude',
                  'accuracy': 'location.radius',
                }
                var hiddenInputsToCreate = Object.keys(coordPropsToFormFields).map(function (coordProp) {
                  var coordValue = coords[coordProp]
                  if ( ! coordValue) return;
                  var formFieldName = coordPropsToFormFields[coordProp]
                  return {
                    name: formFieldName,
                    value: coordValue,
                  }
                }).filter(Boolean);
                if (coords.altitude || coords.accuracy) {
                  hiddenInputsToCreate.push({ name: 'location.units', value: 'm' })
                }
                if (coords.altitude || coords.latitude || coords.longitude) {
                  hiddenInputsToCreate.push({ name: 'location.accuracy', value: 95.0 })
                }

                // update the form with hidden fields for this info
                hiddenInputsToCreate.forEach(insertOrReplaceInput);
                
                // replace loading indicator with 'undo'
                var undoElement = createUndoElement([
                  'Clicking post will save your coordinates',
                  (coords.latitude && coords.longitude) ? (' ('+coords.latitude+', '+coords.longitude+')') : '',
                  '. Click here to undo.'
                ].join(''))
                gettingLocationEl.parentNode.replaceChild(undoElement, currentlyInsertedEl);
                currentlyInsertedEl = undoElement

                function createUndoElement(text) {
                  var undoElement = document.createElement('a');
                  undoElement.innerHTML = text;
                  undoElement.style.cursor = 'pointer';
                  undoElement.onclick = function (event) {
                    // replace with the original addLocationEl that triggered everything
                    undoElement.parentNode.replaceChild(addLocationEl, undoElement);
                    currentlyInsertedEl = addLocationEl
                  }
                  return undoElement
                }

                function insertOrReplaceInput(inputInfo) {
                  var name = inputInfo.name;
                  var value = inputInfo.value;
                  var input = document.createElement('input')
                  input.type = 'hidden';
                  input.value = value;
                  input.name = name;
                  var oldInput = locationInputGroup.querySelector('input[name="'+name+'"]')
                  if (oldInput) {
                    oldInput.parentNode.replaceChild(input, oldInput);
                  } else {
                    // insert
                    locationInputGroup.appendChild(input)
                  }
                }

              }
              function failure(error) {
                console.error("Error getting current position", error)
                var failureElement = document.createElement('a');
                failureElement.style.cursor = 'pointer';
                failureElement.innerHTML = ['Error getting geolocation', error.message].filter(Boolean).join(': ')
                failureElement.onclick = function (e) {
                  currentlyInsertedEl.parentNode.replaceChild(addLocationEl, currentlyInsertedEl);
                  currentlyInsertedEl = addLocationEl                  
                }
                currentlyInsertedEl.parentNode.replaceChild(failureElement, currentlyInsertedEl);
                currentlyInsertedEl = failureElement
              }
            }
            </script>
            <form class="post-form" method="post">
              <input name="name" type="text" placeholder="Title (optional)" value="${safeTitleDefault}" class="post-form-stretch"></input>
              <textarea name="content" placeholder="Write anonymously, get feedback" class="post-form-stretch"></textarea>
              <input name="inReplyTo" type="text" placeholder="replying to another URL? (optional)" value="${safeInReplyToDefault}" class="post-form-stretch"></input>
              <details class="post-form-show-more">
                <summary class="post-form-stretch">More</summary>
                <input name="attributedTo.name" type="text" placeholder="What's your name? (optional)" class="post-form-stretch"></input>
                <input name="attributedTo.url" type="text" placeholder="What's your URL? (optional)" class="post-form-stretch"></input>
                <input name="attachment" type="text" placeholder="Attachment URL (optional)" class="post-form-stretch" value="${safeAttachmentUrl}"></input>
                <input name="tag_csv" type="text" placeholder="Tags (comma-separated, optional)" class="post-form-stretch"></input>
                <div class="post-form-geolocation-input-group">
                  <input name="location.name" type="text" placeholder="Where are you?" class="post-form-stretch" />
                  <p>
                    <a onclick="addGeolocation(this)" class="cursor-pointer">Add Your Geolocation</a>
                  </p>
                </div>
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
    }
  }
}

function parseLocationFormFields (formFields: {[key:string]:string}) {
  interface Location {
    type: string
    name: string
    units: string
    altitude: number
    latitude: number
    longitude: number
    accuracy: number
    radius: number
  }
  let location = <Location>{ type: 'Place' }
  const formFieldPrefix = 'location.'
  const prefixed = (name:string) => `${formFieldPrefix}${name}`
  const floatFieldNames: (keyof Location)[] = [
    'latitude',
    'longitude',
    'altitude',
    'accuracy',
    'radius'
  ]
  if (formFields[prefixed('name')]) {
    location.name = formFields['location.name']
  }
  if (formFields[prefixed('units')]) {
    location.units = formFields['location.units']
  }
  floatFieldNames.forEach((k:keyof Location) => {
    let fieldVal = formFields[prefixed(k)]
    if (!fieldVal) return
    location[k] = parseFloat(fieldVal)
  })
  if (Object.keys(location).length === 1) {
    // there were no location formFields
    return
  }
  return location
}

async function getAttachmentLinkForUrl (attachment: string) {
  let attachmentLink: ASLink & HasLinkPrefetchResult = attachment && {
    type: 'Link',
    href: attachment
  }
  let linkPrefetchResult: LinkPrefetchResult
  if (attachment && attachmentLink) {
    // try to request the URL to figure out what kind of media type it responds with
    // then we can store a hint to future clients that render it
    let connectionError
    let attachmentResponse
    try {
      attachmentResponse = await sendRequest(createHttpOrHttpsRequest(Object.assign(url.parse(attachment))))
    } catch (error) {
      connectionError = error
      console.warn('Error prefetching attachment URL ' + attachment)
      console.error(error)
    }
    if (connectionError) {
      linkPrefetchResult = new LinkPrefetchFailure({
        error: {
          message: connectionError.message
        }
      })
    } else if (attachmentResponse.statusCode === 200) {
      const contentType = attachmentResponse.headers['content-type']
      if (contentType) {
        linkPrefetchResult = new LinkPrefetchSuccess({
          published: new Date().toISOString(),
          supportedMediaTypes: [contentType]
        })
      }
    } else {
      // no connection error, not 200, must be another
      linkPrefetchResult = new LinkPrefetchFailure({
        error: {
          status: attachmentResponse.statusCode
        }
      })
    }
    attachmentLink['https://distbin.com/ns/linkPrefetch'] = linkPrefetchResult    
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
