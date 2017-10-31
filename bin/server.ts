#!/usr/bin/env node
import * as http from "http";
import {IncomingMessage, ServerRequest, ServerResponse, Server} from 'http'
const distbin = require('../');
const fs = require('fs')
const path = require('path')
const querystring = require('querystring')
const os = require('os')
const url = require('url')
const { JSONFileMapAsync } = require('../src/filemap');

const distbinHtml= require('../src/distbin-html')
const { debuglog, denodeify, readableToString, sendRequest } = require('../src/util');

// Run tests if this file is executed
if (require.main === module) {
  process.on('unhandledRejection', err => {
  	console.error("Unhandled Promise rejection")
  	console.trace(err)
  	throw err;
  })
  runServer()
    .then(() => process.exit())
    .catch((err) => {
    	console.error("Uncaught Error in runServer")
    	console.trace(err)
    	process.exit(1)
    })
}

async function runServer() {
	Object.keys({
	  'SIGINT': 2,
	  'SIGTERM': 15
	}).forEach(function (signal: NodeJS.Signals) {
	  process.on(signal, function () {
	  	process.exit()
	  });
	});

	const externalUrl = process.env.EXTERNAL_URL || `http://localhost:${process.env.PORT}`
	const dbDir = process.env.DB_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'distbin-'));
	// ensure subdirs exist
	await Promise.all(['activities', 'inbox'].map(dir => {
		return denodeify(fs.mkdir)(path.join(dbDir, dir))
		.catch((err: NodeJS.ErrnoException) => {
			switch (err.code) {
				case 'EEXIST':
					// folder exists, no prob
					return;
			}
			throw err;
		})
	}));
	debuglog("using db directory", dbDir)
	const apiHandler = distbin({
		activities: new JSONFileMapAsync(path.join(dbDir, 'activities/')),
		inbox: new JSONFileMapAsync(path.join(dbDir, 'inbox/')),
		externalUrl,
	})

	function listen(server: Server): Promise<string> {
		return new Promise((resolve, reject) => server.listen(0, (err: Error) => {
			if (err) return reject(err)
			resolve(`http://localhost:${server.address().port}`)
		}))
	}

	// api
	const apiServer = http.createServer(apiHandler)
	const apiServerUrl = await listen(apiServer)

	// html
	const htmlServer = http.createServer(distbinHtml.createHandler({ apiUrl: apiServerUrl, externalUrl }))
	const htmlServerUrl = await listen(htmlServer)

	// mainServer delegates to htmlHandler or distbin api handler based on Accept header
	// of request
	// #TODO this is awkard. Maybe the 'home page module' at / should now how to content negotiate, not this. But not sure best
	//   way to do that without making the api part depend on the html part
	const mainServer = http.createServer((req, res) => {
		// htmlHandler only supports '/' right now (#TODO)
		let acceptHeader: string
		if (req.headers.accept instanceof Array) {
			acceptHeader = req.headers.accept[0]
		} else if (typeof req.headers.accept === 'string') {
			acceptHeader = <string>req.headers.accept
		}
		const preference = (acceptHeader
			? acceptHeader.split(',')
			: []).find((mime) => ['text/html', 'application/json'].includes(mime)) // TODO wtf?
		// Depending on 'Accept' header, try candidate backends in a certain order (e.g. html first)
		let prioritizedBackends: string[];
		switch (preference) {
			case 'text/html':
				prioritizedBackends = [htmlServerUrl, apiServerUrl]
				break;
			default:
				prioritizedBackends = [apiServerUrl, htmlServerUrl]
		}
		let candidateBackendUrl
		(function attemptBackends(backends = [], req, res) {
			if ( ! backends.length) {
				res.writeHead(404)
				res.end()
				return
			}
			const [candidateBackendUrl, ...nextBackends] = backends;
			forwardRequest(req, candidateBackendUrl)
				.then((candidateResponse: IncomingMessage) => {
					switch (candidateResponse.statusCode) {
						case 404:
							return attemptBackends(nextBackends, req, res)
						default:
							return forwardResponse(candidateResponse, res)							
					}
				})
		}(prioritizedBackends, req, res))
		// preference is html
		// proxy to htmlServer
		// const apiServerResponse = await forward(req, htmlServerUrl)
		// if (apiServerResponse.statusCode === 404) {
		// 	const htmlServerResponse = await forward(req, apiServerUrl)
		// 	proxyResponse(htmlServerResponse, res)
		// 	return
		// }
		function forwardRequest(req: ServerRequest, toUrl: string): Promise<http.IncomingMessage> {
			const reqToForward = http.request(Object.assign(url.parse(toUrl),{
				method: req.method,
				path: req.url,
				headers: req.headers,
			}))
			return new Promise((resolve, reject) => {
				req.pipe(reqToForward).on('finish', () => {
					sendRequest(reqToForward)
						.then(resolve)
						.catch(reject);
				})
			})
		}
		async function forwardResponse(res: IncomingMessage, toRes: ServerResponse) {
			toRes.writeHead(res.statusCode, res.headers)
			res.pipe(toRes)
		}
	})
	// listen
	let mainServerUrl = await new Promise((resolve) => {
		mainServer.listen(process.env.PORT || 0, (err: Error) => {
			resolve(externalUrl)
		})
	})

	console.log(mainServerUrl)
	// now just like listen
	await new Promise(function () {

	})
}
