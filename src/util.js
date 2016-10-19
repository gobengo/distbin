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

var SURROGATE_PAIR_REGEXP = /[\uD800-\uDBFF][\uDC00-\uDFFF]/g,
    // Match everything outside of normal chars and " (quote character)
    NON_ALPHANUMERIC_REGEXP = /([^\#-~| |!])/g;
/**
 * Escapes all potentially dangerous characters, so that the
 * resulting string can be safely inserted into attribute or
 * element text.
 * @param value
 * @returns {string} escaped text
 */
exports.encodeHtmlEntities = function encodeEntities(value) {
  return value.
    replace(/&/g, '&amp;').
    replace(SURROGATE_PAIR_REGEXP, function(value) {
      var hi = value.charCodeAt(0);
      var low = value.charCodeAt(1);
      return '&#' + (((hi - 0xD800) * 0x400) + (low - 0xDC00) + 0x10000) + ';';
    }).
    replace(NON_ALPHANUMERIC_REGEXP, function(value) {
      return '&#' + value.charCodeAt(0) + ';';
    }).
    replace(/</g, '&lt;').
    replace(/>/g, '&gt;');
}