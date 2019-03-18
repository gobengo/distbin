/// <reference types="node" />
// tslint:disable:no-var-requires
const jsonldRdfaParser = require("jsonld-rdfa-parser");
const jsonldLib = require("jsonld");
// tslint:enable:no-var-requires
jsonldLib.registerRDFParser("text/html", jsonldRdfaParser);
import * as assert from "assert";
import * as fs from "fs";
import { ClientRequestArgs } from "http";
import * as http from "http";
import * as https from "https";
import * as path from "path";
import * as url from "url";
import { Url, UrlObject } from "url";
import * as util from "util";
import { ASLink, HttpRequestResponder } from "./types";

import { createLogger } from "../src/logger";
const logger = createLogger("util");

/**
 * Return the 'first' item of the provided itemOrList.
 * i.e. if itemOrList is an array, return the zero-indexed item.
 * if itemOrList is not a collection, return itself
 */
export const first = (itemOrList: any) => {
  if (Array.isArray(itemOrList)) {
    return itemOrList[0];
  }
  return itemOrList;
};

export const request = (urlOrOptions: string | UrlObject) => {
  const options =
    typeof urlOrOptions === "string" ? url.parse(urlOrOptions) : urlOrOptions;
  switch (options.protocol) {
    case "https:":
      return https.request(urlOrOptions);
    case "http:":
      return http.request(urlOrOptions);
    default:
      throw new Error(`cannot create request for protocol ${options.protocol}`);
  }
};

export const debuglog = util.debuglog("distbin");

export const readableToString = (
  readable: NodeJS.ReadableStream,
): Promise<string> => {
  let body: string = "";
  return new Promise((resolve, reject) => {
    readable.on("error", reject);
    readable.on("data", (chunk: string) => {
      body += chunk;
      return body;
    });
    readable.on("end", () => resolve(body));
  });
};

export const requestUrl = (req: http.ServerRequest) =>
  `http://${req.headers.host}${req.url}`;

// given a map of strings/regexes to listener factories,
// return a matching route (or undefined if no match)
export type RoutePattern = string | RegExp;
export type RouteResponderFactory = (
  ...matches: string[]
) => HttpRequestResponder;
export const route = (
  routes: Map<RoutePattern, RouteResponderFactory>,
  req: http.ServerRequest,
) => {
  const pathname = url.parse(req.url).pathname;
  for (const [routePathname, createHandler] of routes.entries()) {
    if (typeof routePathname === "string") {
      // exact match
      if (pathname !== routePathname) {
        continue;
      }
      return createHandler();
    }
    if (routePathname instanceof RegExp) {
      const match = pathname.match(routePathname);
      if (!match) {
        continue;
      }
      return createHandler(...match.slice(1));
    }
  }
};

export const sendRequest = (
  r: http.ClientRequest,
): Promise<http.IncomingMessage> => {
  return new Promise((resolve, reject) => {
    r.once("response", resolve);
    r.once("error", reject);
    r.end();
  });
};

export async function followRedirects(
  requestOpts: ClientRequestArgs,
  maxRedirects = 5,
) {
  let redirectsLeft = maxRedirects;
  const initialUrl = url.format(requestOpts);
  const latestUrl = initialUrl;
  assert(latestUrl);
  logger.silly("followRedirects", latestUrl);

  let latestResponse = await sendRequest(request(requestOpts));
  /* eslint-disable no-labels */
  followRedirects: while (redirectsLeft > 0) {
    logger.debug("followRedirects got response", {
      statusCode: latestResponse.statusCode,
    });
    switch (latestResponse.statusCode) {
      case 301:
      case 302:
        const nextUrl = url.resolve(
          latestUrl,
          ensureArray(latestResponse.headers.location)[0],
        );
        logger.debug("followRedirects is following to", nextUrl);
        latestResponse = await sendRequest(
          request(
            Object.assign(url.parse(nextUrl), {
              headers: requestOpts.headers,
            }),
          ),
        );
        redirectsLeft--;
        continue followRedirects;
      default:
        return latestResponse;
    }
  }
  throw Object.assign(
    new Error(`Max redirects reached when requesting ${initialUrl}`),
    {
      redirects: maxRedirects - redirectsLeft,
      response: latestResponse,
    },
  );
}

