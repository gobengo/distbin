import { IncomingMessage, ServerResponse } from 'http'

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
}

type ISO8601 = string

export class Activity extends ASObject {
    bcc?: LDValue<ASObject> 
    cc?: LDValue<ASObject> 
    object?: LDValue<ASObject>
    to?: LDValue<ASObject>    
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
}

export class Collection<T> extends ASObject {
    items: T[]
    totalItems: number
}

export type HttpRequestResponder = (req: IncomingMessage, res: ServerResponse) => void

export type ActivityMap = Map<string, Activity>

type mediaType = string

export class LinkPrefetchResult {
    link: Link
}
export class LinkPrefetchSuccess extends LinkPrefetchResult {
  published: ISO8601
  supportedMediaTypes: mediaType[]
}
export class LinkPrefetchFailure extends LinkPrefetchResult {
  error: {
    status?: number
    message: string
  }
}
export class HasLinkPrefetchResult {
  'https://distbin.com/ns/linkPrefetch'?: LinkPrefetchResult
}
