#!/usr/bin/env ts-node

import * as url from "url"
import { objectTargets } from "../src/activitypub"
import { ASJsonLdProfileContentType } from "../src/activitystreams"
import { createLogger } from "../src/logger"
import { debuglog, ensureArray, readableToString, request, sendRequest } from "../src/util"

const logger = createLogger(__filename)

if (require.main === module) {
  main()
}

async function main() {
  const args = process.argv.slice(2)
  const [targetUrl] = args
  logger.info("client addressing for url", targetUrl)
  const urlResponse = await sendRequest(request(Object.assign(
        url.parse(targetUrl),
    {
      headers: {
        accept: ASJsonLdProfileContentType,
      },
    },
    )))
  const urlBody = await readableToString(urlResponse)
  const fetchedObject = JSON.parse(urlBody)
  const targets = objectTargets(fetchedObject, 0)
  logger.info("", { targets })
}