const SURROGATE_PAIR_REGEXP = /[\uD800-\uDBFF][\uDC00-\uDFFF]/g;
// Match everything outside of normal chars and " (quote character)
const NON_ALPHANUMERIC_REGEXP = /([^#-~| |!])/g;
/**
 * Escapes all potentially dangerous characters, so that the
 * resulting string can be safely inserted into attribute or
 * element text.
 * @param value
 * @returns {string} escaped text
 */
export const encodeHtmlEntities = function encodeEntities(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(SURROGATE_PAIR_REGEXP, match => {
      const hi = match.charCodeAt(0);
      const low = match.charCodeAt(1);
      return "&#" + ((hi - 0xd800) * 0x400 + (low - 0xdc00) + 0x10000) + ";";
    })
    .replace(NON_ALPHANUMERIC_REGEXP, match => {
      return "&#" + match.charCodeAt(0) + ";";
    })
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
};

// given a function that accepts a "node-style" errback as its last argument, return
// a function that returns a promise instead
export const denodeify = util.promisify;

export const rdfaToJsonLd = async (html: string) => {
  return denodeify(jsonldLib.fromRDF)(html, { format: "text/html" });
  // // use it
  // jsonldLib.fromRDF(html, {format: 'text/html'}, function(err, data) {
};

export const isProbablyAbsoluteUrl = (someUrl: string): boolean => {
  const absoluteUrlPattern = new RegExp("^(?:[a-z]+:)?//", "i");
  return absoluteUrlPattern.test(someUrl);
};

export const ensureArray = <T>(itemOrItems: T | T[]): T[] =>
  itemOrItems instanceof Array ? itemOrItems : [itemOrItems];

export const flatten = <T>(listOfLists: T[][]): T[] =>
  listOfLists.reduce((flattened, list: T[]) => flattened.concat(list), []);

// given an http request, return a number that is the maximum number of results this client wants in this response
export const requestMaxMemberCount = (req: http.ServerRequest) => {
  const headerMatch = ensureArray(req.headers.prefer)
    .filter(Boolean)
    .map(header => header.match(/max-member-count="(\d+)"/))
    .filter(Boolean)[0];
  if (headerMatch) {
    return parseInt(headerMatch[1], 10);
  }
  // check querystring
  return parseInt(
    first(url.parse(req.url, true).query["max-member-count"]),
    10,
  );
};

export const createHttpOrHttpsRequest = (urlOrObj: string | UrlObject) => {
  const parsedUrl: UrlObject =
    typeof urlOrObj === "string" ? url.parse(urlOrObj) : urlOrObj;
  let createRequest;
  switch (parsedUrl.protocol) {
    case "https:":
      createRequest = https.request.bind(https);
      break;
    case "http:":
      createRequest = http.request.bind(http);
      break;
    default:
      const activityUrl = url.format(parsedUrl);
      throw new Error(
        "Can't fetch activity with unsupported protocol in URL (only http, https supported): " +
          activityUrl,
      );
  }
  return createRequest(urlOrObj);
};

// given a Link object or url string, return an href string that can be used to refer to it
export const linkToHref = (hrefOrLinkObj: ASLink | string) => {
  if (typeof hrefOrLinkObj === "string") {
    return hrefOrLinkObj;
  }
  if (typeof hrefOrLinkObj === "object") {
    return hrefOrLinkObj.href;
  }
  throw new Error("Unexpected link type: " + typeof hrefOrLinkObj);
};

jsonldLib.documentLoader = createCustomDocumentLoader();

export const jsonld = jsonldLib.promises;

type Errback = (err: Error, ...args: any[]) => void;

function createCustomDocumentLoader() {
  // define a mapping of context URL => context doc
  const CONTEXTS: { [key: string]: string } = {
    "https://www.w3.org/ns/activitystreams": fs.readFileSync(
      path.join(__dirname, "/as2context.json"),
      "utf8",
    ),
  };

  // grab the built-in node.js doc loader
  const nodeDocumentLoader = jsonldLib.documentLoaders.node();
  // or grab the XHR one: jsonldLib.documentLoaders.xhr()
  // or grab the jquery one: jsonldLib.documentLoaders.jquery()

  // change the default document loader using the callback API
  // (you can also do this using the promise-based API, return a promise instead
  // of using a callback)
  const customLoader = (someUrl: string, callback: Errback) => {
    if (someUrl in CONTEXTS) {
      return callback(null, {
        contextUrl: null, // this is for a context via a link header
        document: CONTEXTS[someUrl], // this is the actual document that was loaded
        documentUrl: someUrl, // this is the actual context URL after redirects
      });
    }
    // call the underlining documentLoader using the callback API.
    nodeDocumentLoader(someUrl, callback);
    /* Note: By default, the node.js document loader uses a callback, but
    browser-based document loaders (xhr or jquery) return promises if they
    are supported (or polyfilled) in the browser. This behavior can be
    controlled with the 'usePromise' option when constructing the document
    loader. For example: jsonldLib.documentLoaders.xhr({usePromise: false}); */
  };
  return customLoader;
}

export function assertNever(x: never): never {
  throw new Error("Unexpected object: " + x);
}

// Return new value for a JSON-LD object's value, appending to any existing one
export function jsonldAppend(oldVal: any, valToAppend: any[] | any) {
  valToAppend = Array.isArray(valToAppend) ? valToAppend : [valToAppend];
  let newVal;
  switch (typeof oldVal) {
    case "object":
      if (Array.isArray(oldVal)) {
        newVal = oldVal.concat(valToAppend);
      } else {
        newVal = [oldVal, ...valToAppend];
      }
      break;
    case "undefined":
      newVal = valToAppend;
      break;
    default:
      newVal = [oldVal, ...valToAppend];
      break;
  }
  return newVal;
}

export const makeErrorClass = (
  name: string,
  setUp?: (...args: any[]) => void,
) =>
  class extends Error {
    constructor(msg: string, ...args: any[]) {
      super(msg);
      this.message = msg;
      this.name = name;
      if (typeof setUp === "function") {
        setUp.apply(this, arguments);
      }
    }
  };
