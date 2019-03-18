import { IncomingMessage } from "http";
import * as http from "http";
import * as https from "https";
import { get } from "lodash";
import * as parseLinkHeader from "parse-link-header";
import * as url from "url";
import { UrlObject } from "url";
import { ASJsonLdProfileContentType } from "./activitystreams";
import {
  activitySubtypes,
  ASValue,
  isASLink,
  isASObject,
} from "./activitystreams/types";
import {
  Activity,
  ASObject,
  Extendable,
  isActivity,
  JSONLD,
  LDValue,
} from "./types";
import { jsonld } from "./util";
import { debuglog, flatten } from "./util";
import { request } from "./util";
import { rdfaToJsonLd } from "./util";
import {
  ensureArray,
  followRedirects,
  jsonldAppend,
  makeErrorClass,
  readableToString,
  sendRequest,
} from "./util";

import fetch from "node-fetch";
import { createLogger } from "../src/logger";
const logger = createLogger("activitypub");

export const publicCollectionId =
  "https://www.w3.org/ns/activitystreams#Public";

// Given an AS2 Object, return whether it appears to be an "subtype of Activity"
// as required for https://w3c.github.io/activitypub/#object-without-create
// #TODO - What if it's an extension activity that describes itself via
//   rdfs as a subtype of Activity?
export const as2ObjectIsActivity = (obj: ASObject) => {
  return ensureArray(obj.type).some(t => activitySubtypes.includes(t));
};

export const getASId = (o: LDValue<ASObject>) => {
  if (typeof o === "string") {
    return o;
  }
  if (typeof o === "object") {
    return o.id;
  }
  // tslint:disable-next-line:no-unused-expression
  o as never;
};

const flattenAnyArrays = <T = any>(arr: Array<T | T[]>): T[] => {
  const flattened: T[] = arr.reduce<T[]>((all, o): T[] => {
    if (o instanceof Array) {
      return all.concat(o);
    }
    return all.concat([o]);
  }, []);
  return flattened;
};

/**
 * Get the targets of an AS Object. Those who might be interested about getting notified.
 * @param o
 * @param shouldFetch - whether to fetch related objects that are only mentioned by URL
 */
export const objectTargets = async (
  o: ASObject,
  recursionLimit: number,
  shouldFetch: boolean = false,
  urlRewriter: (u: string) => string,
): Promise<ASValue[]> => {
  logger.debug("start objectTargets", recursionLimit, o);
  const audience = [
    ...(await objectTargetsNoRecurse(o, shouldFetch, urlRewriter)),
    ...objectProvenanceAudience(o),
    ...targetedAudience(o),
  ];
  logger.debug("objectTargets got audience", audience);
  const recursedAudience = recursionLimit
    ? flattenAnyArrays(
        await Promise.all(
          audience.map(async (audienceMember: ASObject) => {
            const recursedTargets = await objectTargets(
              audienceMember,
              recursionLimit - 1,
              shouldFetch,
              urlRewriter,
            );
            return recursedTargets;
          }),
        ),
      )
    : [];
  // logger.debug('objectTargets', { audience, recursedAudience, recursionLimit, activity })
  const targets = [...audience, ...recursedAudience];
  const deduped = Array.from(new Set(targets));
  return deduped;
};

/**
 * Get the targets of a single level of an AS Object. Don't recurse (see objectTargets)
 * @param o
 * @param shouldFetch - whether to fetch related objects that are only mentioned by URL
 */
