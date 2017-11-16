import { IncomingMessage, ServerResponse } from 'http'
import { Collection, Place, LDValue, LDValues, LDObject, JSONLD, ASLink, ASObject, Activity, isActivity } from './activitystreams/types'
export { Collection, Place, LDValue, LDValues, LDObject, JSONLD, ASLink, ASObject, Activity, isActivity }

type ISO8601 = string

export type HttpRequestResponder = (req: IncomingMessage, res: ServerResponse) => void

export type Extendable<T> = T & {
    [key: string]: any
}

// extra fields used by distbin
export class DistbinActivity extends Activity {
  'http://www.w3.org/ns/prov#wasDerivedFrom'?: LDValue<object>
  'distbin:activityPubDeliveryFailures'?: Error[]
}
export type ActivityMap = Map<string, Activity|DistbinActivity>

type mediaType = string
export class LinkPrefetchResult {
  type: string
  link: ASLink
  constructor (props:any) {
    this.type = this.constructor.name
    Object.assign(this, props)
  }
}
export class LinkPrefetchSuccess extends LinkPrefetchResult {
  type: 'LinkPrefetchSuccess'
  published: ISO8601
  supportedMediaTypes: mediaType[]
}
export class LinkPrefetchFailure extends LinkPrefetchResult {
  type: 'LinkPrefetchFailure'
  error: {
       status?: number
       message: string
    }
}
export class HasLinkPrefetchResult {
  'https://distbin.com/ns/linkPrefetch'?: LinkPrefetchResult
}
