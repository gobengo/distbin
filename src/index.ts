import * as accepts from "accepts";
import * as assert from "assert";
import { IncomingMessage, ServerResponse } from "http";
import { v4 as createUUID } from "node-uuid";
import * as querystring from "querystring";
import * as url from "url";
import {
  as2ObjectIsActivity,
  publicCollectionId,
  targetAndDeliver,
} from "./activitypub";
import { internalUrlRewriter } from "./distbin-html/url-rewriter";
import { createLogger } from "./logger";
import {
  Activity,
  ActivityMap,
  ASObject,
  Extendable,
  JSONLD,
  LDValue,
} from "./types";
import {
  debuglog,
  ensureArray,
  first,
  flatten,
  jsonld,
  jsonldAppend,
  readableToString,
  requestMaxMemberCount,
  route,
  RoutePattern,
  RouteResponderFactory,
} from "./util";

const logger = createLogger("index");

const owlSameAs = "http://www.w3.org/2002/07/owl#sameAs";

// given a non-uri activity id, return an activity URI
const uuidUri = (uuid: string) => `urn:uuid:${uuid}`;

// Factory function for another node.http handler function that defines distbin's web logic
// (routes requests to sub-handlers with common error handling)
export default function distbin({
  // Juse use Map as default, but users should provide more bette data structures
  // #TODO: This should be size-bound e.g. LRU
  // #TODO: This should be persistent :P
  activities = new Map(),
  inbox = new Map(),
  inboxFilter = async () => true,
  // used for delivering to other inboxes so they can find this guy
  externalUrl,
  internalUrl,
  deliverToLocalhost = false,
}: {
  activities?: Map<string, object>;
  inbox?: Map<string, object>;
  inboxFilter?: (obj: ASObject) => Promise<boolean>;
  externalUrl?: string;
  internalUrl?: string;
  deliverToLocalhost?: boolean;
} = {}) {
  return (req: IncomingMessage, res: ServerResponse) => {
    externalUrl = externalUrl || `http://${req.headers.host}`;
    internalUrl = internalUrl || `http://${req.headers.host}`;
    let handler = route(
      new Map<RoutePattern, RouteResponderFactory>([
        ["/", () => index],
        ["/recent", () => recentHandler({ activities })],
        [
          "/activitypub/inbox",
          () => inboxHandler({ activities, inbox, inboxFilter, externalUrl }),
        ],
        [
          "/activitypub/outbox",
          () =>
            outboxHandler({
              activities,
              deliverToLocalhost,
              externalUrl,
              internalUrl,
            }),
        ],
        [
          "/activitypub/public/page",
          () => publicCollectionPageHandler({ activities, externalUrl }),
        ],
        [
          "/activitypub/public",
          () => publicCollectionHandler({ activities, externalUrl }),
        ],
        // /activities/{activityUuid}.{format}
        [
          /^\/activities\/([^/]+?)(\.(.+))$/,
          (activityUuid: string, _: string, format: string) =>
            activityWithExtensionHandler({
              activities,
              activityUuid,
              externalUrl,
              format,
            }),
        ],
        // /activities/{activityUuid}
        [
          /^\/activities\/([^/]+)$/,
          (activityUuid: string) =>
            activityHandler({ activities, activityUuid, externalUrl }),
        ],
        [
          /^\/activities\/([^/]+)\/replies$/,
          (activityUuid: string) =>
            activityRepliesHandler({ activities, activityUuid, externalUrl }),
        ],
      ]),
      req,
    );

    if (!handler) {
      handler = errorHandler(404);
    }
    try {
      return Promise.resolve(handler(req, res)).catch(err => {
        return errorHandler(500, err)(req, res);
      });
    } catch (err) {
      return errorHandler(500, err)(req, res);
    }
  };
}

function isHostedLocally(activityFreshFromStorage: Activity) {
  return !activityFreshFromStorage.hasOwnProperty("url");
}

