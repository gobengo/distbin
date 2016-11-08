// common util functions for testing
// (doesn't actually contain tests)

const http = require('http')

// Return Promise of an http.Request that will be sent to an http.createServer listener
exports.requestForListener = requestForListener
async function requestForListener (listener, requestOptions) {
  const server = http.createServer(listener)
  await listen(server)

  const request = http.request(Object.assign({
    hostname: 'localhost',
    method: 'get',
    path: '/',
    port: server.address().port
  }, typeof (requestOptions) === 'string' ? { path: requestOptions } : requestOptions))

  return request
}

// given an http.Server, return a promise of it listening on a port
exports.listen = listen
async function listen (server, port = 0, ...args) {
  let listened
  return new Promise((resolve, reject) => {
    server
    .once('error', () => {
      if (!listened) reject()
    })
    .listen(port, ...args, () => {
      listened = true
      resolve(`http://localhost:${server.address().port}`)
    })
  })
}

