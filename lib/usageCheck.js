const db = require('./mongo').db

module.exports = async (m) => {
  const twoIntervalsUsage = await db().collection('usages').find({
    licenseKey: m.licenseKey,
    createdAt: { $gt: new Date(new Date().getTime() - (Math.round(m.checkInterval * 2.5))) }
  }).sort({ createdAt: 1 }).toArrayAsync()

  await db().collection('usages').insertOneAsync({
    ...m,
    createdAt: new Date()
  })

  const lastUsageOfSameHost = [...twoIntervalsUsage].reverse().find(u => u.hostId === m.hostId && u.ip === m.ip)

  if (lastUsageOfSameHost) {
    const usageOfAnotherHost = twoIntervalsUsage.find(u => (u.hostId !== m.hostId || u.ip !== m.ip) && u.createdAt > lastUsageOfSameHost.createdAt)

    if (usageOfAnotherHost) {
      let detailInformation = ''

      if (usageOfAnotherHost.hostId !== m.hostId && usageOfAnotherHost.hostId.includes(':')) {
        const hostname = Buffer.from(usageOfAnotherHost.hostId.split(':')[0], 'base64').toString()
        detailInformation = `The hostname of the detected parallel usage is ${hostname}.`
      }

      if (!detailInformation && usageOfAnotherHost.ip !== m.ip) {
        detailInformation = `The IP of the detected parallel usage is ${usageOfAnotherHost.ip}.`
      }

      return {
        status: 1,
        message: `Detected parallel usage of another jsreport instance with the same license key.${detailInformation}`,
        details: usageOfAnotherHost
      }
    }
  }

  return {
    status: 0,
    message: 'ok'
  }
}
