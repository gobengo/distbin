type ISO8601 = string
type xsdAnyUri = string

type OneOrMore<T> = T | T[]

// ASLinked Data
type LDIdentifier = xsdAnyUri
export type LDValue<T> = (LDIdentifier | T)
export type LDValues<T> = T | T[]
export type LDObject<T> = {
    [P in keyof T]?: LDValues<T[P]>;
}
type JSONLDContext = OneOrMore<string | {
    '@vocab'?: string
    '@language'?: string
    [key:string]: string | {[key:string]: string}
}>
export class JSONLD {
  '@id': string
}

class ASBase {
  '@context'?: JSONLDContext
}

// @TODO (bengo): enumerate known values?
type LinkRelation = string

export class ASLink {
  type: ASObjectType<'Link'>
  href: string
  mediaType?: string
  rel?: LinkRelation
}
export const Link = ASLink

export const isASLink = (obj: any): obj is ASLink => {
  return obj.type === 'Link'
}

// @TODO (bengo)
type RdfLangString = string
type NaturalLanguageValue = {
    // @TODO (bengo) this could be more specific about keys than just string
    [key: string]: string
}

type ASObjectType<T> = T | [T]
export type ASValue = string | ASObject | ASLink
// W3C ActivityStreams 2.0
export class ASObject extends ASBase {
  attachment?: ASObject
  attributedTo?: LDValue<ASObject>
  bcc?: LDValue<ASObject>
  cc?: OneOrMore<LDValue<ASObject>>
  content?: string
  generator?: LDValue<ASObject>
  id?: string
  image?: OneOrMore<string|ASLink|ASImage>
  inReplyTo?: LDValue<ASObject>
  location?: ASObject
  name?: string
  nameMap?: NaturalLanguageValue
  preview?: ASValue
  published?: ISO8601
  replies?: LDValue<Collection<ASObject>>
  summary?: string|RdfLangString
  tag?: ASObject|ASLink
  to?: LDValue<ASObject>
  bto?: LDValue<ASObject>
  type?: ASObjectType<string>
  url?: OneOrMore<ASValue>
}

export const isASObject = (obj: any): obj is ASObject => {
  return typeof obj === 'object'
}

class ASImage extends ASObject {}

// https://www.w3.org/TR/activitystreams-vocabulary/#activity-types
export const activitySubtypes = [
  'Accept', 'Add', 'Announce', 'Arrive', 'Block', 'Create', 'Delete',
  'Dislike', 'Flag', 'Follow', 'Ignore', 'Invite', 'Join', 'Leave', 'Like',
  'Listen', 'Move', 'Offer', 'Question', 'Reject', 'Read', 'Remove',
  'TentativeReject', 'TentativeAccept', 'Travel', 'Undo', 'Update', 'View'
]
const ActivitySubtypes = strEnum(activitySubtypes)
type ActivitySubtype = keyof typeof ActivitySubtypes

export class Activity extends ASObject {
  type: ASObjectType<'Activity' | ActivitySubtype>
  actor?: ASValue
  object?: LDValue<ASObject>
  target?: ASValue
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

export class Collection<T> extends ASObject {
  items?: T[]
  totalItems?: number
}

export class Note extends ASObject {
  type: ASObjectType<'Note'>
}

export class Place extends ASObject {
  accuracy?: number
  latitude?: number
  longitude?: number
  altitude?: number
  radius?: number
  units?: 'cm' | 'feet' | 'inches' | 'km' | 'm' | 'miles' | xsdAnyUri
}

function strEnum<T extends string> (o: Array<T>): {[K in T]: K} {
  return o.reduce((res, key) => {
    res[key] = key
    return res
  }, Object.create(null))
}
