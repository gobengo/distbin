import { route, RoutePattern, RouteResponderFactory } from "../util"

import * as about from "./about"
import * as anActivity from "./an-activity"
import * as home from "./home"
import * as publicSection from "./public"

import {IncomingMessage, ServerResponse} from "http"

import { createLogger } from "../logger"
const logger = createLogger(__filename)

exports.createHandler = ({ apiUrl, externalUrl }: {apiUrl: string, externalUrl: string}) => {
  const routes = new Map<RoutePattern, RouteResponderFactory>([
    [new RegExp("^/$"), () => home.createHandler({ apiUrl, externalUrl })],
    [new RegExp("^/about$"), () => about.createHandler({ externalUrl })],
    [new RegExp("^/public$"), () => publicSection.createHandler({ apiUrl })],
    [new RegExp("^/activities/([^/.]+)$"),
      (activityId: string) => anActivity.createHandler({ apiUrl, activityId, externalUrl })],
  ])
  return (req: IncomingMessage, res: ServerResponse) => {
    const handler = route(routes, req)
    if (!handler) {
      res.writeHead(404)
      res.end("404 Not Found")
      return
    }
    Promise.resolve(handler(req, res))
      .catch((e) => {
        res.writeHead(500)
        logger.error(e)
        res.end("Error: " + e)
      })
  }
}
