import * as assert from "assert"
import * as http from "http"
import { testCli } from "."
import distbin from "../"
import * as activitypub from "../src/activitypub"
import { clientAddressedActivity, getASId, objectTargets, objectTargetsNoRecurse,
         targetedAudience } from "../src/activitypub"
import { ASJsonLdProfileContentType } from "../src/activitystreams"
import { Activity, ASObject, LDValue } from "../src/types"
import { ensureArray, readableToString, sendRequest } from "../src/util"
import { first, isProbablyAbsoluteUrl } from "../src/util"
import { listen, requestForListener } from "./util"

const tests = module.exports

const setsAreEqual = (s1: Set<any>, s2: Set<any>) => (s1.size === s2.size) && Array.from(s1).every((i) => s2.has(i))

tests.objectTargets = async () => {
  const activity: Activity = {
    "@context": ["https://www.w3.org/ns/activitystreams",
                 {"@language": "en-GB"}],
    "object": {
      attributedTo: {
        attributedTo: {
          attributedTo: {
            cc: [{
              id: "https://rhiaro.co.uk/attributedTo/attributedTo/cc/0",
            }],
            id: "https://rhiaro.co.uk/attributedTo/attributedTo",
          },
          id: "https://rhario.co.uk/attributedTo",
        },
        id: "https://rhiaro.co.uk/#amy",
      },
      cc: "https://e14n.com/evan",
      content: "Today I finished morph, a client for posting ActivityStreams2...",
      id: "https://rhiaro.co.uk/2016/05/minimal-activitypub",
      name: "Minimal ActivityPub update client",
      to: "https://rhiaro.co.uk/followers/",
      type: "Article",
    },
    "type": "Like",
  }
  const levels: Array<Set<string>> = [
    ["https://rhiaro.co.uk/#amy", "https://rhiaro.co.uk/followers/", "https://e14n.com/evan"],
    ["https://rhario.co.uk/attributedTo"],
    ["https://rhiaro.co.uk/attributedTo/attributedTo"],
    ["https://rhiaro.co.uk/attributedTo/attributedTo/cc/0"],
  ].map((a: string[]) => new Set(a))
  const targetsShouldBeForLevel = (level: number) => {
    const theseLevels = levels.slice(0, level + 1)
    const targetsShouldBe = theseLevels.reduce(
      (targets, levelTargetSet) => new Set([...levelTargetSet, ...targets]),
      new Set(),
    )
    return new Set(targetsShouldBe)
  }

  for (const [index, level] of enumerate(levels)) {
    const targets = (await objectTargets(activity, index, false, (u: string) => u)).map(getASId)
    const targetsShouldBe = targetsShouldBeForLevel(index)
    // console.log({ level: index, targets, targetsShouldBe })
    assert(setsAreEqual(targetsShouldBe, new Set(targets)))
  }
}

function* enumerate(iterable: Iterable<any>) {
  let i = 0

  for (const x of iterable) {
    yield [i, x]
    i++
  }
}

tests.targetedAudience = async () => {
  const asObject: ASObject = {
    "@context": "https://www.w3.org/ns/activitystreams",
    "attributedTo": "https://rhiaro.co.uk/#amy",
    "cc": "https://e14n.com/evan",
    "content": "Today I finished morph, a client for posting ActivityStreams2...",
    "id": "https://rhiaro.co.uk/2016/05/minimal-activitypub",
    "name": "Minimal ActivityPub update client",
    "to": "https://rhiaro.co.uk/followers/",
    "type": "Article",
  }
  const audience = targetedAudience(asObject)
  // console.log('audience', audience)
  assert.deepEqual(audience, ["https://rhiaro.co.uk/followers/", "https://e14n.com/evan"])
}

