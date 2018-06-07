import * as assert from "assert"
import { testCli } from "../"
import * as AS2 from "../../src/activitystreams"
import { Activity, ASObject, Collection, Note, Place } from "../../src/activitystreams/types"
import { Extendable } from "../../src/types"

const tests = module.exports

tests["has types"] = () => {
  const example1: Activity = {
    "@context": "https://www.w3.org/ns/activitystreams",
    "summary": "A note",
    "type": "Note",
    "content": "My dog has fleas.",
  }
  const example2: Extendable<Activity> = {
    "@context": {
      "@vocab": "https://www.w3.org/ns/activitystreams",
      "ext": "https://canine-extension.example/terms/",
      "@language": "en",
    },
    "summary": "A note",
    "type": "Note",
    "content": "My dog has fleas.",
    "ext:nose": 0,
    "ext:smell": "terrible",
  }
  const example3: Extendable<Activity> = {
    "@context": [
      "https://www.w3.org/ns/activitystreams",
      {
        css: "http://www.w3.org/ns/oa#styledBy",
      },
    ],
    "summary": "A note",
    "type": "Note",
    "content": "My dog has fleas.",
    "css": "http://www.csszengarden.com/217/217.css?v=8may2013",
  }
  const example4: Activity = {
    "@context": "https://www.w3.org/ns/activitystreams",
    "summary": "Martin created an image",
    "type": "Create",
    "actor": "http://www.test.example/martin",
    "object": "http://example.org/foo.jpg",
  }
  const example5: Activity = {
    "@context": "https://www.w3.org/ns/activitystreams",
    "summary": "Martin added an article to his blog",
    "type": "Add",
    "published": "2015-02-10T15:04:55Z",
    "actor": {
      type: "Person",
      id: "http://www.test.example/martin",
      name: "Martin Smith",
      url: "http://example.org/martin",
      image: {
        type: "Link",
        href: "http://example.org/martin/image.jpg",
        mediaType: "image/jpeg",
      },
    },
    "object": {
      id: "http://www.test.example/blog/abc123/xyz",
      type: "Article",
      url: "http://example.org/blog/2011/02/entry",
      name: "Why I love Activity Streams",
    },
    "target": {
      id: "http://example.org/blog/",
      type: "OrderedCollection",
      name: "Martin's Blog",
    },
  }
  const example6: Collection<Activity> = {
    "@context": "https://www.w3.org/ns/activitystreams",
    "summary": "Martin's recent activities",
    "type": "Collection",
    "totalItems": 1,
    "items": [
      {
        type: "Add",
        published: "2011-02-10T15:04:55Z",
        generator: "http://example.org/activities-app",
        nameMap: {
          en: "Martin added a new image to his album.",
          ga: "Martin phost le fisean nua a albam.",
        },
        actor: {
          type: "Person",
          id: "http://www.test.example/martin",
          name: "Martin Smith",
          url: "http://example.org/martin",
          image: {
            type: "Link",
            href: "http://example.org/martin/image",
            mediaType: "image/jpeg",
            width: 250,
            height: 250,
          },
        },
        object: {
          name: "My fluffy cat",
          type: "Image",
          id: "http://example.org/album/máiréad.jpg",
          preview: {
            type: "Link",
            href: "http://example.org/album/máiréad.jpg",
            mediaType: "image/jpeg",
          },
          url: [
            {
              type: "Link",
              href: "http://example.org/album/máiréad.jpg",
              mediaType: "image/jpeg",
            },
            {
              type: "Link",
              href: "http://example.org/album/máiréad.png",
              mediaType: "image/png",
            },
          ],
        },
        target: {
          type: "Collection",
          id: "http://example.org/album/",
          nameMap: {
            en: "Martin's Photo Album",
            ga: "Grianghraif Mairtin",
          },
          image: {
            type: "Link",
            href: "http://example.org/album/thumbnail.jpg",
            mediaType: "image/jpeg",
          },
        },
      },
    ],
  }
  const example7: Activity = {
    "@context": "https://www.w3.org/ns/activitystreams",
    "id": "http://example.org/foo",
    "type": "Note",
    "name": "My favourite stew recipe",
    "attributedTo": {
      id: "http://joe.website.example/",
      type: "Person",
      name: "Joe Smith",
    },
    "published": "2014-08-21T12:34:56Z",
  }
  const example8: Extendable<Place> = {
    "@context": [
      "https://www.w3.org/ns/activitystreams",
      {
        gr: "http://purl.org/goodrelations/v1#",
      },
    ],
    "type": ["Place", "gr:Location"],
    "name": "Sally's Restaurant",
    "longitude": 12.34,
    "latitude": 56.78,
    "gr:category": "restaurants/french_restaurants",
  }
  const example9: Note = {
    "@context": "https://www.w3.org/ns/activitystreams",
    "type": "Note",
    "id": "http://example.org/note/123",
    "name": "Our Weather Is Fine",
    "content": "I feel that the weather is appropriate to our season and location.",
  }
  const example10: Note = {
    "@context": "https://www.w3.org/ns/activitystreams",
    "type": "Note",
    "id": "http://example.org/note/124",
    "summary": "A note by Sally",
    "content": "Everything is OK here.",
  }
  const example11: ASObject = {
    "@context": "https://www.w3.org/ns/activitystreams",
    "type": "Application",
    "id": "http://example.org/application/123",
    "name": "Exampletron 3000",
    "image": "http://example.org/application/123.png",
  }
  const example12: ASObject = {
    "@context": "https://www.w3.org/ns/activitystreams",
    "type": "Application",
    "id": "http://example.org/application/123",
    "name": "Exampletron 3000",
    "image": {
      type: "Link",
      href: "http://example.org/application/123.png",
      mediaType: "image/png",
    },
  }
  const example13: ASObject = {
    "@context": "https://www.w3.org/ns/activitystreams",
    "type": "Application",
    "id": "http://example.org/application/123",
    "name": "Exampletron 3000",
    "image": [
      "http://example.org/application/abc.gif",
      {
        type: "Link",
        href: "http://example.org/application/123.png",
        mediaType: "image/png",
      },
    ],
  }
  const example14: ASObject = {
    "@context": "https://www.w3.org/ns/activitystreams",
    "type": "Application",
    "id": "http://example.org/application/123",
    "name": "Exampletron 3000",
    "image": [
      "http://example.org/application/abc.gif",
      {
        type: "Link",
        href: "http://example.org/application/123.png",
        mediaType: "image/png",
        rel: "thumbnail",
      },
    ],
  }
  const example15: Extendable<Activity> = {
    "@context": [
      "https://www.w3.org/ns/activitystreams",
      {vcard: "http://www.w3.org/2006/vcard/ns#"},
    ],
    "summary": "Sally created a note",
    "type": "Create",
    "actor": {
      "type": ["Person", "vcard:Individual"],
      "id": "http://sally.example.org",
      "name": "Sally Smith",
      "vcard:given-name": "Sally",
      "vcard:family-name": "Smith",
    },
    "object": {
      type: "Note",
      content: "This is a simple note",
    },
  }
  const example16: Activity = {
    "@context": "https://www.w3.org/ns/activitystreams",
    "summary": "Joe liked a note",
    "type": "Like",
    "id": "http://www.test.example/activity/1",
    "actor": "http://example.org/profiles/joe",
    "object": "http://example.com/notes/1",
    "published": "2014-09-30T12:34:56Z",
  }
  const example17: Activity = {
    "@context": "https://www.w3.org/ns/activitystreams",
    "summary": "Joe liked a note",
    "type": ["Like", "http://schema.org/LikeAction"],
    "id": "http://www.test.example/activity/1",
    "actor": "http://example.org/profiles/joe",
    "object": "http://example.com/notes/1",
    "published": "2014-09-30T12:34:56Z",
  }

  const example32: Collection<Extendable<Activity>> = {
    "@context": [
      "https://www.w3.org/ns/activitystreams",
      {
        "oa": "http://www.w3.org/ns/oa#",
        "prov": "http://www.w3.org/ns/prov#",
        "dcterms": "http://purl.org/dc/terms/",
        "dcterms:created": {
          "@id": "dcterms:created",
          "@type": "xsd:dateTime",
        },
      },
    ],
    "summary": "Editing history of a note",
    "type": "Collection",
    "items": [
      {
        id: "http://example.org/activity/20150101000000",
        type: [ "Create", "prov:Activity" ],
        actor: {
          id: "http://example.org/#eric",
          name: "Eric",
        },
        summary: "Eric wrote a note.",
        object: {
          id: "http://example.org/entry/20150101000000",
          type: [ "Note", "prov:Entity" ],
          attributedTo: "http://example.org/#eric",
          content: "Remember... all I'm offering is the trooth. Nothing more.",
        },
        published: "2015-01-01T00:00:00Z",
      },
      {
        "id": "http://example.org/activity/20150101000059",
        "type": [ "Update", "prov:Activity", "oa:Annotation" ],
        "summary": "Eric edited a note.",
        "dcterms:created": "2015-01-01T00:00:59Z",
        "dcterms:creator": { "@id": "http://example.org/#eric" },
        "oa:hasBody": {
          "id": "http://example.org/entry/20150101000059",
          "type": [ "Note", "prov:Entity" ],
          "content": "Remember... all I'm offering is the truth. Nothing more.",
          "prov:wasAttributedTo": { "@id": "http://example.org/#eric" },
          "prov:wasRevisionOf": { "@id": "http://example.org/entry/20150101000000" },
        },
        "oa:hasTarget": { "@id": "http://example.org/entry/20150101000000" },
        "oa:motivatedBy": { "@id": "oa:editing" },
        "prov:generated": { "@id": "http://example.org/entry/20150101000059" },
        "prov:wasInformedBy": { "@id": "http://example.org/activity/20150101000000" },
      },
      {
        id: "http://example.org/activity/20150101010101",
        type: [ "Delete", "prov:Activity" ],
        actor: "http://example.org/#eric",
        summary: "Eric deleted a note.",
        object: "http://example.org/entry/20150101000059",
        published: "2015-01-01T01:01:01Z",
      },
    ],
  }
}

if (require.main === module) {
  testCli(tests)
}