export const objectTargetsNoRecurse = async (
  o: ASObject,
  shouldFetch: boolean = false,
  urlRewriter: (u: string) => string,
  // relatedObjectTargetedAudience is a MAY in the spec.
  // And if you leave it on and start replying to long chains,
  // you'll end up having to deliver to every ancestor, which takes a long time in
  // big threads. So you might want to disable it to get a smaller result set
  {
    relatedObjectTargetedAudience = true,
  }: { relatedObjectTargetedAudience?: boolean } = {},
): Promise<ASValue[]> => {
  /* Clients SHOULD look at any objects attached to the new Activity via the object,
  target, inReplyTo and/or tag fields, retrieve their actor or attributedTo properties,
  and MAY also retrieve their addressing properties, and add these
  to the to or cc fields of the new Activity being created. */
  // logger.debug('isActivity(o)', isActivity(o), o)
  const related = flattenAnyArrays([
    isActivity(o) && o.object,
    isActivity(o) && o.target,
    // this isn't really mentioned in the spec but required to get working how I'd expect.
    isActivity(o) && o.type === "Create" && get(o, "object.inReplyTo"),
    o.inReplyTo,
    o.tag,
  ]).filter(Boolean);
  logger.debug("o.related", related);
  const relatedObjects = (await Promise.all(
    related.map(async objOrUrl => {
      if (typeof objOrUrl === "object") {
        return objOrUrl;
      }
      if (!shouldFetch) {
        return;
      }
      // fetch url to get an object
      const audienceUrl: string = objOrUrl;
      // need to fetch it by url
      logger.debug("about to fetch for audienceUrl", {
        audienceUrl,
        rewritten: urlRewriter(audienceUrl),
      });
      const res = await sendRequest(
        request(
          Object.assign(url.parse(urlRewriter(audienceUrl)), {
            headers: {
              accept: ASJsonLdProfileContentType,
            },
          }),
        ),
      );
      logger.debug("fetched audienceUrl", audienceUrl);
      if (res.statusCode !== 200) {
        logger.warn(
          "got non-200 response when fetching ${obj} as part of activityAudience()",
        );
        return;
      }
      const body = await readableToString(res);
      const resContentType = res.headers["content-type"];
      switch (resContentType) {
        case ASJsonLdProfileContentType:
        case "application/json":
          try {
            return JSON.parse(body);
          } catch (error) {
            logger.error(
              "Couldn't parse fetched response body as JSON when determining activity audience",
              { body },
              error,
            );
            return;
          }
        default:
          logger.warn(
            `Unexpected contentType=${resContentType} of response when fetching ` +
              `${audienceUrl} to determine activityAudience`,
          );
          return;
      }
    }),
  )).filter(Boolean);
  // logger.debug('o.relatedObjects', relatedObjects)

  const relatedCreators: ASValue[] = flattenAnyArrays(
    relatedObjects.map(objectProvenanceAudience),
  ).filter(Boolean);
  const relatedAudience: ASValue[] = relatedObjectTargetedAudience
    ? flattenAnyArrays(
        relatedObjects.map(ro => isASObject(ro) && targetedAudience(ro)),
      ).filter(Boolean)
    : [];

  const targets: ASValue[] = [...relatedCreators, ...relatedAudience];
  return targets;
};

/**
 * Given a resource, return a list of other resources that helped create the original one
 * @param o - AS Object to get provenance audience for
 */
const objectProvenanceAudience = (o: ASObject): ASValue[] => {
  const actor = isActivity(o) && o.actor;
  const attributedTo = isASObject(o) && o.attributedTo;
  return [actor, attributedTo].filter(Boolean);
};

/**
 * Given a resource, return a list of other resources that are explicitly targeted using audience targeting properties
 * @param o - AS Object to get targeted audience for
 */
export const targetedAudience = (object: ASObject | Activity) => {
  const targeted = flattenAnyArrays([
    object.to,
    object.bto,
    object.cc,
    object.bcc,
  ]).filter(Boolean);
  const deduped = Array.from(new Set([].concat(targeted)));
  return deduped;
};

/**
 * Given an activity, return an updated version of that activity that has been client-addressed.
 * So then you can submit the addressed activity to an outbox and make sure it's delivered to everyone who might care.
 * @param activity
 */
export const clientAddressedActivity = async (
  activity: Activity,
  recursionLimit: number,
  shouldFetch: boolean = false,
  urlRewriter: (urlToFetch: string) => string,
): Promise<Activity> => {
  const audience = await objectTargets(
    activity,
    recursionLimit,
    shouldFetch,
    urlRewriter,
  );
  const audienceIds = audience.map(getASId);
  return Object.assign({}, activity, {
    cc: Array.from(new Set(jsonldAppend(activity.cc, audienceIds))).filter(
      Boolean,
    ),
  });
};

// Create a headers map for http.request() incl. any specced requirements for ActivityPub Client requests
export const clientHeaders = (headers = {}) => {
  const requirements = {
    // The client MUST specify an Accept header with the
    // application/ld+json; profile="https://www.w3.org/ns/activitystreams" media type
    // in order to retrieve the activity.
    // #critique: This is weird because AS2's official mimetype is
    // application/activity+json, and the ld+json + profile is only a SHOULD,
    // but in ActivityPub this is switched
    accept: `${ASJsonLdProfileContentType}"`,
  };
  if (
    Object.keys(headers)
      .map(h => h.toLowerCase())
      .includes("accept")
  ) {
    throw new Error(
      `ActivityPub Client requests can't include custom Accept header. ` +
        `Must always be the same value of "${requirements.accept}"`,
    );
  }
  return Object.assign(requirements, headers);
};