tests.clientAddressedActivity = async () => {
  const attributedToId = "https://bengo.is/clientAddressedActivityTest"
  const parentUrl = await listen(http.createServer((req, res) => {
    res.writeHead(200, {"content-type": ASJsonLdProfileContentType})
    res.end(JSON.stringify({
      attributedTo: {
        id: attributedToId,
      },
      type: "Note",
    }, null, 2))
  }))

  const activityToAddress = {
    object: {
      content: "i reply to u ok",
      inReplyTo: parentUrl,
      type: "Note",
    },
    type: "Create",
  }
  const addressed = await clientAddressedActivity(activityToAddress, 0, true, (u: string) => u)
  assert(ensureArray(addressed.cc).includes(attributedToId))
}

/*

Tests of ActivityPub functionality, including lots of text from the spec itself and #critiques

*/

/*
3.1 Object Identifiers - https://w3c.github.io/activitypub/#obj-id

All Objects in [ActivityStreams] should have unique global identifiers. ActivityPub extends this requirement;
all objects distributed by the ActivityPub protocol must have unique global identifiers; these identifiers must
fall into one of the following groups:
* Publicly dereferencable URIs, such as HTTPS URIs, with their authority belonging to that of their originating
  server. (Publicly facing content should use HTTPS URIs.)
* An ID explicitly specified as the JSON null object, which implies an anonymous object (a part of its parent context)
  #critique: There are no examples of this anywhere in the spec, and it's a weird deviation from AS2 which does not
  require 'explicit' null (I think...).

Identifiers must be provided for activities posted in server to server communication.
However, for client to server communication, a server receiving an object with no specified id should allocate an
object ID in the user's namespace and attach it to the posted object.

All objects must have the following properties:

id
The object's unique global identifier
type
The type of the object
*/
// activitypub.objectHasRequiredProperties = (obj: {[key: string]: any}) => {
//   const requiredProperties = ["id", "type"]
//   const missingProperties = requiredProperties.filter((p: string) => obj[p])
//   return Boolean(!missingProperties.length)
// }

// 3.2 Methods on Objects - https://w3c.github.io/activitypub/#obj-methods

// 4 Actors - https://w3c.github.io/activitypub/#actors

// #critique - This normalization algorithm isn't really normalizing if it leaves the default URI scheme up to
// each implementation to decide "preferably https"

// 5.4 Outbox - https://w3c.github.io/activitypub/#outbox

// The outbox is discovered through the outbox property of an actor's profile.
// #critique - Can only 'actors' have outboxes? Can a single distbin have one outbox?

// The outbox must be an OrderedCollection.
// #critique - another part of spec says "The outbox accepts HTTP POST requests". Does it also accept GET?
// If yet, clarify in other section; If not, what does it mean to 'be an OrderedCollection'
// (see isOrderedCollection function)
// #assumption - interpretation is that outbox MUST accept GET requests, so I'll test
tests["The outbox must be an OrderedCollection"] = async () => {
  const res = await sendRequest(await requestForListener(distbin(), {
    headers: activitypub.clientHeaders(),
    path: "/activitypub/outbox",
  }))
  assert.equal(res.statusCode, 200)
  const resBody = await readableToString(res)
  assert(isOrderedCollection(resBody))
}

/*
  #TODO
  The outbox stream contains objects the user has published, subject to the ability of the requestor to retrieve
  the object (that is, the contents of the outbox are filtered by the permissions of the person reading it).
    #TODO assert that outbox collection object has '.items'
  If a user submits a request without Authorization the server should respond with all of the Public posts.
  This could potentially be all relevant objects published by the user, though the number of available items is
  left to the discretion of those implementing and deploying the server.
    #critique - "All of the public posts"? Or all of the public posts that have been sent through this outbox?
  */

// The outbox accepts HTTP POST requests, with behaviour described in Client to Server Interactions.
// see section 7

/*
5.6 Public Addressing - https://w3c.github.io/activitypub/#public-addressing
*/
tests["can request the public Collection"] = async () => {
  const res = await sendRequest(await requestForListener(distbin(), "/activitypub/public"))
  assert.equal(res.statusCode, 200)
}

