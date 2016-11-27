// HTML fragment that should appear in every page's <head> element
exports.everyPageHead = () => `
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
  body {
    font-family: Georgia, "Times New Roman", serif;
    margin: 0 auto;
    max-width: 42em;
    padding: 2em;
  }
  p {
  }
  pre {
    max-width: 100%;
    overflow-x: auto;
  }
  </style>
`
