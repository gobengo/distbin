// tests for distbin-specific stuff (arbitrary, non-protocol things)
import { testCli } from ".";
import distbin from "../";
import { discoverOutbox } from "../src/activitypub";
import { inboxUrl } from "../src/activitypub";
import { ASJsonLdProfileContentType } from "../src/activitystreams";
import { linkToHref } from "../src/util";
import { ensureArray, sendRequest } from "../src/util";
import { readableToString } from "../src/util";
import { isProbablyAbsoluteUrl } from "../src/util";
import { Activity, ASObject, DistbinActivity, Extendable, HttpRequestResponder,
  isActivity, JSONLD, LDObject, LDValue, LDValues } from "./types";
import { postActivity } from "./util";
import { listen } from "./util";
import { requestForListener } from "./util";

import * as assert from "assert";
import * as http from "http";
import { get } from "lodash";
import fetch from "node-fetch";
import * as url from "url";

const tests = module.exports;

tests["On reply, notify inbox of parent's actor"] = async () => {
  const distbinForParentActor = distbin({ deliverToLocalhost: true });
  const parentActorUrl = await listen(http.createServer(distbinForParentActor))
  const parent = {
    actor: parentActorUrl,
    content: "Anyone out there?",
  }
  const parentUrl = await listen(http.createServer((request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(parent, null, 2))
  }))
  const distbinA = distbin({ deliverToLocalhost: true });
  // post a reply
  const replyUrl = await postActivity(distbinA, {
    cc: [parentUrl],
    content: "Yes I am out there, parent",
    inReplyTo: parentUrl,
  });
  const parentActorInboxResponse = await fetch(await inboxUrl(parentActorUrl))
  const parentActorInbox = await parentActorInboxResponse.json()
  assert.equal(parentActorInbox.items.length, 1)
};

if (require.main === module) {
  testCli(tests);
}