// In addition to [ActivityStreams] collections and objects, Activities may additionally be addressed to the
// special "public" collection, with the identifier https://www.w3.org/ns/activitystreams#Public. For example:
// #critique: It would be helpful to show an example activity that is 'addressed to the public collection', as
// there aren't any currently in the spec
//  Like... should the public collection id bein the 'to' or 'cc' or 'bcc' fields or does it matter?
tests["can address activities to the public Collection when sending to outbox, and they show up in the public" +
      "Collection"] = async () => {
  const distbinListener = distbin()

  // post an activity addressed to public collection to outbox
  const activityToPublic = {
    "@context": "https://www.w3.org/ns/activitystreams",
    "cc": ["https://www.w3.org/ns/activitystreams#Public"],
    "object": "https://rhiaro.co.uk/2016/05/minimal-activitypub",
    "type": "Like",
  }
  const postActivityRequest = await requestForListener(distbinListener, {
    headers: activitypub.clientHeaders({
      "content-type": ASJsonLdProfileContentType,
    }),
    method: "post",
    path: "/activitypub/outbox",
  })
  postActivityRequest.write(JSON.stringify(activityToPublic))
  const postActivityResponse = await sendRequest(postActivityRequest)
  assert.equal(postActivityResponse.statusCode, 201)

  // k it's been POSTed to outbox. Verify it's in the public collection
  const publicCollectionResponse = await sendRequest(await requestForListener(distbinListener, "/activitypub/public"))
  const publicCollection = JSON.parse(await readableToString(publicCollectionResponse))
  // #critique ... ok so this is an example of where it's hard to know whether its in the Collection
  // because of id generation and such
  assert(publicCollection.totalItems > 0, "publicCollection has at least one item")
  assert(
    publicCollection.items.filter(
      (a: Activity) => a.type === "Like" && a.object === "https://rhiaro.co.uk/2016/05/minimal-activitypub",
    ).length === 1,
    "publicCollection contains the activity that targeted it")
}

/*
5.5 Inbox

The inbox is discovered through the inbox property of an actor's profile.
#TODO add .inbox with propert context to / JSON
*/

// The inbox must be an OrderedCollection.
tests["The inbox must be an OrderedCollection"] = async () => {
  const res = await sendRequest(await requestForListener(distbin(), {
    headers: activitypub.clientHeaders(),
    path: "/activitypub/inbox",
  }))
  assert.equal(res.statusCode, 200)
  const resBody = await readableToString(res)
  assert(isOrderedCollection(resBody))
}

function isOrderedCollection(something: string|object) {
  const obj = typeof something === "string" ? JSON.parse(something) : something
  // #TODO: Assert that this is valid AS2. Ostensible 'must be an OrderedCollection' implies that
  let type = obj.type
  if (!Array.isArray(type)) { type = [type] }
  assert(type.includes("OrderedCollection"))
  return true
}
/*

The inbox stream contains all objects received by the user.
The server should filter content according to the requester's permission.
In general, the owner of an inbox is likely to be able to access all of their inbox contents.
Depending on access control, some other content may be public, whereas other content may require authentication
for non-owner users, if they can access the inbox at all.

The server must perform de-duplication of activities returned by the inbox.
Duplication can occur if an activity is addressed both to a user's followers, and a specific user who also follows
the recipient user, and the server has failed to de-duplicate the recipients list.
Such deduplication must be performed by comparing the id of the activities and dropping any activities already seen.

The inbox accepts HTTP POST requests, with behaviour described in Delivery.
*/

// 6 Binary Data - #TODO

// 7 Client to Server Interactions - https://w3c.github.io/activitypub/#client-to-server-interactions

