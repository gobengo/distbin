import { IncomingMessage, ServerResponse } from 'http'

function strEnum<T extends string>(o: Array<T>): {[K in T]: K} {
    return o.reduce((res, key) => {
      res[key] = key;
      return res;
    }, Object.create(null));
}

// https://www.w3.org/TR/activitystreams-vocabulary/#activity-types
export const activitySubtypes = [
    'Accept', 'Add', 'Announce', 'Arrive', 'Block', 'Create', 'Delete',
    'Dislike', 'Flag', 'Follow', 'Ignore', 'Invite', 'Join', 'Leave', 'Like',
    'Listen', 'Move', 'Offer', 'Question', 'Reject', 'Read', 'Remove',
    'TentativeReject', 'TentativeAccept', 'Travel', 'Undo', 'Update', 'View'
]

const ActivitySubtypes = strEnum(activitySubtypes)
type ActivitySubtype = keyof typeof ActivitySubtypes

export type xsdAnyUri = string

type LDIdentifier = xsdAnyUri

export type LDValue<T> = (LDIdentifier | T)

export type LDValues<T> = T | T[]

export type LDObject<T> = {
    [P in keyof T]?: LDValues<T[P]>;
}

export class JSONLD {
    '@id': string
}

export class Link {
    type: 'Link'
    href: string
}

export type Extendable<T> = T & {
    [key: string]: any
}

export class ASObject {
    attachment?: ASObject
    attributedTo?: LDValue<ASObject>    
    content?: string    
    generator?: LDValue<ASObject>    
    inReplyTo?: LDValue<ASObject>
    id?: string
    location?: ASObject    
    name?: string
    published?: ISO8601    
    replies?: LDValue<Collection<ASObject>>
    tag?: ASObject|Link    
    type?: string    
    url?: string

    bcc?: LDValue<ASObject> 
    cc?: LDValue<ASObject> 
    to?: LDValue<ASObject>
}

type ISO8601 = string

export class Activity extends ASObject {
    type: 'Activity' | ActivitySubtype
    object?: LDValue<ASObject>
    constructor (props:any) {
        super()
        this.type = this.constructor.name
        Object.assign(this, props)
    }
}

export const isActivity = (activity: any): activity is Activity => {
    if (typeof activity === 'object') {
        return activitySubtypes.includes(activity.type)
    }
    return false
}

export class Place extends ASObject {
    accuracy?: number
    latitude?: number
    longitude?: number
    altitude?: number
    radius?: number
    units?: "cm" | "feet" | "inches" | "km" | "m" | "miles" | xsdAnyUri
}

// extra fields used by distbin
export class DistbinActivity extends Activity {
    'http://www.w3.org/ns/prov#wasDerivedFrom'?: LDValue<object>
    'distbin:activityPubDeliveryFailures'?: Error[]
}

export class Collection<T> extends ASObject {
    items: T[]
    totalItems: number
}

export type HttpRequestResponder = (req: IncomingMessage, res: ServerResponse) => void

export type ActivityMap = Map<string, Activity|DistbinActivity>

type mediaType = string

export class LinkPrefetchResult {
    type: string
    link: Link
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
