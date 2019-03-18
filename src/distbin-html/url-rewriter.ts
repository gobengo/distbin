import { debuglog } from "../util";

export function internalUrlRewriter(internalUrl: string, externalUrl: string) {
  debuglog("internalUrlRewriter", { internalUrl, externalUrl });
  if (internalUrl && externalUrl) {
    return (urlToRewrite: string) =>
      urlToRewrite.replace(externalUrl, internalUrl);
  }
  return (urlToRewrite: string) => urlToRewrite;
}
