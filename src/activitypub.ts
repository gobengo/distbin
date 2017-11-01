import { debuglog } from './util'
import * as http from 'http'
import {IncomingMessage} from 'http'
import * as https from 'http'
import * as parseLinkHeader from 'parse-link-header'
import { rdfaToJsonLd } from './util'
import { readableToString, sendRequest, ensureArray } from './util'
import * as url from 'url'
import {UrlObject} from 'url'
import {Activity, ASObject, Extendable, JSONLD} from './types'

exports.publicCollectionId = 'https://www.w3.org/ns/activitystreams#Public'

// Given an AS2 Object, return whether it appears to be an "subtype of Activity"
// as required for https://w3c.github.io/activitypub/#object-without-create
// #TODO - What if it's an extension activity that describes itself via
//   rdfs as a subtype of Activity?
exports.as2ObjectIsActivity = (obj:ASObject) => {
  // https://www.w3.org/TR/activitystreams-vocabulary/#activity-types
  const activityTypes = [
    'Accept', 'Add', 'Announce', 'Arrive', 'Block', 'Create', 'Delete',
    'Dislike', 'Flag', 'Follow', 'Ignore', 'Invite', 'Join', 'Leave', 'Like',
    'Listen', 'Move', 'Offer', 'Question', 'Reject', 'Read', 'Remove',
    'TentativeReject', 'TentativeAccept', 'Travel', 'Undo', 'Update', 'View'
  ]
  return activityTypes.includes(obj.type)
}

// given an activity, return a set of targets it should be delivered to
// upon receipt in an outbox
const activityTargets = (activity:Activity) => {
  const primary = [].concat(activity.to, activity.cc, activity.bcc).filter(Boolean)
  const notification: string[] = [] // #TODO... https://github.com/w3c/activitypub/issues/161
  const targets = Array.from(new Set([].concat(primary, notification)))
  return targets
}

// Create a headers map for http.request() incl. any specced requirements for ActivityPub Client requests
exports.clientHeaders = (headers = {}) => {
  const requirements = {
    // The client MUST specify an Accept header with the application/ld+json; profile="https://www.w3.org/ns/activitystreams#" media type in order to retrieve the activity.
    //  #critique: This is weird because AS2's official mimetype is application/activity+json, and the ld+json + profile is only a SHOULD, but in ActivityPub this is switched
    accept: 'application/ld+json; profile="https://www.w3.org/ns/activitystreams#"'
  }
  if (Object.keys(headers).map(h => h.toLowerCase()).includes('accept')) {
    throw new Error(`ActivityPub Client requests can't include custom Accept header. Must always be the same value of "${requirements.accept}"`)
  }
  return Object.assign(requirements, headers)
}

const makeErrorClass = (name: string, setUp?:Function) => class extends Error {
  constructor (msg: string, ...args: any[]) {
    super(msg)
    this.message = msg
    this.name = name
    if (typeof setUp === 'function') setUp.apply(this, arguments)
  }
}

const deliveryErrors = exports.deliveryErrors = {
  // Failed to send HTTP request to a target
  TargetRequestFailed: makeErrorClass('TargetRequestFailed'),
  // Failed to parse target HTTP response as JSON
  TargetParseFailed: makeErrorClass('TargetParseFailed'),
  // Target could be fetched, but couldn't determine any .inbox
  InboxDiscoveryFailed: makeErrorClass('InboxDiscoveryFailed'),
  // Found an inbox, but failed to POST delivery to it
  DeliveryRequestFailed: makeErrorClass('DeliveryRequestFailed'),
  // Succeeded in delivering, but response was an error
  DeliveryErrorResponse: makeErrorClass('DeliveryErrorResponse'),
  // At least one delivery did not succeed. Try again later?
  SomeDeliveriesFailed: makeErrorClass('SomeDeliveriesFailed', function (msg: string, failures: Error[]) {
    this.failures = failures
  })
}

const request = (urlOrOptions:string|UrlObject) => {
  const options = typeof urlOrOptions === 'string' ? url.parse(urlOrOptions) : urlOrOptions;
  const httpModule = options.protocol === 'https:' ? https : http
  return httpModule.request(urlOrOptions)
}

