// HTML fragment that should appear in every page's <head> element
exports.everyPageHead = () => `
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
  body {
    font-family: Georgia, "Times New Roman", serif;
    margin: 0 auto;
    max-width: 42em;
    padding: 1em;
  }
  .distbin-main {  
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
  <head>
    ${exports.everyPageHead()}
  </head>
  ${header()}
  <div class="distbin-main">
    ${page}
  </div>
`

function header() {
  // todo
  return `
    <style>
    html { 
      box-sizing: border-box;
    }
    .distbin-header {
      display: table;
      width: 100%;
    }
      .distbin-header a {
        text-decoration: none;
      }

      .distbin-header-section {
        display: table-cell;
        vertical-align: top;
      }
      .distbin-header-section.right {
        text-align: right;
      }
       .distbin-header-section.right .distbin-header-item {
        text-align: right;
      }
      .distbin-header-item {
      }
      .distbin-header .distbin-header-item.name {
        font-weight: bold
      }
    </style>
    <header class="distbin-header">
      <div class="distbin-header-section left">
        <a href="/" class="distbin-header-item name">distbin</a>
      </div>
      <div class="distbin-header-section right">
        <a href="/about" class="distbin-header-item about">about</a>
      </div>
    </header>
  `
}