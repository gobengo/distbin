const { distbinBodyTemplate } = require('./partials')
const { sendRequest } = require('../util')
const { encodeHtmlEntities } = require('../util')
const { readableToString } = require('../util')
const http = require('http')


exports.createHandler = function ({ apiUrl }) {
  return async function(req, res) {
    res.writeHead(200)
    res.end(distbinBodyTemplate(`
 			${await createPublicBody({ apiUrl })}
    `))
  }
}

async function createPublicBody ({ apiUrl }) {
	const msg = `
		<h2>Public Activity</h2>
		<p>Fetched from <a href="/activitypub/public">/activitypub/public</a></p>
		<pre>${
		encodeHtmlEntities(
		  // #TODO: discover /public url via HATEOAS
		  await readableToString(await sendRequest(http.request(apiUrl + '/activitypub/public')))
		)
		// linkify values of 'url' property (quotes encode to &#34;)
		.replace(/&#34;url&#34;: &#34;(.+?)(?=&#34;)&#34;/g, '&#34;url&#34;: &#34;<a href="$1">$1</a>&#34;')
		}</pre>
	`
	return msg;
}