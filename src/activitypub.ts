import { debuglog } from './util'
import * as http from 'http'
import {IncomingMessage} from 'http'
import * as https from 'https'
import * as parseLinkHeader from 'parse-link-header'
import { rdfaToJsonLd } from './util'
import { jsonld } from './util'
import { readableToString, sendRequest, ensureArray } from './util'
import * as url from 'url'
import {UrlObject} from 'url'
import { activitySubtypes, isASLink, isASObject, ASValue } from './activitystreams/types'
import { ASJsonLdProfileContentType } from './activitystreams'
import {Activity, ASObject, Extendable, JSONLD, LDValue, isActivity} from './types'

exports.publicCollectionId = 'https://www.w3.org/ns/activitystreams#Public'

// Given an AS2 Object, return whether it appears to be an "subtype of Activity"
// as required for https://w3c.github.io/activitypub/#object-without-create
// #TODO - What if it's an extension activity that describes itself via
//   rdfs as a subtype of Activity?
exports.as2ObjectIsActivity = (obj:ASObject) => {
  return ensureArray(obj.type).some((t) => activitySubtypes.includes(t))
}

export const getASId = (o: LDValue<ASObject>) => {
  if (typeof o === 'string') return o
  if (typeof o === 'object') return o.id
  o as never
}

const flattenAnyArrays = <T=any> (arr: Array<T|T[]>): T[] => {
  const flattened: T[] = arr.reduce<T[]>((all, o): T[] => {
    if (o instanceof Array) return all.concat(o)
    return all.concat([o])
  }, [])
  return flattened
}

export const activityAudience = (activity: ASObject): ASValue[] => {
  /* Clients SHOULD look at any objects attached to the new Activity via the object, target, inReplyTo and/or tag fields,
  retrieve their actor or attributedTo properties, and MAY also retrieve their addressing properties, and add these
  to the to or cc fields of the new Activity being created. */
  const related: ASValue[] = flattenAnyArrays([
    isActivity(activity) && activity.object,
    isActivity(activity) && activity.target,
    activity.inReplyTo,
    activity.tag
  ]).filter(Boolean)
  isASObject
  isActivity
  const relatedCreators : ASValue[] = flattenAnyArrays(related.map(objectProvenanceAudience))
    .filter(Boolean)
  const relatedAudience: ASValue[] = flattenAnyArrays(related.map(o => isASObject(o) && targetedAudience(o)))
    .filter(Boolean)
    
  const targets: ASValue[] = [...relatedCreators, ...relatedAudience]
  return targets
}

const objectProvenanceAudience = (o: ASObject): ASValue[] => {
  const actor = isActivity(o) && o.actor
  const attributedTo = isASObject(o) && o.attributedTo
  return [actor, attributedTo].filter(Boolean)  
}

export const targetedAudience = (object:ASObject|Activity) => {
  const targeted = flattenAnyArrays([object.to, object.bto, object.cc, object.bcc]).filter(Boolean)
  const deduped = Array.from(new Set([].concat(targeted)))
  return deduped  
}

export const objectTargets = (activity:ASObject, recursionLimit: number): ASValue[] => {
  const audience = [...activityAudience(activity),
                    ...objectProvenanceAudience(activity),
                    ...targetedAudience(activity)]
  const recursedAudience = recursionLimit
    ? flattenAnyArrays(audience.filter(o => isASObject(o))
                               .map((o: ASObject) => objectTargets(o, recursionLimit - 1)))
    : []
  // debuglog('recursionLimit', recursionLimit, activity, { audience, recursedAudience })
  const targets = [...audience, ...recursedAudience]
  const deduped = Array.from(new Set(targets))
  return deduped
}