type UrnUuid = string;
type ExternalUrl = string;
function externalizeActivityId(
  activityId: UrnUuid,
  externalUrl: ExternalUrl,
): ExternalUrl {
  const uuidMatch = activityId.match(/^urn:uuid:([^$]+)$/);
  if (!uuidMatch) {
    throw new Error(
      `Couldn't determine UUID for activity with id: ${activityId}`,
    );
  }
  const uuid = uuidMatch[1];
  const activityUrl = url.resolve(externalUrl, "./activities/" + uuid);
  return activityUrl;
}

// return a an extended version of provided activity with some extra metadata properties like 'inbox', 'url', 'replies'
// if 'baseUrl' opt is provided, those extra properties will be absolute URLs, not relative
const locallyHostedActivity = (
  activity: Extendable<Activity>,
  { externalUrl }: { externalUrl: string },
) => {
  if (activity.url) {
    debuglog(
      "Unexpected .url property when processing activity assumed to be locally" +
        "hosted\n" +
        JSON.stringify(activity),
    );
    throw new Error(
      "Unexpected .url property when processing activity assumed to be locally hosted",
    );
  }
  const uuidMatch = activity.id.match(/^urn:uuid:([^$]+)$/);
  if (!uuidMatch) {
    throw new Error(
      `Couldn't determine UUID for activity with id: ${activity.id}`,
    );
  }
  const uuid = uuidMatch[1];
  // Each activity should have an ActivityPub/LDN inbox where it can receive notifications.
  // TODO should this be an inbox specific to this activity?
  const inboxUrl = url.resolve(externalUrl, "./activitypub/inbox");
  const activityUrl = url.resolve(externalUrl, "./activities/" + uuid);
  const repliesUrl = url.resolve(
    externalUrl,
    "./activities/" + uuid + "/replies",
  );
  return Object.assign({}, activity, {
    [owlSameAs]: jsonldAppend(activity[owlSameAs], activity.id),
    id: externalizeActivityId(activity.id, externalUrl),
    inbox: jsonldAppend(activity.inbox, inboxUrl),
    replies: repliesUrl,
    url: jsonldAppend(activity.url, activityUrl),
    uuid,
  });
};

// get specific activity by id
function activityHandler({
  activities,
  activityUuid,
  externalUrl,
}: {
  activities: ActivityMap;
  activityUuid: string;
  externalUrl: ExternalUrl;
}) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const uri = uuidUri(activityUuid);
    const activity = await Promise.resolve(activities.get(uri));
    // #TODO: If the activity isn't addressed to the public, we should enforce access controls here.
    if (!activity) {
      res.writeHead(404);
      res.end("There is no activity " + uri);
      return;
    }
    // redirect to remote ones if we know a URL
    if (!isHostedLocally(activity)) {
      if (activity.url) {
        // see other
        res.writeHead(302, {
          location: (ensureArray(activity.url).filter(
            (u: any): u is string => typeof u === "string",
          ) as string[])[0],
        });
        res.end(activity.url);
        return;
      } else {
        res.writeHead(404);
        res.end(
          `Activity ${activityUuid} has been seen before, but it's not canonically` +
            `hosted here, and I can't seem to find it's canonical URL. Sorry.`,
        );
        return;
      }
    }
    // return the activity
    const extendedActivity = locallyHostedActivity(activity, { externalUrl });
    // woo its here
    res.writeHead(200, {
      "content-type": "application/json",
    });
    res.end(JSON.stringify(extendedActivity, null, 2));
  };
}

function activityWithExtensionHandler({
  activities,
  activityUuid,
  format,
  externalUrl,
}: {
  activities: ActivityMap;
  activityUuid: string;
  format: string;
  externalUrl: ExternalUrl;
}) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    if (format !== "json") {
      res.writeHead(404);
      res.end("Unsupported activity extension ." + format);
      return;
    }
    return activityHandler({ activities, activityUuid, externalUrl })(req, res);
  };
}