// Example 6
// let article = {
//   '@context': 'https://www.w3.org/ns/activitypub',
//   'id': 'https://rhiaro.co.uk/2016/05/minimal-activitypub',
//   'type': 'Article',
//   'name': 'Minimal ActivityPub update client',
//   'content': 'Today I finished morph, a client for posting ActivityStreams2...',
//   'attributedTo': 'https://rhiaro.co.uk/#amy',
//   'to': 'https://rhiaro.co.uk/followers/',
//   'cc': 'https://e14n.com/evan'
// }
// Example 7
// let likeOfArticle = {
//   '@context': 'https://www.w3.org/ns/activitypub',
//   'type': 'Like',
//   // #TODO: Fix bug where a comma was missing at end of here
//   'actor': 'https://dustycloud.org/chris/',
//   'name': "Chris liked 'Minimal ActivityPub update client'",
//   'object': 'https://rhiaro.co.uk/2016/05/minimal-activitypub',
//   'to': ['https://rhiaro.co.uk/#amy',
//          'https://dustycloud.org/followers',
//          'https://rhiaro.co.uk/followers/'],
//   'cc': 'https://e14n.com/evan'
// }

/*
To submit new Activities to a user's server, clients must discover the URL of the user's outbox from their profile
  and then must make an HTTP POST request to to this URL with the Content-Type of
  application/ld+json; profile="https://www.w3.org/ns/activitystreams".
  #critique: no mention of application/activity+json even though it is the most correct mimetype of ActivityStreams

The request must be authenticated with the credentials of the user to whom the outbox belongs.
  #critique - I think this is superfluous. Security could be out of band, e.g. through firewalls or other network
  layers, or intentionally nonexistent. Instead of saying what the client MUST do, say that the server MAY require
  authorization.

The body of the POST request must contain a single Activity (which may contain embedded objects), or a single
non-Activity object which will be wrapped in a Create activity by the server.
*/

// Example 8,9: Submitting an Activity to the Outbox
tests["can submit an Activity to the Outbox"] = async () => {
  const distbinListener = distbin()
  const req = await requestForListener(distbinListener, {
    headers: activitypub.clientHeaders({
      "content-type": ASJsonLdProfileContentType,
    }),
    method: "post",
    path: "/activitypub/outbox",
  })
  req.write(JSON.stringify({
    "@context": "https://www.w3.org/ns/activitypub",
    "actor": "https://bengo.is/proxy/dustycloud.org/chris/", // #TODO fix that there was a missing comma here in spec
    "name": "Chris liked 'Minimal ActivityPub update client'",
    "object": "https://rhiaro.co.uk/2016/05/minimal-activitypub",
    "type": "Like",
    // 'to': ['https://dustycloud.org/followers', 'https://rhiaro.co.uk/followers/'],
    // 'cc': 'https://e14n.com/evan'
  }))
  const postActivityRequest = await sendRequest(req)
  // Servers MUST return a 201 Created HTTP code...
  assert.equal(postActivityRequest.statusCode, 201)
  // ...with the new URL in the Location header.
  const location = first(postActivityRequest.headers.location)
  assert(location, "Location header is present in response")
  // #TODO assert its a URL

  // #question - Does this imply any requirements about what happens when GET that URL?
  // going to test that it's GETtable for now
  const getActivityResponse = await sendRequest(await requestForListener(distbinListener, location))
  assert.equal(getActivityResponse.statusCode, 200)

  const newCreateActivity = JSON.parse(await readableToString(getActivityResponse))
  assert.ok(newCreateActivity.id)
  assert.ok(isProbablyAbsoluteUrl(newCreateActivity.id))

  /*
  If an Activity is submitted with a value in the id property, servers must ignore this and generate a new id for
  the Activity.
    #critique - noooo. It's better to block requests that already have IDs than ignore what the client sends. I
    think a 409 Conflict or 400 Bad Request would be better.
    #critique - If there *is not* an id, is the server supposed to generate one? Implied but not stated
      Oh actually it is mentioned up on 3.1 "However, for client to server communication, a server receiving an
      object with no specified id should allocate an object ID in the user's namespace and attach it to the posted
      object.", but it's SHOULD not MUST. Regardless I think it would be easier for implementors if this were moved
      from 3.1 to 7
    #critique - ok last one. In 3.1 it says "Identifiers must be provided for activities posted in server to server
    communication." How can a server tell if a request is coming from the server or the client? It's supposed to
    always expect .ids from other servers, but it's supposed to ignore/rewrite all .ids from 'clients'.
    In a federated thing like this every server is someone elses client, no? I think this is a blocking
    inconsistency. Oh... maybe not. Is the heuristic here that 'servers' deliver to inboxes and 'clients' deliver
    to outboxes?
    #TODO - skipping for now. test later
  */

  // The server adds this new Activity to the outbox collection. Depending on the type of Activity, servers may
  // then be required to carry out further side effects.
  // #TODO: Probably verify this by fetching the outbox collection. Keep in mind that tests all run in parallel
  // right now so any assumption of isolation will be wrong.
  // #critique - What's the best way to verify this, considering there is no requirement for the Activity POST
  // response to include a representation, and another part of the spec currently says the server should ignore any
  // .id provided by the client and set it's own. If the Client can provide its own ID, then it can instantly go in
  // the outbox to verify something with that ID is there. If not, it first has to fetch the Location URL, see the
  //  ID, then look in the outbox and check for that ID. Eh. Ultimately not that crazy but I still feel strongly
  //  that bit about 'ignoring' the provided id and using a new one is really really bad.
}

