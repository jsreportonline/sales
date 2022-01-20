const http = require('http')
const mongo = require('./lib/mongo')
const verify = require('./lib/verify')
const usageCheck = require('./lib/usageCheck')
const gumroad = require('./lib/gumroad')

console.log('starting')
mongo().then(() => {
  setInterval(() => {
    console.log('deleting usages')
    mongo.db().collection('usages')
      .deleteMany({ createdAt: { $lt: new Date(new Date().getTime() - (60 * 60 * 1000)) } })
      .catch((e) => console.log('error deleting usages', e))
  }, 5 * 60 * 1000)

  const server = http.createServer((req, res) => {
    if (req.method === 'GET') {
      res.statusCode = 200
      res.setHeader('Content-Type', 'text/plain')
      return res.end('ok')
    }

    let data = []
    req.on('data', function (chunk) {
      data.push(chunk)
    })

    req.on('end', function () {
      let m
      try {
        data = Buffer.concat(data).toString()
        m = JSON.parse(data)
      } catch (e) {
        console.error(e)
        res.statusCode = 500
        res.setHeader('Content-Type', 'text/plain')
        return res.end(e.stack)
      }

      if (req.url === '/verification') {
        m.ip = (req.headers['x-forwarded-for'] || req.connection.remoteAddress).split(',')[0]
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

      if (req.url === '/usage-check') {
        m.ip = (req.headers['x-forwarded-for'] || req.connection.remoteAddress).split(',')[0]
        console.log('usage check ' + JSON.stringify(m))
        return usageCheck(m).then((v) => {
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