function activityRepliesHandler({
  activities,
  activityUuid,
  externalUrl,
}: {
  activities: ActivityMap;
  activityUuid: string;
  externalUrl: ExternalUrl;
}) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const uri = uuidUri(activityUuid);
    const parentActivity = await Promise.resolve(activities.get(uri));
    // #TODO: If the parentActivity isn't addressed to the public, we should enforce access controls here.
    if (!parentActivity) {
      res.writeHead(404);
      res.end("There is no activity " + uri);
      return;
    }
    const replies = Array.from(await Promise.resolve(activities.entries()))
      .filter(([key, activity]) => {
        if (!activity) {
          logger.warn("activities map has a falsy value for key", key);
          return false;
        }
        type ParentId = string;
        const filteredReplies: ASObject[] = ensureArray<any>(
          activity.object,
        ).filter(o => typeof o === "object");
        const inReplyTos = flatten(
          filteredReplies.map((object: ASObject) =>
            ensureArray<any>(object.inReplyTo).map(
              (o: any): ParentId => {
                if (typeof o === "string") {
                  return o;
                }
                if (o instanceof ASObject) {
                  return o.id;
                }
              },
            ),
          ),
        ).filter(Boolean);
        return inReplyTos.some((inReplyTo: ParentId) => {
          // TODO .inReplyTo could be a urn, http URL, something else?
          const pathNameReplyCandidate = url.parse(inReplyTo).pathname;
          const pathNameOfReply = url.parse(
            url.resolve(externalUrl, `./activities/${activityUuid}`),
          ).pathname;
          const isReply = pathNameReplyCandidate === pathNameOfReply;
          return isReply;
        });
      })
      .map(([id, replyActivity]) => {
        if (isHostedLocally(replyActivity)) {
          return locallyHostedActivity(replyActivity, { externalUrl });
        }
        return replyActivity;
      });
    res.writeHead(200, {
      "content-type": "application/json",
    });
    res.end(
      JSON.stringify(
        {
          // TODO: sort/paginate/limit this
          items: replies,
          name: "replies to item with UUID " + activityUuid,
          totalItems: replies.length,
          type: "Collection",
        },
        null,
        2,
      ),
    );
  };
}

// root route, do nothing for now but 200
function index(req: IncomingMessage, res: ServerResponse) {
  res.writeHead(200, {
    "content-type": "application/json",
  });
  res.end(
    JSON.stringify(
      {
        "@context": [
          "https://www.w3.org/ns/activitystreams",
          {
            activitypub: "https://www.w3.org/ns/activitypub#",
            inbox: "activitypub:inbox",
            outbox: "activitypub:outbox",
          },
        ],
        inbox: "/activitypub/inbox",
        name: "distbin",
        outbox: "/activitypub/outbox",
        recent: "/recent",
        summary:
          "A public service to store and retrieve posts and enable " +
          "(federated, standards-compliant) social interaction around them",
        type: "Service",
      },
      null,
      2,
    ),
  );
}

// fetch a collection of recent Activities/things
function recentHandler({ activities }: { activities: ActivityMap }) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const maxMemberCount = requestMaxMemberCount(req) || 10;
    res.writeHead(200, {
      "Access-Control-Allow-Origin": "*",
      "content-type": "application/json",
    });
    res.end(
      JSON.stringify(
        {
          "@context": "https://www.w3.org/ns/activitystreams",
          // empty string is relative URL for 'self'
          current: "",
          // Get recent 10 items
          items: [...(await Promise.resolve(activities.values()))]
            .reverse()
            .slice(-1 * maxMemberCount),
          summary: "Things that have recently been created",
          totalItems: await activities.size,
          type: "OrderedCollection",
        },
        null,
        2,
      ),
    );
  };
}

