import * as assert from "assert"
import { testCli } from "../"
import * as AS2 from "../../src/activitystreams"
import { Activity, ASObject, Collection, Note, Place } from "../../src/activitystreams/types"
import { Extendable } from "../../src/types"

const tests = module.exports

tests["has types"] = () => {
  const example1: Activity = {
    "@context": "https://www.w3.org/ns/activitystreams",
    "content": "My dog has fleas.",
    "summary": "A note",
    "type": "Note",
  }
  const example2: Extendable<Activity> = {
    "@context": {
      "@language": "en",
      "@vocab": "https://www.w3.org/ns/activitystreams",
      "ext": "https://canine-extension.example/terms/",
    },
    "content": "My dog has fleas.",
    "ext:nose": 0,
    "ext:smell": "terrible",
    "summary": "A note",
    "type": "Note",
  }
  const example3: Extendable<Activity> = {
    "@context": [
      "https://www.w3.org/ns/activitystreams",
      {
        css: "http://www.w3.org/ns/oa#styledBy",
      },
    ],
    "content": "My dog has fleas.",
    "css": "http://www.csszengarden.com/217/217.css?v=8may2013",
    "summary": "A note",
    "type": "Note",
  }
  const example4: Activity = {
    "@context": "https://www.w3.org/ns/activitystreams",
    "actor": "http://www.test.example/martin",
    "object": "http://example.org/foo.jpg",
    "summary": "Martin created an image",
    "type": "Create",
  }
  const example5: Activity = {
    "@context": "https://www.w3.org/ns/activitystreams",
    "actor": {
      id: "http://www.test.example/martin",
      image: {
        href: "http://example.org/martin/image.jpg",
        mediaType: "image/jpeg",
        type: "Link",
      },
      name: "Martin Smith",
      type: "Person",
      url: "http://example.org/martin",
    },
    "object": {
      id: "http://www.test.example/blog/abc123/xyz",
      name: "Why I love Activity Streams",
      type: "Article",
      url: "http://example.org/blog/2011/02/entry",
    },
    "published": "2015-02-10T15:04:55Z",
    "summary": "Martin added an article to his blog",
    "target": {
      id: "http://example.org/blog/",
      name: "Martin's Blog",
      type: "OrderedCollection",
    },
    "type": "Add",
  }
  const example6: Collection<Activity> = {
    "@context": "https://www.w3.org/ns/activitystreams",
    "items": [
      {
        actor: {
          id: "http://www.test.example/martin",
          image: {
            height: 250,
            href: "http://example.org/martin/image",
            mediaType: "image/jpeg",
            type: "Link",
            width: 250,
          },
          name: "Martin Smith",
          type: "Person",
          url: "http://example.org/martin",
        },
        generator: "http://example.org/activities-app",
        nameMap: {
          en: "Martin added a new image to his album.",
          ga: "Martin phost le fisean nua a albam.",
        },
        object: {
          id: "http://example.org/album/máiréad.jpg",
          name: "My fluffy cat",
          preview: {
            href: "http://example.org/album/máiréad.jpg",
            mediaType: "image/jpeg",
            type: "Link",
          },
          type: "Image",
          url: [
            {
              href: "http://example.org/album/máiréad.jpg",
              mediaType: "image/jpeg",
              type: "Link",
            },
            {
              href: "http://example.org/album/máiréad.png",
              mediaType: "image/png",
              type: "Link",
            },
          ],
        },
        published: "2011-02-10T15:04:55Z",
        target: {
          id: "http://example.org/album/",
          image: {
            href: "http://example.org/album/thumbnail.jpg",
            mediaType: "image/jpeg",
            type: "Link",
          },
          nameMap: {
            en: "Martin's Photo Album",
            ga: "Grianghraif Mairtin",
          },
          type: "Collection",
        },
        type: "Add",
      },
    ],
    "summary": "Martin's recent activities",
    "totalItems": 1,
    "type": "Collection",
  }
  const example7: Activity = {
    "@context": "https://www.w3.org/ns/activitystreams",
    "attributedTo": {
      id: "http://joe.website.example/",
      name: "Joe Smith",
      type: "Person",
    },
    "id": "http://example.org/foo",
    "name": "My favourite stew recipe",
    "published": "2014-08-21T12:34:56Z",
    "type": "Note",
  }
  const example8: Extendable<Place> = {
    "@context": [
      "https://www.w3.org/ns/activitystreams",
      {
        gr: "http://purl.org/goodrelations/v1#",
      },
    ],
    "gr:category": "restaurants/french_restaurants",
    "latitude": 56.78,
    "longitude": 12.34,
    "name": "Sally's Restaurant",
    "type": ["Place", "gr:Location"],
  }
  const example9: Note = {
    "@context": "https://www.w3.org/ns/activitystreams",
    "content": "I feel that the weather is appropriate to our season and location.",
    "id": "http://example.org/note/123",
    "name": "Our Weather Is Fine",
    "type": "Note",
  }
  const example10: Note = {
    "@context": "https://www.w3.org/ns/activitystreams",
    "content": "Everything is OK here.",
    "id": "http://example.org/note/124",
    "summary": "A note by Sally",
    "type": "Note",
  }
  const example11: ASObject = {
    "@context": "https://www.w3.org/ns/activitystreams",
    "id": "http://example.org/application/123",
    "image": "http://example.org/application/123.png",
    "name": "Exampletron 3000",
    "type": "Application",
  }
  const example12: ASObject = {
    "@context": "https://www.w3.org/ns/activitystreams",
    "id": "http://example.org/application/123",
    "image": {
      href: "http://example.org/application/123.png",
      mediaType: "image/png",
      type: "Link",
    },
    "name": "Exampletron 3000",
    "type": "Application",
  }
  const example13: ASObject = {
    "@context": "https://www.w3.org/ns/activitystreams",
    "id": "http://example.org/application/123",
    "image": [
      "http://example.org/application/abc.gif",
      {
        href: "http://example.org/application/123.png",
        mediaType: "image/png",
        type: "Link",
      },
    ],
    "name": "Exampletron 3000",
    "type": "Application",
  }
  const example14: ASObject = {
    "@context": "https://www.w3.org/ns/activitystreams",
    "id": "http://example.org/application/123",
    "image": [
      "http://example.org/application/abc.gif",
      {
        href: "http://example.org/application/123.png",
        mediaType: "image/png",
        rel: "thumbnail",
        type: "Link",
      },
    ],
    "name": "Exampletron 3000",
    "type": "Application",
  }
  const example15: Extendable<Activity> = {
    "@context": [
      "https://www.w3.org/ns/activitystreams",
      {vcard: "http://www.w3.org/2006/vcard/ns#"},
    ],
    "actor": {
      "id": "http://sally.example.org",
      "name": "Sally Smith",
      "type": ["Person", "vcard:Individual"],
      "vcard:family-name": "Smith",
      "vcard:given-name": "Sally",
    },
    "object": {
      content: "This is a simple note",
      type: "Note",
    },
    "summary": "Sally created a note",
    "type": "Create",
  }
  const example16: Activity = {
    "@context": "https://www.w3.org/ns/activitystreams",
    "actor": "http://example.org/profiles/joe",
    "id": "http://www.test.example/activity/1",
    "object": "http://example.com/notes/1",
    "published": "2014-09-30T12:34:56Z",
    "summary": "Joe liked a note",
    "type": "Like",
  }
  const example17: Activity = {
    "@context": "https://www.w3.org/ns/activitystreams",
    "actor": "http://example.org/profiles/joe",
    "id": "http://www.test.example/activity/1",
    "object": "http://example.com/notes/1",
    "published": "2014-09-30T12:34:56Z",
    "summary": "Joe liked a note",
    "type": ["Like", "http://schema.org/LikeAction"],
  }

  const example32: Collection<Extendable<Activity>> = {
    "@context": [
      "https://www.w3.org/ns/activitystreams",
      {
        "dcterms": "http://purl.org/dc/terms/",
        "dcterms:created": {
          "@id": "dcterms:created",
          "@type": "xsd:dateTime",
        },
        "oa": "http://www.w3.org/ns/oa#",
        "prov": "http://www.w3.org/ns/prov#",
      },
    ],
    "items": [
      {
        actor: {
          id: "http://example.org/#eric",
          name: "Eric",
        },
        id: "http://example.org/activity/20150101000000",
        object: {
          attributedTo: "http://example.org/#eric",
          content: "Remember... all I'm offering is the trooth. Nothing more.",
          id: "http://example.org/entry/20150101000000",
          type: [ "Note", "prov:Entity" ],
        },
        published: "2015-01-01T00:00:00Z",
        summary: "Eric wrote a note.",
        type: [ "Create", "prov:Activity" ],
      },
      {
        "dcterms:created": "2015-01-01T00:00:59Z",
        "dcterms:creator": { "@id": "http://example.org/#eric" },
        "id": "http://example.org/activity/20150101000059",
        "oa:hasBody": {
          "content": "Remember... all I'm offering is the truth. Nothing more.",
          "id": "http://example.org/entry/20150101000059",
          "prov:wasAttributedTo": { "@id": "http://example.org/#eric" },
          "prov:wasRevisionOf": { "@id": "http://example.org/entry/20150101000000" },
          "type": [ "Note", "prov:Entity" ],
        },
        "oa:hasTarget": { "@id": "http://example.org/entry/20150101000000" },
        "oa:motivatedBy": { "@id": "oa:editing" },
        "prov:generated": { "@id": "http://example.org/entry/20150101000059" },
        "prov:wasInformedBy": { "@id": "http://example.org/activity/20150101000000" },
        "summary": "Eric edited a note.",
        "type": [ "Update", "prov:Activity", "oa:Annotation" ],
      },
      {
        actor: "http://example.org/#eric",
        id: "http://example.org/activity/20150101010101",
        object: "http://example.org/entry/20150101000059",
        published: "2015-01-01T01:01:01Z",
        summary: "Eric deleted a note.",
        type: [ "Delete", "prov:Activity" ],
      },
    ],
    "summary": "Editing history of a note",
    "type": "Collection",

  }
}

if (require.main === module) {
  testCli(tests)
}