const deliveryErrors = (exports.deliveryErrors = {
  // Succeeded in delivering, but response was an error
  DeliveryErrorResponse: makeErrorClass("DeliveryErrorResponse"),
  // Found an inbox, but failed to POST delivery to it
  DeliveryRequestFailed: makeErrorClass("DeliveryRequestFailed"),
  // Target could be fetched, but couldn't determine any .inbox
  InboxDiscoveryFailed: makeErrorClass("InboxDiscoveryFailed"),
  // At least one delivery did not succeed. Try again later?
  SomeDeliveriesFailed: makeErrorClass("SomeDeliveriesFailed", function(
    msg: string,
    failures: Error[],
    successes: string[],
  ) {
    this.failures = failures;
    this.successes = successes;
  }),
  // Failed to parse target HTTP response as JSON
  TargetParseFailed: makeErrorClass("TargetParseFailed"),
  // Failed to send HTTP request to a target
  TargetRequestFailed: makeErrorClass("TargetRequestFailed"),
});

const fetchProfile = (exports.fetchProfile = async (target: string) => {
  const targetProfileRequest = request(
    Object.assign(url.parse(target), {
      headers: {
        accept: `${ASJsonLdProfileContentType},text/html`,
      },
    }),
  );
  logger.debug("fetchProfile " + target);
  let targetProfileResponse;
  try {
    targetProfileResponse = await sendRequest(targetProfileRequest);
  } catch (e) {
    throw new deliveryErrors.TargetRequestFailed(e.message);
  }
  logger.debug(
    `res ${targetProfileResponse.statusCode} fetchProfile for ${target}`,
  );

  switch (targetProfileResponse.statusCode) {
    case 200:
      // cool
      break;
    default:
      throw new deliveryErrors.TargetRequestFailed(
        `Got unexpected status code ${
          targetProfileResponse.statusCode
        } when requesting ${target} to fetchProfile`,
      );
  }

  return targetProfileResponse;
});

export const discoverOutbox = async (target: string) => {
  const profileResponse = await fetchProfile(target);
  const outbox = url.resolve(target, await outboxFromResponse(profileResponse));
  return outbox;
};

async function outboxFromResponse(res: IncomingMessage) {
  const contentTypeHeaders = ensureArray(res.headers["content-type"]);
  const contentType = contentTypeHeaders
    .map((contentTypeValue: string) => contentTypeValue.split(";")[0])
    .filter(Boolean)[0];
  const body = await readableToString(res);
  switch (contentType) {
    case "application/json":
      const targetProfile = (() => {
        try {
          return JSON.parse(body);
        } catch (e) {
          throw new deliveryErrors.TargetParseFailed(e.message);
        }
      })();
      // #TODO be more JSON-LD aware when looking for outbox
      return targetProfile.outbox;
    default:
      throw new Error(
        `Don't know how to parse ${contentType} to determine outbox URL`,
      );
  }
}

// deliver an activity to a target
const deliverActivity = async (
  activity: Activity,
  target: string,
  { deliverToLocalhost }: { deliverToLocalhost: boolean },
) => {
  // discover inbox
  logger.debug("req inbox discovery " + target);
  const targetProfileResponse = await (async () => {
    try {
      return await followRedirects(
        Object.assign(url.parse(target), {
          headers: {
            accept: `${ASJsonLdProfileContentType}, text/html`,
          },
        }),
      );
    } catch (error) {
      logger.error(
        `Error delivering activity to target=${target}. ` +
          `This is normal if the target doesnt speak great ActivityPub.`,
        error,
      );
      throw new deliveryErrors.TargetRequestFailed(error.message);
    }
  })();

  logger.debug(
    `res ${targetProfileResponse.statusCode} inbox discovery for ${target}`,
  );

  switch (targetProfileResponse.statusCode) {
    case 200:
      // cool
      break;
    default:
      throw new deliveryErrors.TargetRequestFailed(
        `Got unexpected status code ${
          targetProfileResponse.statusCode
        } when requesting ` + `${target} to determine inbox URL`,
      );
  }

  logger.debug(`deliverActivity to target ${target}`);
  const body = await readableToString(targetProfileResponse);
  const contentType = ensureArray(targetProfileResponse.headers["content-type"])
    .map((contentTypeValue: string) => contentTypeValue.split(";")[0])
    .filter(Boolean)[0];
  let inbox: string =
    inboxFromHeaders(targetProfileResponse) ||
    (await inboxFromBody(body, contentType));
  if (inbox) {
    inbox = url.resolve(target, inbox);
  }
  if (!inbox) {
    throw new deliveryErrors.InboxDiscoveryFailed(
      "No .inbox found for target " + target,
    );
  }

  // post to inbox
  const parsedInboxUrl = url.parse(inbox);

  // https://w3c.github.io/activitypub/#security-localhost
  if (parsedInboxUrl.hostname === "localhost" && !deliverToLocalhost) {
    throw new Error(
      "I will not deliver to localhost (protocol feature server:security-considerations:do-not-post-to-localhost)",
    );
  }

  const deliveryRequest = request(
    Object.assign(parsedInboxUrl, {
      headers: {
        "content-type": ASJsonLdProfileContentType,
      },
      method: "post",
    }),
  );
  deliveryRequest.write(JSON.stringify(activity));

  let deliveryResponse;
  try {
    deliveryResponse = await sendRequest(deliveryRequest);
  } catch (e) {
    throw new deliveryErrors.DeliveryRequestFailed(e.message);
  }
  const deliveryResponseBody = await readableToString(deliveryResponse);
  logger.debug(
    `ldn notify res ${
      deliveryResponse.statusCode
    } ${inbox} ${deliveryResponseBody.slice(0, 100)}`,
  );
  if (
    deliveryResponse.statusCode >= 400 &&
    deliveryResponse.statusCode <= 599
  ) {
    // client or server error
    throw new deliveryErrors.DeliveryErrorResponse(
      `${
        deliveryResponse.statusCode
      } response from ${inbox}\nResponse Body:\n${deliveryResponseBody}`,
    );
  }
  // #TODO handle retry/timeout?
  return target;
};