// route for ActivityPub Inbox
// https://w3c.github.io/activitypub/#inbox
function inboxHandler({
  activities,
  externalUrl,
  inbox,
  inboxFilter,
}: {
  activities: ActivityMap;
  externalUrl: string;
  inbox: ActivityMap;
  inboxFilter?: (obj: ASObject) => Promise<boolean>;
}) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    switch (req.method.toLowerCase()) {
      case "options":
        res.writeHead(200, {
          "Accept-Post": [
            "application/activity+json",
            "application/json",
            "application/ld+json",
            'application/ld+json; profile="https://www.w3.org/ns/activitystreams"',
          ].join(", "),
        });
        res.end();
        return;
      case "get":
        const idQuery = first(url.parse(req.url, true).query.id);
        let responseBody;
        if (idQuery) {
          // trying to just get one notification
          const itemWithId = await inbox.get(idQuery);
          if (!itemWithId) {
            res.writeHead(404);
            res.end();
            return;
          }
          responseBody = itemWithId;
        } else {
          // getting a bunch of notifications
          const maxMemberCount = requestMaxMemberCount(req) || 10;
          const items = [...(await Promise.resolve(inbox.values()))]
            .slice(-1 * maxMemberCount)
            .reverse();
          const inboxCollection = {
            "@context": "https://www.w3.org/ns/activitystreams",
            "@id": "/activitypub/inbox",
            // empty string is relative URL for 'self'
            current: "",
            items,
            "ldp:contains": items.map(i => ({ id: i.id })).filter(Boolean),
            totalItems: await inbox.size,
            type: ["OrderedCollection", "ldp:Container"],
          };
          responseBody = inboxCollection;
        }
        const accept = accepts(req);
        const serverPreferences = [
          'application/ld+json; profile="https://www.w3.org/ns/activitystreams"',
          "json",
          "application/ld+json",
          "application/activity+json",
        ];
        const contentType =
          accept.type(serverPreferences) || serverPreferences[0];
        res.writeHead(200, {
          "content-type": contentType,
        });
        res.end(JSON.stringify(responseBody, null, 2));
        break;
      case "post":
        debuglog("receiving inbox POST");
        const requestBody = await readableToString(req);
        debuglog(requestBody);
        let parsed;
        try {
          parsed = JSON.parse(requestBody);
        } catch (e) {
          res.writeHead(400);
          res.end("Couldn't parse request body as JSON: " + requestBody);
          return;
        }

        const inboxFilterResult = await inboxFilter(parsed);
        if (!inboxFilterResult) {
          res.writeHead(400);
          res.end(
            "This activity has been blocked by the configured inboxFilter",
          );
          return;
        }

        const existsAlreadyInInbox = parsed.id
          ? await Promise.resolve(inbox.get(parsed.id))
          : false;
        if (existsAlreadyInInbox) {
          // duplicate!
          res.writeHead(409);
          res.end(
            "There is already an activity in the inbox with id " + parsed.id,
          );
          return;
        }

        const notificationToSave = Object.assign({}, parsed);
        const compacted = await jsonld.compact(notificationToSave, {});
        let originalId = compacted["@id"];
        // Move incomding @id to wasDerivedFrom, then provision a new @id
        if (originalId) {
          notificationToSave["http://www.w3.org/ns/prov#wasDerivedFrom"] = {
            id: originalId,
          };
        } else {
          // can't understand parsed's id
          delete parsed["@id"];
          delete parsed.id;
          parsed.id = originalId = uuidUri(createUUID());
        }
        delete notificationToSave["@id"];
        const notificationUrnUuid = uuidUri(createUUID());
        const notificationUrl = `/activitypub/inbox?id=${encodeURIComponent(
          notificationUrnUuid,
        )}`;

        notificationToSave.id = notificationUrl;

        notificationToSave[owlSameAs] = { id: notificationUrnUuid };

        // If receiving a notification about an activity we've seen before (e.g. it is canonically hosted here),
        // this will be true
        const originalIdsIncludingSameAs = [
          originalId,
          ...ensureArray(compacted[owlSameAs]),
        ];
        const originalIdsHave = await Promise.all(
          originalIdsIncludingSameAs.map(aid => activities.has(aid)),
        );
        const originalAlreadySaved = originalIdsHave.some(Boolean);
        if (originalAlreadySaved) {
          // #TODO merge or something? Consider storing local ones and remote ones in different places
          debuglog(
            "Inbox received activity already stored in activities store." +
              "Not overwriting internal one. But #TODO",
          );
        }

        assert(originalId);

        await Promise.all([
          inbox.set(notificationUrnUuid, notificationToSave),
          // todo: Probably setting on inbox should automagically add to global set of activities
          originalAlreadySaved ? null : activities.set(originalId, parsed),
        ]);
        res.writeHead(201, {
          location: notificationUrl,
        });
        res.end();
        break;
      default:
        return errorHandler(405, new Error("Method not allowed: "))(req, res);
    }
  };
}