// 7.1 Create Activity - https://w3c.github.io/activitypub/#create-activity-outbox

/*
  The Create activity is used to when posting a new object. This has the side effect that the object embedded
  within the Activity (in the object property) is created.

  When a Create activity is posted, the actor of the activity should be copied onto the object's attributedTo field.
    #critique like... at what stage of processing? And does .attributedTo always have to be included when the
    activity is sent/retrieved later? And why is this so important? If it's required for logical consistency, maybe
    the server should require the Client to submit activities that have attribution? It's odd for the server to
    make tiny semantic adjustments to the representation provided by the client. Just be strict about what the
    client must do.

  A mismatch between addressing of the Create activity and its object is likely to lead to confusion. As such, a
  server should copy any recipients of the Create activity to its object upon initial distribution, and likewise
  with copying recipients from the object to the wrapping Create activity. Note that it is acceptable for the
  object's addressing may be changed later without changing the Create's addressing (for example via an Update
    activity).
    # urgh, see #critique on previous line. Small little copying adjustments are weird and not-very REST because
    they're changing what the client sent without telling it instead of just being strict about accepting what the
    client sends. Can lead to ambiguity in client representation.
  */

tests["can submit a Create Activity to the Outbox"] = async () => {
  const req = await requestForListener(distbin(), {
    headers: activitypub.clientHeaders({
      "content-type": ASJsonLdProfileContentType,
    }),
    method: "post",
    path: "/activitypub/outbox",
  })
  req.write(JSON.stringify({
    "@context": "https://www.w3.org/ns/activitypub",
    "actor": "https://example.net/~mallory",
    "id": "https://example.net/~mallory/87374", // #TODO: comma was missing here, fix in spec
    "object": {
      attributedTo: "https://example.net/~mallory",
      content: "This is a note",
      id: "https://example.com/~mallory/note/72",
      published: "2015-02-10T15:04:55Z",
      type: "Note",
      // 'to': ['https://example.org/~john/'],
      // 'cc': ['https://example.com/~erik/followers']
    },
    "published": "2015-02-10T15:04:55Z",
    "type": "Create", // #TODO: comma was missing here, fix in spec
    // 'to': ['https://example.org/~john/'],
    // 'cc': ['https://example.com/~erik/followers']
  }))
  const res = await sendRequest(req)
  // Servers MUST return a 201 Created HTTP code...
  assert.equal(res.statusCode, 201)
}

// 7.1.1 Object creation without a Create Activity - https://w3c.github.io/activitypub/#object-without-create

/**
 * For client to server posting, it is possible to create a new object without a surrounding activity.
 * The server must accept a valid [ActivityStreams] object
 * that isn't a subtype of Activity in the POST request to the outbox.
 * #critique: Does this mean it should reject subtypes of Activities? No, right, because Activities are normal to
 * send to outbox. Maybe then you're just saying that, if it's not an Activity subtype, initiate this
 * 'Create-wrapping' algorithm.
 */
