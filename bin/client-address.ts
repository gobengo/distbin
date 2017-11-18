#!/usr/bin/env ts-node

import { readableToString, sendRequest, ensureArray, request, debuglog } from '../src/util'
import * as url from 'url'
import { ASJsonLdProfileContentType } from '../src/activitystreams'
import { objectTargets } from '../src/activitypub'

if (require.main === module) {
  main()
}

async function main () {
  const args = process.argv.slice(2)
  const [targetUrl] = args
  console.log('client addressing for url', targetUrl)
  const urlResponse = await sendRequest(request(Object.assign(
        url.parse(targetUrl),
    {
      headers: {
        accept: ASJsonLdProfileContentType
      }
    }
    )))
  const urlBody = await readableToString(urlResponse)
  const fetchedObject = JSON.parse(urlBody)
  const targets = objectTargets(fetchedObject, 0)
  console.log({ targets })
}