// given a AS2 object, return it's JSON-LD @id
const getJsonLdId = (obj: string | ASObject | JSONLD) => {
  if (typeof obj === "string") {
    return obj;
  } else if (obj instanceof JSONLD) {
    return obj["@id"];
  } else if (obj instanceof ASObject) {
    return obj.id;
  } else {
    const exhaustiveCheck: never = obj;
  }
};

// return whether a given activity targets another resource (e.g. in to, cc, bcc)
const activityHasTarget = (activity: Activity, target: LDValue<ASObject>) => {
  const targetId = getJsonLdId(target);
  if (!targetId) {
    throw new Error("Couldn't determine @id of " + target);
  }
  for (const targetList of [activity.to, activity.cc, activity.bcc]) {
    if (!targetList) {
      continue;
    }
    const targets = ensureArray<string | ASObject>(targetList);
    const idsOfTargets = targets.map((i: string | ASObject) => getJsonLdId(i));
    if (idsOfTargets.includes(targetId)) {
      return true;
    }
  }
  return false;
};

// route for ActivityPub Outbox
// https://w3c.github.io/activitypub/#outbox
function outboxHandler({
  activities,
  // external location of distbin (used for delivery)
  externalUrl,
  internalUrl,
  deliverToLocalhost,
}: {
  activities: ActivityMap;
  externalUrl: string;
  internalUrl: string;
  deliverToLocalhost: boolean;
}) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    switch (req.method.toLowerCase()) {
      case "get":
        res.writeHead(200, {
          "content-type": "application/json",
        });
        res.end(
          JSON.stringify(
            {
              "@context": "https://www.w3.org/ns/activitystreams",
              items: [],
              type: "OrderedCollection",
            },
            null,
            2,
          ),
        );
        break;
      case "post":
        const requestBody = await readableToString(req);
        const newuuid = createUUID();
        let parsed: { [key: string]: any };
        try {
          parsed = JSON.parse(requestBody);
        } catch (e) {
          res.writeHead(400);
          res.end("Couldn't parse request body as JSON: " + requestBody);
          return;
        }

        // https://w3c.github.io/activitypub/#object-without-create
        // The server must accept a valid [ActivityStreams] object that isn't a subtype
        // of Activity in the POST request to the outbox.
        // The server then must attach this object as the object of a Create Activity.
        const submittedActivity = as2ObjectIsActivity(parsed)
          ? parsed
          : Object.assign(
              {
                "@context": "https://www.w3.org/ns/activitystreams",
                object: parsed,
                type: "Create",
              },
              // copy over audience from submitted object to activity
              ["to", "cc", "bcc"].reduce(
                (props: { [key: string]: any }, key) => {
                  if (key in parsed) {
                    props[key] = parsed[key];
                  }
                  return props;
                },
                {},
              ),
            );

        const newActivity = Object.assign(
          {
            type: "Activity",
          },
          submittedActivity,
          {
            // #TODO: validate that newActivity wasn't submitted with an .id, even though spec says to rewrite it
            id: uuidUri(newuuid),
            // #TODO: what if it already had published?
            published: new Date().toISOString(),
          },
          typeof submittedActivity.object === "object" && {
            // ensure object has id
            object: Object.assign(
              { id: uuidUri(createUUID()) },
              submittedActivity.object,
            ),
          },
        );

        // #TODO: validate the activity. Like... you probably shouldn't be able to just send '{}'
        const location = "/activities/" + newuuid;

        // Save
        await activities.set(newActivity.id, newActivity);

        res.writeHead(201, { location });

        try {
          // Target and Deliver to other inboxes
          const activityToDeliver = locallyHostedActivity(newActivity, {
            externalUrl,
          });
          await targetAndDeliver(
            activityToDeliver,
            undefined,
            deliverToLocalhost,
            internalUrlRewriter(internalUrl, externalUrl),
          );
        } catch (e) {
          debuglog("Error delivering activity other inboxes", e);
          if (e.name === "SomeDeliveriesFailed") {
            const failures = e.failures.map((f: Error) => {
              return {
                message: f.message,
                name: f.name,
              };
            });
            // #TODO: Retry some day
            res.end(
              JSON.stringify({
                content:
                  "Activity was created, but delivery to some others servers'" +
                  "inbox failed. They will not be retried.",
                failures,
              }),
            );
            await activities.set(
              newActivity.id,
              Object.assign({}, newActivity, {
                "distbin:activityPubDeliveryFailures": failures,
                "distbin:activityPubDeliverySuccesses": e.successes,
              }),
            );
            return;
          }
          throw e;
        }

        res.end();
        break;
      default:
        return errorHandler(405, new Error("Method not allowed: "))(req, res);
    }
  };
}

