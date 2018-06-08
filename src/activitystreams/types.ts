type ISO8601 = string;
type xsdAnyUri = string;

type OneOrMore<T> = T | T[];

// ASLinked Data
type LDIdentifier = xsdAnyUri;
export type LDValue<T> = (LDIdentifier | T);
export type LDValues<T> = T | T[];
export type LDObject<T> = {
    [P in keyof T]?: LDValues<T[P]>;
};
type JSONLDContext = OneOrMore<string | {
    "@vocab"?: string
    "@language"?: string
    [key: string]: string | {[key: string]: string},
}>;
export class JSONLD {
  public "@id": string;
}

class ASBase {
  public "@context"?: JSONLDContext;
}

// @TODO (bengo): enumerate known values?
type LinkRelation = string;

export class ASLink {
  public type: ASObjectType<"Link">;
  public href: string;
  public mediaType?: string;
  public rel?: LinkRelation;
}
export const Link = ASLink

export const isASLink = (obj: any): obj is ASLink => {
  return obj.type === "Link";
}

// @TODO (bengo)
type RdfLangString = string
interface INaturalLanguageValue {
    // @TODO (bengo) this could be more specific about keys than just string
    [key: string]: string
}

type ASObjectType<T> = T | T[]
export type ASValue = string | ASObject | ASLink
// W3C ActivityStreams 2.0
export class ASObject extends ASBase {
  public attachment?: OneOrMore<ASObject|ASLink>
  public attributedTo?: LDValue<ASObject>
  public bcc?: LDValue<ASObject>
  public cc?: OneOrMore<LDValue<ASObject>>
  public content?: string
  public generator?: LDValue<ASObject>
  public id?: string
  public image?: OneOrMore<string|ASLink|ASImage>
  public inReplyTo?: LDValue<ASObject>
  public location?: ASObject
  public name?: string
  public nameMap?: INaturalLanguageValue
  public preview?: ASValue
  public published?: ISO8601
  public replies?: LDValue<Collection<ASObject>>
  public summary?: string|RdfLangString
  public tag?: ASObject|ASLink
  public to?: LDValue<ASObject>
  public bto?: LDValue<ASObject>
  public type?: ASObjectType<string>
  public url?: OneOrMore<xsdAnyUri|ASLink>
}

export const isASObject = (obj: any): obj is ASObject => {
  return typeof obj === "object"
}

class ASImage extends ASObject {}

// https://www.w3.org/TR/activitystreams-vocabulary/#activity-types
export const activitySubtypes = [
  "Accept", "Add", "Announce", "Arrive", "Block", "Create", "Delete",
  "Dislike", "Flag", "Follow", "Ignore", "Invite", "Join", "Leave", "Like",
  "Listen", "Move", "Offer", "Question", "Reject", "Read", "Remove",
  "TentativeReject", "TentativeAccept", "Travel", "Undo", "Update", "View",
]
const ActivitySubtypes = strEnum(activitySubtypes)
type ActivitySubtype = keyof typeof ActivitySubtypes

export class Activity extends ASObject {
  public type: ASObjectType<"Activity" | ActivitySubtype>
  public actor?: ASValue
  public object?: LDValue<ASObject>
  public target?: ASValue
  constructor(props: any) {
    super()
    this.type = this.constructor.name
    Object.assign(this, props)
  }
}

export const isActivity = (activity: any): activity is Activity => {
  if (typeof activity === "object") {
    return activitySubtypes.includes(activity.type)
  }
  return false
}

export class Collection<T> extends ASObject {
  public items?: T[]
  public totalItems?: number
}

export class Note extends ASObject {
  public type: ASObjectType<"Note">
}

export class Place extends ASObject {
  public accuracy?: number
  public latitude?: number
  public longitude?: number
  public altitude?: number
  public radius?: number
  public units?: "cm" | "feet" | "inches" | "km" | "m" | "miles" | xsdAnyUri
}

function strEnum<T extends string>(o: T[]): {[K in T]: K} {
  return o.reduce((res, key) => {
    res[key] = key
    return res
  }, Object.create(null))
}
