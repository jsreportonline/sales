const MongoDB = require('mongodb')
const Promise = require('bluebird')
const dbName = process.env['connectionString:database'] || 'sales'
Promise.promisifyAll(MongoDB)
var db

module.exports = () => {
  const connectionString = process.env['connectionString:uri']

  var options = {
    autoReconnect: true,
    keepAlive: 1,
    connectTimeoutMS: 10000,
    socketTimeoutMS: 60000
  }

  return MongoDB.MongoClient.connectAsync(connectionString, options).then((adb) => {
    db = adb

    console.log('ensuring indexes')
    return db.db(dbName).collection('instances').ensureIndex({
      'hostId': 1,
      'ip': 1
    }, {
      name: 'hotIdIp'
    }).then(() => db)
  })
}

module.exports.db = () => db.db(dbName)