// route for ActivityPub Public Collection
// https://w3c.github.io/activitypub/#public-addressing
function publicCollectionHandler({
  activities,
  externalUrl,
}: {
  activities: ActivityMap;
  externalUrl: ExternalUrl;
}) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const maxMemberCount = requestMaxMemberCount(req) || 10;
    const publicActivities = [];
    const itemsForThisPage = [];
    const allActivities = [...(await Promise.resolve(activities.values()))]
      .sort((a, b) => {
        if (a.published < b.published) {
          return -1;
        } else if (a.published > b.published) {
          return 1;
        } else {
          // assume ids aren't equal. If so we have a bigger problem
          return a.id < b.id ? -1 : 1;
        }
      })
      .reverse();
    for (const activity of allActivities) {
      if (!activityHasTarget(activity, publicCollectionId)) {
        continue;
      }
      publicActivities.push(activity);
      if (itemsForThisPage.length < maxMemberCount) {
        itemsForThisPage.push(activity);
      }
    }
    const currentItems = itemsForThisPage.map(activity => {
      if (isHostedLocally(activity)) {
        return locallyHostedActivity(activity, { externalUrl });
      }
      return activity;
    });
    const totalItems = publicActivities.length;
    // empty string is relative URL for 'self'
    const currentUrl = [req.url, req.url.endsWith("/") ? "" : "/", "page"].join(
      "",
    );
    const publicCollection = {
      "@context": "https://www.w3.org/ns/activitystreams",
      current: {
        href: currentUrl,
        mediaType: "application/json",
        name: "Recently updated public activities",
        rel: "current",
        type: "Link",
      },
      first: currentUrl,
      id: "https://www.w3.org/ns/activitypub/Public",
      // Get recent 10 items
      items: currentItems,
      totalItems,
      type: "Collection",
    };
    res.writeHead(200, {
      "content-type": "application/json",
    });
    res.end(JSON.stringify(publicCollection, null, 2));
  };
}

interface IPropertyFilter {
  readonly [key: string]: Comparison;
}

interface IAndExpression {
  and: Filter[];
}

function isAndExpression(expression: object): expression is IAndExpression {
  // magic happens here
  return (expression as IAndExpression).and !== undefined;
}

interface IOrExpression {
  or: Filter[];
}

function isOrExpression(expression: object): expression is IOrExpression {
  // magic happens here
  return (expression as IOrExpression).or !== undefined;
}

type CompoundFilter = IAndExpression | IOrExpression;

function isCompoundFilter(filter: object): filter is CompoundFilter {
  return isAndExpression(filter) || isOrExpression(filter);
}

type Filter = IPropertyFilter | CompoundFilter;

type FilterComparison = "lt" | "equals";

type Cursor = CompoundFilter;

interface ILessThanComparison {
  lt: string;
}

function isLessThanComparison(
  comparison: object,
): comparison is ILessThanComparison {
  return Boolean((comparison as ILessThanComparison).lt);
}

interface IEqualsComparison {
  equals: string;
}

function isEqualsComparison(
  comparison: object,
): comparison is IEqualsComparison {
  return Boolean((comparison as IEqualsComparison).equals);
}

type Comparison = ILessThanComparison | IEqualsComparison;

function isComparison(comparison: object): comparison is Comparison {
  return Boolean(
    (comparison as ILessThanComparison).lt ||
      (comparison as IEqualsComparison).equals,
  );
}

function getClauses(expression: CompoundFilter): Filter[] {
  if (isAndExpression(expression)) {
    return expression.and;
  } else if (isOrExpression(expression)) {
    return expression.or;
  }
}

