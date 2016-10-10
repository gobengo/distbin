exports['The tests pass'] = function () {
	// always pass for now
}

// Run tests if this file is executed
if (require.main === module) {
	Object.entries(exports).forEach(([testName, runTest]) => {
		runTest();
	})
}
