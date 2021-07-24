const MongoDB = require('mongodb')
const Promise = require('bluebird')
const dbName = process.env['db:salesDatabaseName'] || 'sales'
Promise.promisifyAll(MongoDB)
let db

module.exports = () => {
  const connectionString = process.env['extensions:mongodbStore:uri'] || 'mongodb://localhost:27017/sales-tes'

  const options = {
    auto_reconnect: true,
    keepAlive: 1,
    connectTimeoutMS: 10000,
    socketTimeoutMS: 60000,
    useNewUrlParser: true,
    useUnifiedTopology: true
  }

  return MongoDB.MongoClient.connectAsync(connectionString, options).then((adb) => {
    db = adb

    if (process.env.createIndexes) {
      console.log('ensuring indexes')
      return db.db(dbName).collection('instances').ensureIndex({
        hostId: 1,
        ip: 1
      }, {
        name: 'hotIdIp'
      }).then(() => db)
    } else {
      return db
    }
  })
}

module.exports.db = () => db.db(dbName)
