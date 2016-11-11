// tests['GET an activity has a .url to a distbin-hosted html page'] = async function () {
//   const activityUrl = await postActivity(distbin(), {
//     type: 'Note',
//     content: 'you can read this without knowing wtf JSON is!'
//   })
//   console.log('activityUrl', activityUrl)
//   const activityHtmlResponse = await sendRequest(http.request(Object.assign(url.parse(activityUrl), {
//     headers: {
//       accept: 'text/html'
//     }
//   })));
//   assert.equal(activityHtmlResponse.statusCode, 200)
//   console.log('headers', activityHtmlResponse.headers)
//   console.log('body', await readableToString(activityHtmlResponse))
//   assert.equal(activityHtmlResponse.headers['content-type'], 'text/html')
// }