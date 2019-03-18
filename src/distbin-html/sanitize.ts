// tslint:disable:no-var-requires
const createDOMPurify = require("dompurify");
const jsdom = require("jsdom");
// tslint:enable:no-var-requires

const window = jsdom.jsdom("", {
  features: {
    FetchExternalResources: false, // disables resource loading over HTTP / filesystem
    ProcessExternalResources: false, // do not execute JS within script blocks
  },
}).defaultView;

const DOMPurify = createDOMPurify(window);

export const sanitize = DOMPurify.sanitize.bind(DOMPurify);

exports.toText = (html: string) => {
  return DOMPurify.sanitize(html, { ALLOWED_TAGS: ["#text"] });
};
