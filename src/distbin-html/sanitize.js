const createDOMPurify = require('dompurify');
const jsdom = require('jsdom');
const window = jsdom.jsdom('', {
  features: {
    FetchExternalResources: false, // disables resource loading over HTTP / filesystem
    ProcessExternalResources: false // do not execute JS within script blocks
  }
}).defaultView;

const DOMPurify = createDOMPurify(window);

exports.sanitize = DOMPurify.sanitize.bind(DOMPurify);
