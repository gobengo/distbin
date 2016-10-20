const home = require('./home')

exports.createHandler = ({ apiUrl }) => {
  return (req, res) => {
    switch (req.url) {
      case '/':
        return home.createHandler({ apiUrl })(req, res)
      default:
        res.writeHead(404)
        res.end()
    }
  }
}
