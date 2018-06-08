import { IncomingMessage, ServerResponse } from "http";
import { Activity, ASLink, ASObject, Collection, isActivity, JSONLD, LDObject, LDValue,
         LDValues, Place } from "./activitystreams/types";
export { Collection, Place, LDValue, LDValues, LDObject, JSONLD, ASLink, ASObject, Activity, isActivity }

type ISO8601 = string

export type HttpRequestResponder = (req: IncomingMessage, res: ServerResponse) => void;

export type Extendable<T> = T & {
    [key: string]: any,
}

// extra fields used by distbin
export class DistbinActivity extends Activity {
  public "http://www.w3.org/ns/prov#wasDerivedFrom"?: LDValue<object>
  public "distbin:activityPubDeliveryFailures"?: Error[]
}
export type ActivityMap = Map<string, Activity|DistbinActivity>

type mediaType = string
export class LinkPrefetchResult {
  public type: string
  public link: ASLink
  constructor(props: any) {
    this.type = this.constructor.name
    Object.assign(this, props)
  }
}
export class LinkPrefetchSuccess extends LinkPrefetchResult {
  public type: "LinkPrefetchSuccess"
  public published: ISO8601
  public supportedMediaTypes: mediaType[]
}
export class LinkPrefetchFailure extends LinkPrefetchResult {
  public type: "LinkPrefetchFailure"
  public error: {
       status?: number
       message: string,
    }
}
export class HasLinkPrefetchResult {
  public "https://distbin.com/ns/linkPrefetch"?: LinkPrefetchResult;
}
