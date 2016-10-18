exports.readableToString = async function (readable) {
  let body = ''
  return new Promise((resolve, reject) => {
    readable.on('error', reject)
    readable.on('data', (chunk) => {
      body += chunk
      return body
    })
    readable.on('end', () => resolve(body))
  })
}

exports.sendRequest = async function (request) {
  return new Promise((resolve, reject) => {
    request.once('response', resolve)
    request.once('error', reject)
    if ( ! request.ended) request.end()
  })
}
