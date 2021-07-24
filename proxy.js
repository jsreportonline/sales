const app = require('express')()
const request = require('request')

app.use(require('body-parser').json())
app.post('/license-key', (req, res) => {
  return request.post({
    url: 'http://localhost:1500/verification',
    method: 'POST',
    headers: req.headers,
    body: req.body,
    json: true
  }).pipe(res)
})

app.post('/license-usage', (req, res) => {
  return request.post({
    url: 'http://localhost:1500/usage-check',
    method: 'POST',
    headers: req.headers,
    body: req.body,
    json: true
  }).pipe(res)
})

app.listen(3000)