tests["can submit a non-Activity to the Outbox, and it is converted to a Create"] = async () => {
  const distbinListener = distbin()
  const req = await requestForListener(distbinListener, {
    headers: activitypub.clientHeaders({
      "content-type": ASJsonLdProfileContentType,
    }),
    method: "post",
    path: "/activitypub/outbox",
  })
  // Example 10: Object with audience targeting
  const example10 = {
    "@context": "https://www.w3.org/ns/activitystreams",
    "bcc": ["https://bengo.is/bcc"],
    "cc": ["https://bengo.is/cc"],
    "content": "This is a note",
    "published": "2015-02-10T15:04:55Z",
    "to": [activitypub.publicCollectionId],
    "type": "Note",
  }
  req.write(JSON.stringify(example10))
  const res = await sendRequest(req)
  // Servers MUST return a 201 Created HTTP code...
  assert.equal(res.statusCode, 201)

  const newCreateActivityResponse = await sendRequest(
    await requestForListener(distbinListener, first(res.headers.location)))
  assert.equal(newCreateActivityResponse.statusCode, 200)
  const newCreateActivity = JSON.parse(await readableToString(newCreateActivityResponse))
  // The server then must attach this object as the object of a Create Activity.
  assert.equal(newCreateActivity.type, "Create")
  assert.ok("id" in newCreateActivity.object, "object.id was provisioned")
  assert.notEqual(newCreateActivity.id, newCreateActivity.object.id)
  const withoutProperties = (obj: object, withoutProps: string[]) => {
    const lesserObj = Array.from(Object.entries(obj)).reduce((nextObj, [prop, val]) => {
      if (!withoutProps.includes(prop)) { nextObj[prop] = val }
      return nextObj
    }, {} as {[key: string]: any})
    return lesserObj
  }
  assert.deepEqual(withoutProperties(newCreateActivity.object, ["id"]), example10)
  // The audience specified on the object must be copied over to the new Create activity by the server.
  assert.deepEqual(newCreateActivity.to, example10.to)
  assert.deepEqual(newCreateActivity.cc, example10.cc)
  assert.deepEqual(newCreateActivity.bcc, example10.bcc)
}

/*
8.2 Delivery

An activity is delivered to its targets (which are actors) by first looking up the targets' inboxes and then posting
the activity to those inboxes.
The inbox property is determined by first retrieving the target actor's json-ld representation and then looking up
the inbox property.
An HTTP POST request (with authorization of the submitting user) is then made to to the inbox, with the Activity as
the body of the request.
This Activity is added by the receiver as an item in the inbox OrderedCollection.

For federated servers performing delivery to a 3rd party server, delivery should be performed asynchronously, and
should additionally retry delivery to recipients if it fails due to network error.

8.2.1 Outbox Delivery

When objects are received in the outbox, the server MUST target and deliver to:

The to, cc or bcc fields if their values are individuals, or Collections owned by the actor.
These fields will have been populated appropriately by the client which posted the Activity to the outbox.
*/

