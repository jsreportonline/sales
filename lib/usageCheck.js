const db = require('./mongo').db

module.exports = async (m) => {
  await db().collection('usages').deleteMany({ createdAt: { $lt: new Date(new Date().getTime() - (60 * 60 * 1000)) } })
  const usages = await db().collection('usages').find({ licenseKey: m.licenseKey }).sort({ createdAt: -1 }).limit(1).toArrayAsync()

  await db().collection('usages').insertOneAsync({
    ...m,
    createdAt: new Date()
  })

  if (usages.length > 0) {
    const potentiallyParallelUsage = usages[0]
    const differentInstance = potentiallyParallelUsage.ip !== m.ip || potentiallyParallelUsage.hostId !== m.hostId
    const insideCheckInterval = (potentiallyParallelUsage.createdAt.getTime() + m.checkInterval) > new Date().getTime()
    if (differentInstance && insideCheckInterval) {
      return {
        status: 1,
        message: 'Detected parallel usage of another jsreport instance with the same license key.',
        details: potentiallyParallelUsage
      }
    }
  }

  return {
    status: 0,
    message: 'ok'
  }
}
