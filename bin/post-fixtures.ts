#!/usr/bin/env node
/*
This script is meant to populate a distbin server with useful fixtures.
./post-fixtures <url-of-distbin>
*/

import * as http from "http"
import * as url from "url"
import { Activity, ASObject } from "../src/types"
import { first, readableToString } from "../src/util"
import { sendRequest } from "../src/util"

if (require.main === module) {
  const [distbinUrl] = process.argv.slice(2)
  postManyFixtures(distbinUrl)
  .then(() => process.exit())
  .catch((err: Error) => {
    /* tslint:disable-next-line:no-console */
    console.error("Uncaught Error", err)
    process.exit(1)
  })
}

// Create a sample activity
function createNoteFixture({ inReplyTo }: {inReplyTo: string}): ASObject {
  const fixture: ASObject = {
    cc: ["https://www.w3.org/ns/activitystreams#Public"],
    content: loremIpsum(),
    inReplyTo,
    type: "Note",
  }
  return fixture
}

// post many fixtures, including replies, to distbinUrl over HTTP
async function postManyFixtures(
  distbinUrl: string,
  { max= 32, maxDepth= 4, thisDepth= 1, inReplyTo }: {
    max?: number,
    maxDepth?: number,
    thisDepth?: number,
    inReplyTo?: string,
  }= {}): Promise<Activity[]> {
  const posted: Activity[] = []
  while (max--) {
    // console.log('max', max)
    const activityUrl = await postActivity(distbinUrl, createNoteFixture({ inReplyTo }))
    /* tslint:disable-next-line:no-console */
    console.log(new Array(thisDepth - 1).join(".") + url)
    // posted.push(activityUrl)
    // post children
    if (maxDepth > 1) {
      // we must go deeper
      const mnlf = Math.random() * max
      // console.log('mnlf', mnlf)
      const maxNextLevel = Math.round(mnlf)
      max = max - maxNextLevel
      // console.log(`posting ${maxNextLevel} at level ${maxDepth-1}, leaving ${max} remaining`)
      posted.push.apply(posted, await postManyFixtures(distbinUrl, {
        inReplyTo: activityUrl,
        max: maxNextLevel,
        maxDepth: maxDepth - 1,
        thisDepth: thisDepth + 1,
      }))
    }
  }
  return posted
}

// post a single fixture to distbinUrl over HTTP
async function postActivity(distbinUrl: string, activity: ASObject) {
  if (!distbinUrl) {
    throw new Error("Please provide a distbinUrl argument")
  }
  const postRequest = http.request(Object.assign(url.parse(distbinUrl), {
    method: "post",
    path: "/activitypub/outbox",
  }))
  postRequest.write(JSON.stringify(activity, null, 2))
  const postResponse = await sendRequest(postRequest)
  const activityUrl = url.resolve(distbinUrl, first(postResponse.headers.location))
  return activityUrl
}

function loremIpsum() {
  const text = "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt " +
    "ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut " +
    "aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore " +
    "eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt " +
    "mollit anim id est laborum."
  // post a random number of sentences to vary length
  const sentences = text.split(". ")
  const truncated = sentences.slice(Math.floor(Math.random() * sentences.length)).join(". ")
  return truncated
}