// deliver an activity to a target
const deliverActivity = async function (activity: Activity, target: string) {
  // discover inbox
  const targetProfileRequest = request(Object.assign(url.parse(target), {
    headers: {
      accept: 'application/ld+json; profile="https://www.w3.org/ns/activitystreams#",text/html'
    }
  }))
  debuglog('req inbox discovery ' + target)
  try {
    var targetProfileResponse = await sendRequest(targetProfileRequest)
  } catch (e) {
    throw new deliveryErrors.TargetRequestFailed(e.message)
  }
  debuglog(`res ${targetProfileResponse.statusCode} inbox discovery for ${target}`)

  switch (targetProfileResponse.statusCode) {
    case 200:
      // cool
      break
    default:
      throw new deliveryErrors.TargetRequestFailed(`Got unexpected status code ${targetProfileResponse.statusCode} when requesting ${target} to determine inbox URL`)
  }

  let inbox = inboxFromHeaders(targetProfileResponse) || await inboxFromBody(targetProfileResponse)

  function inboxFromHeaders (res: IncomingMessage) {
    let inbox
    // look in res Link header
    const linkHeaders = ensureArray(res.headers.link)
    const inboxLinks = linkHeaders
      .map(parseLinkHeader)
      .filter(Boolean)
      .map((parsed: any) => {
        return parsed['http://www.w3.org/ns/ldp#inbox']
      })
      .filter(Boolean)
    let inboxLink
    if (Array.isArray(inboxLinks)) {
      if (inboxLinks.length > 1) {
        console.warn('More than 1 LDN inbox found, but only using 1 for now', inboxLinks)
        inboxLink = inboxLinks[0]
      }
    } else {
      inboxLink = inboxLinks
    }

    if (inboxLink) {
      inbox = url.resolve(target, inboxLink.url)
    }
    return inbox
  }

  async function inboxFromBody (res: IncomingMessage) {
    const contentTypeHeaders = ensureArray(res.headers['content-type'])
    const contentType = contentTypeHeaders.map((contentTypeValue: string) => contentTypeValue.split(';')[0]).filter(Boolean)[0]
    const body = await readableToString(res)
    let inbox
    switch (contentType) {
      case 'application/json':
        try {
          var targetProfile = JSON.parse(body)
        } catch (e) {
          throw new deliveryErrors.TargetParseFailed(e.message)
        }
        // #TODO be more JSON-LD aware when looking for inbox
        inbox = url.resolve(target, targetProfile.inbox)
        return inbox
      case 'text/html':
        let ld: Extendable<JSONLD>[] = await rdfaToJsonLd(body)
        let targetSubject = ld.find((x) => x['@id'] === 'http://localhost/')
        let inboxes = targetSubject['http://www.w3.org/ns/ldp#inbox']
        if (inboxes.length > 1) {
          console.warn(`Using only first inbox, but there were ${inboxes.length}: ${inboxes}`)
        }
        inbox = inboxes[0]['@id']
        return inbox
      default:
        throw new Error(`Don't know how to parse ${contentType} to determine inbox URL`)
    }
  }

  if (!inbox) throw new deliveryErrors.InboxDiscoveryFailed('No .inbox found for target ' + target)

  // post to inbox
  const parsedInboxUrl = url.parse(inbox)
  const deliveryRequest = (parsedInboxUrl.protocol === 'https:' ? https : http).request(Object.assign(parsedInboxUrl, {
    headers: {
      'content-type': 'application/ld+json; profile="https://www.w3.org/ns/activitystreams#"'
    },
    method: 'post'
  }))
  deliveryRequest.write(JSON.stringify(activity))

  let deliveryResponse
  try {
    deliveryResponse = await sendRequest(deliveryRequest)
  } catch (e) {
    throw new deliveryErrors.DeliveryRequestFailed(e.message)
  }
  const deliveryResponseBody = await readableToString(deliveryResponse)
  debuglog(`ldn notify res ${deliveryResponse.statusCode} ${inbox} ${deliveryResponseBody.slice(0, 100)}`)
  if (deliveryResponse.statusCode >= 400 && deliveryResponse.statusCode <= 599) {
    // client or server error
    throw new deliveryErrors.DeliveryErrorResponse(`${deliveryResponse.statusCode} response from ${inbox}\n${deliveryResponseBody}`)
  }
  // #TODO handle retry/timeout?
  return target
}

// Given an activity, determine its targets and deliver to the inbox of each
// target
exports.targetAndDeliver = async function (activity: Activity, targets = activityTargets(activity)) {
  let deliveries: string[] = []
  let failures: Error[] = []
  await Promise.all(
    targets
      .map((target) => {
      // Don't actually deliver to publicCollection URI as it is 'special'
        if (target === exports.publicCollectionId) {
          return Promise.resolve(target)
        }
        return deliverActivity(activity, target)
          .then(d => deliveries.push(d))
          .catch(e => failures.push(e))
      })
  )
  if (failures.length) {
    debuglog('failures delivering ' + failures)
    throw new deliveryErrors.SomeDeliveriesFailed('SomeDeliveriesFailed', failures)
  }
  return deliveries
}
