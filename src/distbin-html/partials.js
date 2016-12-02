// HTML fragment that should appear in every page's <head> element
exports.everyPageHead = () => `
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
  body {
    font-family: Georgia, "Times New Roman", serif;
    margin: 0 auto;
    max-width: 42em;
  }
  .distbin-body-main {
    padding-left: 1em;    
    padding-right: 1em;    
  }
  p {
  }
  pre {
    max-width: 100%;
    overflow-x: auto;
  }
  </style>
`

// wrap page with common body template for distbin-html (e.g. header/footer)
exports.distbinBodyTemplate = (page) => `
  ${header()}
  <div class="distbin-body-main">
    ${page}
  </div>
`

function header() {
  return '';
  // todo
  return `
    <style>
    .distbin-header {
      padding: 1em;
    }
    </style>
    <header class="distbin-header">
      <a href="/">distbin</a>
    </header>
  `
}