const assert = require('assert')
const distbin = require('../')
const http = require('http');

let tests = module.exports;

// given a handler function like (req, res), make it listen
// then send http.request, return a Promise or response
const sendRequest = (handler, request) => {
	const server = http.createServer(handler);
	let listened;
	return new Promise((resolve, reject) => {
		server
			.once('error', () => {
				if ( ! listened) reject();
			})
			.listen(0, () => {
				listened = true;
				resolve();
			})
	})
	.then(() => new Promise((resolve, reject) => {
		const url = `http://localhost:${server.address().port}`
		const requestOptions = Object.assign({
			hostname: 'localhost',
			method: 'get',
			path: '/',
			port: server.address().port
		}, request);
		const req = http
			.request(url, (res) => {
			  res.destroy();
			  resolve(res);
			})
			.on('error', reject)
			.end();
	}))
}

tests['distbin can be imported'] = () => {
	assert(distbin, 'distbin is truthy')
}

tests['can create a distbin'] = () => {
	const bin = distbin();
}

tests['can send http requests to a distbin.Server'] = () => {
	return sendRequest(distbin(), { method: 'get' }).then((res) => {
		assert.equal(res.statusCode, 200);
	})
}

// Run tests if this file is executed
if (require.main === module) {
	let failed = false;
	Promise.all(
		// map to array of promises of logged errors
		// (or falsy if the test passed)
		Object.entries(tests).map(([testName, runTest]) => {
			function logFailure(err) {
				console.error(`TEST FAIL: ${testName}\n${err.stack}\n`)
			}
			let result;
			try {
				result = runTest();
			} catch (err) {
				logFailure(err);
				return err;
			}
			// result allowed to be a promise
			return Promise.resolve(result)
			.then(() => {}) // return nothing if success
			.catch(err => {
				failed = true;
				logFailure(err);
				return err;
				// throw err;
			})
		})
	).catch((err) => {
		console.error("ERROR IN TEST RUNNER", err)
		process.exit(1)
	})
	.then((results) => {
		const failures = results.filter(Boolean);
		if (failures.length) {
			console.error(`${failures.length} test failures`);
			process.exit(1);
			return;
		}
		process.exit();
	});
}
