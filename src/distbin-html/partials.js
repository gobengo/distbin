// HTML fragment that should appear in every page's <head> element
exports.everyPageHead = () => `
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
  html {
    font-family: Georgia, "Times New Roman", serif;
    font-size: 18px;
    line-height: 1.5em;
  }
  body {
    margin: 0 auto;
    max-width: 42em;
    padding: 2em;
  }
  pre {
    line-height: 1em;
    max-width: 100%;
    overflow-x: auto;
  }
  </style>
`
