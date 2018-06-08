// common util functions for testing
// (doesn't actually contain tests)
import * as assert from "assert"
import * as http from "http"
import {IncomingMessage, RequestOptions, Server, ServerResponse} from "http"
import * as url from "url"
import * as activitypub from "../src/activitypub"
import { ASJsonLdProfileContentType } from "../src/activitystreams"
import {Activity, HttpRequestResponder, LDObject} from "../src/types"
import { first, sendRequest } from "../src/util"

// Return Promise of an http.Request that will be sent to an http.createServer listener
export const requestForListener = async (listener: HttpRequestResponder, requestOptions?: RequestOptions|string) => {
  const server = http.createServer(listener)
  await listen(server)

  const request = http.request(Object.assign({
    hostname: "localhost",
    method: "get",
    path: "/",
    port: server.address().port,
  }, typeof (requestOptions) === "string" ? { path: requestOptions } : requestOptions))

  return request
}

// given an http.Server, return a promise of it listening on a port
export const listen = (server: Server, port = 0, hostname?: string): Promise<string> => {
  let listened: boolean
  return new Promise((resolve, reject) => {
    server.once("error", (error: any) => {
      if (!listened) { reject(error) }
    })
    server
      .listen(port, hostname, () => {
        listened = true
        resolve(`http://localhost:${server.address().port}`)
      })
  })
}

// post an activity to a distbin, and return its absolute url
export const postActivity = async (
  distbinListener: HttpRequestResponder,
  activity: LDObject<Activity>,
) => {
  const distbinUrl = await listen(http.createServer(distbinListener))
  const req = http.request(Object.assign(url.parse(distbinUrl), {
    headers: activitypub.clientHeaders({
      "content-type": ASJsonLdProfileContentType,
    }),
    method: "post",
    path: "/activitypub/outbox",
  }))
  req.write(JSON.stringify(activity))
  const res = await sendRequest(req)
  assert.equal(res.statusCode, 201)
  const activityUrl = url.resolve(distbinUrl, first(res.headers.location))
  return activityUrl
}