// Given an activity, determine its targets and deliver to the inbox of each
// target
export const targetAndDeliver = async (
  activity: Activity,
  targets: string[],
  deliverToLocalhost: boolean,
  urlRewriter: (u: string) => string,
) => {
  logger.debug("start targetAndDeliver");
  targets =
    targets ||
    (await objectTargets(activity, 0, false, urlRewriter))
      .map(t => {
        const targetUrl = getASId(t);
        if (!targetUrl) {
          logger.debug(
            "Cant determine URL to deliver to for target, so skipping",
            t,
          );
        }
        return targetUrl;
      })
      .filter(Boolean);
  logger.debug("targetAndDeliver targets", targets);
  const deliveries: string[] = [];
  const failures: Error[] = [];
  await Promise.all(
    targets.map(
      (target): Promise<any> => {
        // Don't actually deliver to publicCollection URI as it is 'special'
        if (target === exports.publicCollectionId) {
          return Promise.resolve(target);
        }
        return deliverActivity(activity, urlRewriter(target), {
          deliverToLocalhost,
        })
          .then(d => deliveries.push(d))
          .catch(e => failures.push(e));
      },
    ),
  );
  logger.debug("finished targetAndDeliver", { failures, deliveries });
  if (failures.length) {
    logger.debug("failures delivering " + failures.map(e => e.stack));
    throw new deliveryErrors.SomeDeliveriesFailed(
      "SomeDeliveriesFailed",
      failures,
      deliveries,
    );
  }
  return deliveries;
};

export const inboxUrl = async (subjectUrl: string) => {
  const subjectResponse = await fetch(subjectUrl);
  const subject = await subjectResponse.json();
  const inbox = subject.inbox;
  if (!inbox) {
    return inbox;
  }
  const iurl = url.resolve(subjectUrl, inbox);
  return iurl;
};

function inboxFromHeaders(res: IncomingMessage) {
  // look in res Link header
  const linkHeaders = ensureArray(res.headers.link);
  const inboxLinks = linkHeaders
    .map(parseLinkHeader)
    .filter(Boolean)
    .map((parsed: any) => {
      return parsed["http://www.w3.org/ns/ldp#inbox"];
    })
    .filter(Boolean);
  let inboxLink;
  if (Array.isArray(inboxLinks)) {
    if (inboxLinks.length > 1) {
      logger.warn(
        "More than 1 LDN inbox found, but only using 1 for now",
        inboxLinks,
      );
      inboxLink = inboxLinks[0];
    }
  } else {
    inboxLink = inboxLinks;
  }
  return inboxLink;
}

/**
 * Determine the ActivityPub Inbox of a fetched resource
 * @param body - The fetched resource
 * @param contentType - HTTP Content Type header of fetched resource
 *
 * This will look for the following kinds of inboxes, and return the first one it finds:
 * * a 'direct' inbox
 * * an actor, which is a separate resource, that has an inbox for activities related to
 *   objects that actor is related to
 *
 * @TODO (bengo): Allow returning all inboxes we can find
 */
