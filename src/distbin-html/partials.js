// HTML fragment that should appear in every page's <head> element
exports.everyPageHead = () => `
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
    max-width: 100%;
    overflow: auto;
  }
  </style>
`
