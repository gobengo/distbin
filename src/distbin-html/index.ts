import { route, RoutePattern, RouteResponderFactory } from "../util";

import * as about from "./about";
import * as anActivity from "./an-activity";
import * as home from "./home";
import * as publicSection from "./public";

import { IncomingMessage, ServerResponse } from "http";

import { createLogger } from "../logger";
const logger = createLogger(__filename);

interface IDistbinHtmlHandlerOptions {
  apiUrl: string;
  externalUrl: string;
  internalUrl: string;
}

export const createHandler = ({
  apiUrl,
  externalUrl,
  internalUrl,
}: IDistbinHtmlHandlerOptions) => {
  const routes = new Map<RoutePattern, RouteResponderFactory>([
    [
      new RegExp("^/$"),
      () => home.createHandler({ apiUrl, externalUrl, internalUrl }),
    ],
    [new RegExp("^/about$"), () => about.createHandler({ externalUrl })],
    [
      new RegExp("^/public$"),
      () => publicSection.createHandler({ apiUrl, externalUrl }),
    ],
    [
      new RegExp("^/activities/([^/.]+)$"),
      (activityId: string) =>
        anActivity.createHandler({
          activityId,
          apiUrl,
          externalUrl,
          internalUrl,
        }),
    ],
  ]);
  return (req: IncomingMessage, res: ServerResponse) => {
    const handler = route(routes, req);
    if (!handler) {
      res.writeHead(404);
      res.end("404 Not Found");
      return;
    }
    Promise.resolve(
      (async () => {
        return handler(req, res);
      })(),
    ).catch(e => {
      res.writeHead(500);
      logger.error(e, e.stack);
      res.end("Error: " + e.stack);
    });
  };
};
