const db = require('./mongo').db

module.exports = (m) => {
  return db().collection('sales').insertOneAsync(Object.assign({}, m, { purchaseDate: new Date() }))
}
