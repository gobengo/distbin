const about = require('./about')
const publicSection = require('./public')
const home = require('./home')
const { route } = require('../util')
const anActivity = require('./an-activity')
import {IncomingMessage, ServerResponse} from 'http'

exports.createHandler = ({ apiUrl, externalUrl }:{apiUrl:string, externalUrl:string}) => {
  const routes = new Map([
    [new RegExp('^/$'), () => home.createHandler({ apiUrl, externalUrl })],
    [new RegExp('^/about$'), () => about.createHandler({ externalUrl })],
    [new RegExp('^/public$'), () => publicSection.createHandler({ apiUrl })],
    [new RegExp('^/activities/([^/.]+)$'),
      (activityId: string) => anActivity.createHandler({ apiUrl, activityId, externalUrl })]
  ])
  return (req: IncomingMessage, res: ServerResponse) => {
    const handler = route(routes, req)
    if (!handler) {
      res.writeHead(404)
      res.end('404 Not Found')
      return
    }
    Promise.resolve(handler(req, res))
      .catch((e) => {
        res.writeHead(500)
        console.trace(e)
        res.end('Error: ' + e)
      })
  }
}
