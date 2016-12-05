const http = require('http')
const mongo = require('./lib/mongo')
const verify = require('./lib/verify')
const gumroad = require('./lib/gumroad')

console.log('starting')
mongo().then(() => {
  const server = http.createServer((req, res) => {
    if (req.method === 'GET') {
      res.statusCode = 200
      res.setHeader('Content-Type', 'text/plain')
      return res.end('ok')
    }

    var data = ''
    req.on('data', function (chunk) {
      data += chunk.toString()
    })

    req.on('end', function () {
      let m
      try {
        m = JSON.parse(data)
      } catch (e) {
        console.error(e)
        res.statusCode = 500
        res.setHeader('Content-Type', 'text/plain')
        return res.end(e.stack)
      }

      if (req.url === '/verification') {
        m.ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress
        console.log('verifying ' + JSON.stringify(m))
        return verify(m).then((v) => {
          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          const out = JSON.stringify(v)
          console.log(out)
          res.end(out)
        }).catch((e) => {
          console.error(e)
          res.statusCode = 500
          res.setHeader('Content-Type', 'text/plain')
          return res.end(e.stack)
        })
      }

      if (req.url === '/gumroad-hook') {
        console.log('gumroad ' + data)
        return gumroad(m).then(() => {
          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.end('ok')
        }).catch((e) => {
          console.error(e)
          res.statusCode = 500
          res.setHeader('Content-Type', 'text/plain')
          return res.end(e.stack)
        })
      }

      res.statusCode = 400
      res.setHeader('Content-Type', 'text/plain')
      res.end('not found')
    })
  })

  server.listen(1500)
  console.log('running')
}).catch((e) => {
  throw e
})