async function inboxFromBody(body: string, contentType: string) {
  try {
    const directInbox = await directInboxFromBody(body, contentType);
    if (directInbox) {
      return directInbox;
    }
  } catch (error) {
    logger.debug("Error looking for directInbox (Moving on).", error);
  }
  const actorInboxes = await actorInboxesFromBody(body, contentType);
  if (actorInboxes.length > 1) {
    logger.warn(
      "Got more than one actorInboxes. Only using first.",
      actorInboxes,
    );
  }
  if (actorInboxes.length) {
    return actorInboxes[0];
  }
}

/**
 * Given a resource as a string, determine the inboxes for any actors of the resource
 */
async function actorInboxesFromBody(
  body: string,
  contentType: string,
): Promise<string[]> {
  const bodyData = bodyToJsonLd(body, contentType);
  const compacted = await jsonld.compact(bodyData, {
    "@context": "https://www.w3.org/ns/activitystreams",
  });
  const actorUrls = flatten(
    ensureArray(bodyData.actor)
      .filter(Boolean)
      .map(actor => {
        if (typeof actor === "string") {
          return [actor];
        } else if (actor.url) {
          return ensureArray(actor.url);
        } else {
          logger.debug("Could not determine url from actor", { actor });
          return [];
        }
      }),
  );
  logger.debug("Actor URLs", actorUrls);
  const actorInboxes = flatten(
    await Promise.all(
      actorUrls.map(async actorUrl => {
        try {
          const res = await fetch(actorUrl, {
            headers: {
              accept: ASJsonLdProfileContentType,
            },
          });
          const actor = await res.json();
          const inbox = actor.inbox;
          logger.debug("Actor inbox", inbox);
          return ensureArray(inbox).map(inboxRelativeUrl =>
            url.resolve(actorUrl, inboxRelativeUrl),
          );
        } catch (error) {
          logger.warn("Error fetching actor to lookup inbox", error);
        }
      }),
    ),
  );
  return actorInboxes;
}

const UnexpectedContentTypeError = makeErrorClass("UnexpectedContentTypeError");

/**
 * Given a resource as a string + contentType, return a representation of it's linked data as a JSON-LD Object
 */
function bodyToJsonLd(body: string, contentType: string) {
  logger.debug("bodyToJsonLd", { contentType });
  switch (contentType) {
    case "application/json":
    case "application/ld+json":
    case "application/activity+json":
      const data = JSON.parse(body);
      return data;
    default:
      logger.warn("Unable to bodyToJsonLd due to unexpected contentType", {
        contentType,
      });
      throw new UnexpectedContentTypeError(
        `Dont know how to parse contentType=${contentType}`,
      );
  }
}

/**
 * Given a resource as a string, return it's ActivityPub inbox URL (if any)
 */
async function directInboxFromBody(body: string, contentType: string) {
  let inboxes;
  logger.debug(`inboxFromBody got response contentType=${contentType}`);
  switch (contentType) {
    case "application/json":
      const object = (() => {
        try {
          return JSON.parse(body);
        } catch (e) {
          throw new deliveryErrors.TargetParseFailed(e.message);
        }
      })();
      logger.debug("object", object);
      inboxes = ensureArray(object.inbox).filter(Boolean);
      break;
    case "text/html":
      const ld: Array<Extendable<JSONLD>> = await rdfaToJsonLd(body);
      const targetSubject = ld.find(x => x["@id"] === "http://localhost/");
      if (!targetSubject) {
        logger.debug(
          "no targetSubject so no ldb:inbox after checking text/html for ld. got ld",
          ld,
        );
        inboxes = [];
      } else {
        inboxes = targetSubject["http://www.w3.org/ns/ldp#inbox"].map(
          (i: JSONLD) => i["@id"],
        );
      }
      break;
    case "application/ld+json":
    case "application/activity+json":
      const obj = JSON.parse(body);
      const compacted = await jsonld.compact(obj, {
        "@context": [
          "https://www.w3.org/ns/activitystreams",
          {
            "distbin:inbox": {
              "@container": "@set",
              "@id": "ldp:inbox",
            },
          },
        ],
      });
      const compactedInbox = (compacted["distbin:inbox"] || []).map(
        (o: { id: string }) => (typeof o === "object" ? o.id : o),
      );
      inboxes = compactedInbox.length ? compactedInbox : ensureArray(obj.inbox);
      break;
    default:
      throw new Error(
        `Don't know how to parse ${contentType} to determine inbox URL`,
      );
  }
  if (!inboxes || !inboxes.length) {
    logger.debug(
      `Could not determine ActivityPub inbox from ${contentType} response`,
    );
    return;
  }
  if (inboxes.length > 1) {
    logger.warn(
      `Using only first inbox, but there were ${inboxes.length}: ${inboxes}`,
    );
  }
  const inbox: string = inboxes[0];
  return inbox;
}