const createMatchesCursor = (cursor: CompoundFilter) => (
  activity: Extendable<Activity>,
) => {
  assert.equal(Object.keys(cursor).length, 1);
  const clauses: Filter[] = getClauses(cursor) || [];
  for (const filter of clauses) {
    assert.equal(Object.keys(filter).length, 1);
    const prop = Object.keys(filter)[0];
    let matchesRequirement: boolean;
    // if (prop instanceof IAndExpression | IOrExpression | EqualsExpression) {
    if (isCompoundFilter(filter)) {
      const compoundFilter: CompoundFilter = filter;
      // this is another expression, recurse
      matchesRequirement = createMatchesCursor(compoundFilter)(activity);
    } else {
      const IpropertyFilter: IPropertyFilter = filter;
      const comparison: Comparison = IpropertyFilter[prop];
      const propValue = activity[prop];
      if (isLessThanComparison(comparison)) {
        matchesRequirement = propValue < comparison.lt;
      } else if (isEqualsComparison(comparison)) {
        matchesRequirement = propValue === comparison.equals;
      }
    }
    if (matchesRequirement && isOrExpression(cursor)) {
      return true;
    }
    if (!matchesRequirement && isAndExpression(cursor)) {
      return false;
    }
  }
  if (isOrExpression(cursor)) {
    return false;
  }
  if (isAndExpression(cursor)) {
    return true;
  }
};

function publicCollectionPageHandler({
  activities,
  externalUrl,
}: {
  activities: Map<string, Activity>;
  externalUrl: ExternalUrl;
}) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const maxMemberCount = requestMaxMemberCount(req) || 10;
    const parsedUrl = url.parse(req.url, true);
    let cursor;
    let matchesCursor = (a: Activity) => true;
    if (parsedUrl.query.cursor) {
      try {
        cursor = JSON.parse(first(parsedUrl.query.cursor));
      } catch (error) {
        res.writeHead(400);
        res.end(JSON.stringify({ message: "Invalid cursor in querystring" }));
        return;
      }
      matchesCursor = createMatchesCursor(cursor);
    }
    const publicActivities = [];
    const itemsForThisPage = [];
    // @todo ensure sorted by both published and id
    const allActivities = [...(await Promise.resolve(activities.values()))]
      .sort((a, b) => {
        if (a.published < b.published) {
          return -1;
        } else if (a.published > b.published) {
          return 1;
        } else {
          // assume ids aren't equal. If so we have a bigger problem
          return a.id < b.id ? -1 : 1;
        }
      })
      .reverse();
    let itemsBeforeCursor = 0;
    for (const activity of allActivities) {
      if (!activityHasTarget(activity, publicCollectionId)) {
        continue;
      }
      publicActivities.push(activity);
      if (!matchesCursor(activity)) {
        itemsBeforeCursor++;
        continue;
      }
      if (itemsForThisPage.length < maxMemberCount) {
        itemsForThisPage.push(activity);
      }
    }
    const currentItems = itemsForThisPage.map(activity => {
      if (isHostedLocally(activity)) {
        return locallyHostedActivity(activity, { externalUrl });
      }
      return activity;
    });
    const totalItems = publicActivities.length;
    let next;
    if (totalItems > currentItems.length) {
      const lastItem = currentItems[currentItems.length - 1];
      if (lastItem) {
        const nextCursor = JSON.stringify({
          or: [
            { published: { lt: lastItem.published } },
            {
              and: [
                { published: { equals: lastItem.published } },
                { id: { lt: lastItem.id } },
              ],
            },
          ],
        });
        next = "?" + querystring.stringify({ cursor: nextCursor });
      }
    }
    const collectionPage = {
      "@context": "https://www.w3.org/ns/activitystreams",
      next,
      orderedItems: currentItems,
      partOf: "/activitypub/public",
      startIndex: itemsBeforeCursor,
      type: "OrderedCollectionPage",
    };
    res.writeHead(200, {
      "content-type": "application/json",
    });
    res.end(JSON.stringify(collectionPage, null, 2));
  };
}

function errorHandler(statusCode: number, error?: Error) {
  if (error) {
    logger.error("", error);
  }
  return (req: IncomingMessage, res: ServerResponse) => {
    res.writeHead(statusCode);
    const responseText = error ? error.toString() : statusCode.toString();
    res.end(responseText);
  };
}