// Create a headers map for http.request() incl. any specced requirements for ActivityPub Client requests
exports.clientHeaders = (headers = {}) => {
  const requirements = {
    // The client MUST specify an Accept header with the application/ld+json; profile="https://www.w3.org/ns/activitystreams" media type in order to retrieve the activity.
    //  #critique: This is weird because AS2's official mimetype is application/activity+json, and the ld+json + profile is only a SHOULD, but in ActivityPub this is switched
    accept: `${ASJsonLdProfileContentType}"`
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
  switch (options.protocol) {
    case 'https:':
      return https.request(urlOrOptions)
    case 'http:':
      return http.request(urlOrOptions)
    default:
      throw new Error(`cannot create request for protocol ${options.protocol}`)
  }
}

const fetchProfile = exports.fetchProfile = async (target: string) => {
  const targetProfileRequest = request(Object.assign(url.parse(target), {
    headers: {
      accept: `${ASJsonLdProfileContentType},text/html`
    }
  }))
  debuglog('fetchProfile ' + target)
  try {
    var targetProfileResponse = await sendRequest(targetProfileRequest)
  } catch (e) {
    throw new deliveryErrors.TargetRequestFailed(e.message)
  }
  debuglog(`res ${targetProfileResponse.statusCode} fetchProfile for ${target}`)

  switch (targetProfileResponse.statusCode) {
    case 200:
      // cool
      break
    default:
      throw new deliveryErrors.TargetRequestFailed(`Got unexpected status code ${targetProfileResponse.statusCode} when requesting ${target} to fetchProfile`)
  }

  return targetProfileResponse
}

export const discoverOutbox = async (target: string) => {
  const profileResponse = await fetchProfile(target)
  const outbox = url.resolve(target, await outboxFromResponse(profileResponse))
  return outbox
}

async function outboxFromResponse (res: IncomingMessage) {
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
      // #TODO be more JSON-LD aware when looking for outbox
      return targetProfile.outbox
    default:
      throw new Error(`Don't know how to parse ${contentType} to determine outbox URL`)
  }
}

// deliver an activity to a target
const deliverActivity = async function (activity: Activity, target: string, { deliverToLocalhost } : { deliverToLocalhost: Boolean }) {
  // discover inbox
  const targetProfileRequest = request(Object.assign(url.parse(target), {
    headers: {
      accept: `${ASJsonLdProfileContentType}, text/html`
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

  debuglog(`deliverActivity to target ${target}`)
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
    debuglog(`inboxFromBody got response contentType=${contentType}`)
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
      case 'application/ld+json':
        case 'application/ld+json':
        const obj = JSON.parse(body)
        const compacted = await jsonld.compact(obj, {
          '@context': [
            'https://www.w3.org/ns/activitystreams',
            {
              'distbin:inbox': {
                '@id': 'ldp:inbox',
                '@container': '@set'
              }
            }
          ]
        })
        const compactedInbox = (compacted['distbin:inbox'] || []).map((o: {id: string}) => typeof o === 'object' ? o.id : o)
        inbox = compactedInbox.length ? compactedInbox : obj.inbox
        if (!inbox || !inbox.length) {
          throw new Error('Could not determine ActivityPub inbox from ${contentType} response')
        }
        if (inbox.length > 1) {
          debuglog('Got multiple inboxes. Just using first')
        }
        inbox = inbox[0]
        return inbox
      default:
        throw new Error(`Don't know how to parse ${contentType} to determine inbox URL`)
    }
  }

  if (!inbox) throw new deliveryErrors.InboxDiscoveryFailed('No .inbox found for target ' + target)

  // post to inbox
  const parsedInboxUrl = url.parse(inbox)

  // https://w3c.github.io/activitypub/#security-localhost
  if (parsedInboxUrl.hostname === 'localhost' && ! deliverToLocalhost) {
    throw new Error('I will not deliver to localhost (protocol feature server:security-considerations:do-not-post-to-localhost)')
  }

  const deliveryRequest = request(Object.assign(parsedInboxUrl, {
    headers: {
      'content-type': 'application/ld+json; profile="https://www.w3.org/ns/activitystreams"'
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
    throw new deliveryErrors.DeliveryErrorResponse(`${deliveryResponse.statusCode} response from ${inbox}\nResponse Body:\n${deliveryResponseBody}`)
  }
  // #TODO handle retry/timeout?
  return target
}

// Given an activity, determine its targets and deliver to the inbox of each
// target
exports.targetAndDeliver = async function (activity: Activity,
                                           targets : string[] = objectTargets(activity, 0).map(getASId),
                                           deliverToLocalhost : Boolean = true) {
  let deliveries: string[] = []
  let failures: Error[] = []
  await Promise.all(
    targets
      .map((target): Promise<any> => {
      // Don't actually deliver to publicCollection URI as it is 'special'
        if (target === exports.publicCollectionId) {
          return Promise.resolve(target)
        }
        return deliverActivity(activity, target, { deliverToLocalhost })
          .then(d => deliveries.push(d))
          .catch(e => failures.push(e))
      })
  )
  if (failures.length) {
    debuglog('failures delivering ' + failures.map(e => e.stack))
    throw new deliveryErrors.SomeDeliveriesFailed('SomeDeliveriesFailed', failures)
  }
  return deliveries
}
