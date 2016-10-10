const assert = require('assert')
const distbin = require('../')

let tests = module.exports;

tests['distbin can be imported'] = function () {
	assert(distbin, 'distbin is truthy')
}

// Run tests if this file is executed
if (require.main === module) {
	let failed = false;
	Object.entries(tests).forEach(([testName, runTest]) => {
		try {
			runTest();
		} catch (e) {
			failed = true;
			console.error('TEST FAIL: ', testName, '\n', e.stack);
		}
	})
	if (failed) {
		process.exit(1);
	}
}