tests["targets and delivers targeted activities sent to Outbox"] = async () => {
  // ok so we're going to make to distbins, A and B, and test that A delivers to B
  const distbinA = distbin({ deliverToLocalhost: true })
  const distbinB = distbin()
  const distbinBUrl = await listen(http.createServer(distbinB))
  // post an Activity to distbinA that has cc distbinB
  const a = {
    cc: distbinBUrl,
    content: "Man, distbinB is really killing it today.",
    type: "Note",
  }
  const postNoteRequest = await requestForListener(distbinA, {
    headers: activitypub.clientHeaders({
      "content-type": ASJsonLdProfileContentType,
    }),
    method: "post",
    path: "/activitypub/outbox",
  })
  postNoteRequest.write(JSON.stringify(a))
  const postNoteResponse = await sendRequest(postNoteRequest)
  assert.equal(postNoteResponse.statusCode, 201)
  // then verify that it is in distbinB's inbox
  const distbinBInboxResponse = await sendRequest(http.get(distbinBUrl + "/activitypub/inbox"))
  assert.equal(distbinBInboxResponse.statusCode, 200)
  const distbinBInbox = JSON.parse(await readableToString(distbinBInboxResponse))
  assert.equal(distbinBInbox.items.length, 1, "there is 1 item in distbin B inbox")
  // Ensure that the activity has a URL that is absolute
  // #todo this tests what comes out of the inbox but probably it's a more accurate test to verify what the /inbox
  // *receives from distbinA (the receiver doesn't strictly need to be a distbinB, but any endpoint)
  // #todo resolvable via @context.@base (https://www.w3.org/TR/json-ld/#base-iri) would also be fine, but not using
  // right now. can check later.
  assert(isProbablyAbsoluteUrl(distbinBInbox.items[0].url), ".url should be an absolute url")
}

tests["does not deliver to localhost"] = async () => {
  // ok so we're going to make to distbins, A and B, and test that A delivers to B
  const distbinA = distbin({ deliverToLocalhost: false })
  const distbinB = distbin({ deliverToLocalhost: false })
  const distbinBUrl = await listen(http.createServer(distbinB))
  // post an Activity to distbinA that has cc distbinB
  const a = {
    cc: distbinBUrl,
    content: "Man, distbinB is really killing it today.",
    type: "Note",
  }
  const postNoteRequest = await requestForListener(distbinA, {
    headers: activitypub.clientHeaders({
      "content-type": ASJsonLdProfileContentType,
    }),
    method: "post",
    path: "/activitypub/outbox",
  })
  postNoteRequest.write(JSON.stringify(a))
  const postNoteResponse = await sendRequest(postNoteRequest)
  assert.equal(postNoteResponse.statusCode, 201)

  const noteResponse = await sendRequest(await requestForListener(distbinA, {
    path: first(postNoteResponse.headers.location),
  }))
  const noteActivity = JSON.parse(await readableToString(noteResponse))
  const inboxDeliveryFailures = noteActivity["distbin:activityPubDeliveryFailures"]
  assert(inboxDeliveryFailures.length >= 1)
  // 'distbin:activityPubDeliveryFailures': [ { name: 'Error', message: 'I will not deliver to localhost' } ],
  assert(inboxDeliveryFailures.some((failure: { name: string, message: string }) =>
    failure.message.includes("server:security-considerations:do-not-post-to-localhost")))

  // then verify that it is in distbinB's inbox
  const distbinBInboxResponse = await sendRequest(http.get(distbinBUrl + "/activitypub/inbox"))
  assert.equal(distbinBInboxResponse.statusCode, 200)
  const distbinBInbox = JSON.parse(await readableToString(distbinBInboxResponse))
  assert.equal(distbinBInbox.items.length, 0, "there is 0 item in distbin B inbox")
}

/*
8.2.2 Inbox Delivery

When Activities are received in the inbox, the server needs to forward these to recipients that the origin was
unable to deliver them to.
To do this, the server must target and deliver to the values of to, cc and/or bcc if and only if all of the
following are true:

This is the first time the server has seen this Activity.
The values of to, cc and/or bcc contain a Collection owned by the server.
The values of inReplyTo, object, target and/or tag are objects owned by the server. The server should recurse
through these values to look for linked objects owned by the server, and should set a maximum limit for recursion
(ie. the point at which the thread is so deep the recipients followers may not mind if they are no longer getting
updates that don't directly involve the recipient). The server must only target the values of to, cc and/or bcc on
the original object being forwarded, and not pick up any new addressees whilst recursing through the linked objects
(in case these addressees were purposefully amended by or via the client).

The server may filter its delivery targets according to implementation-specific rules, for example, spam filtering.
*/

if (require.main === module) {
  testCli(tests)
}
