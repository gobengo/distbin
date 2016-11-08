const http = require('http')
const { encodeHtmlEntities, readableToString, sendRequest } = require('../util')

const { everyPageHead } = require('./partials')

// create handler to to render a single activity to a useful page
exports.createHandler = ({apiUrl, activityId}) => {
  return async function (req, res) {
    const activityRes = await sendRequest(http.request(apiUrl + req.url))
    if (activityRes.statusCode !== 200) {
      // proxy
      res.writeHead(activityRes.statusCode)
      activityRes.pipe(res, { end: true }).on('finish', res.end)
      return
    }
    const activity = JSON.parse(await readableToString(activityRes))
    res.writeHead(200)
    res.end(`
      <!doctype html>
      <head>
        ${everyPageHead()}
      </head>
      <article>
        ${activity.object.name
          ? `<h1>${activity.object.name}</h1>`
          : ''}
        <main>${encodeHtmlEntities(activity.object.content)}</main>
        ${/* TODO format published datetime, add byline */''}
        <p>at ${activity.published}</p>
      </article>
      <details>
        <summary>Raw</summary>
        <pre><code>${encodeHtmlEntities(JSON.stringify(activity, null, 2))}</code></pre>
      </details>
    `)
  }
}
