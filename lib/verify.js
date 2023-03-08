const db = require('./mongo').db
const moment = require('moment')

async function verify (m) {
  if (m.licenseKey === 'free') {
    if (m.numberOfTemplates <= 5) {
      const result = {
        status: 0,
        license: 'free',
        type: 'free',
        message: 'Using free license'
      }

      return result
    }

    if (m.numberOfTemplates > 5) {
      const res = await db().collection('instances').find({ ip: m.ip, hostId: m.hostId }).toArrayAsync()
      if (res.length === 0 || !res[0].trialStart) {
        const trialExpires = new Date()
        trialExpires.setMonth(trialExpires.getMonth() + 1)

        const result = {
          status: 0,
          license: 'trial',
          type: 'trial',
          trialStart: new Date(),
          expiresOn: trialExpires,
          message: 'Starting one month enterprise trial'
        }

        return result
      }

      const trialExpires = new Date(res[0].trialStart)
      trialExpires.setMonth(trialExpires.getMonth() + 1)

      if (trialExpires < new Date()) {
        const result = {
          status: 1,
          type: 'trial',
          message: 'Enterprise trial expired'
        }
        return result
      }

      const result = {
        status: 0,
        type: 'trial',
        license: 'trial',
        expiresOn: trialExpires,
        message: 'Using enterprise trial license'
      }

      return result
    }
  }

  // gumroad unfortunately creates new license key for each recuring payment message
  // this means we need to match the sales by the email and product_id, matching just by license key is not enough

  // the first we find the original sale web hook message, because this is the only one having
  // the valid client license key
  const sales = await db().collection('sales').find({ license_key: m.licenseKey })
    .sort({ purchaseDate: 1 }).limit(1).toArrayAsync()

  if (sales.length === 0) {
    return {
      status: 1,
      message: 'License key is not valid'
    }
  }

  // gumroad typically sends purchaser_id but based on the docs doesn't need to if user doesn't create gumroad account
  // if the purchaser_id is not present we use email
  // if the purchaser_id is present we use purchaser_id and email, the email is likely not needed but to be sure
  const query = sales[0].purchaser_id != null
    ? { $or: [{ license_key: m.licenseKey }, { email: sales[0].email }, { purchaser_id: sales[0].purchaser_id }], permalink: sales[0].permalink }
    : { $or: [{ license_key: m.licenseKey }, { email: sales[0].email ? new RegExp('^' + sales[0].email + '$', 'i') : null }], permalink: sales[0].permalink }

  // now we can use the original sale information to find also the recuring charges information
  const rsales = await db().collection('sales').find(query).sort({ purchaseDate: -1 }).limit(1).toArrayAsync()
  // the sale now includes really the last web hook message corresponding to the license key
  const sale = rsales[0]

  const products = await db().collection('products').find({ permalink: sale.permalink }).toArrayAsync()
  if (products.length === 0) {
    return {
      status: 1,
      message: 'Internal error, unable to determine license type from the key'
    }
  }

  const product = products[0]

  if (product.isYearly) {
    const expiresOn = new Date(sale.purchaseDate)
    expiresOn.setFullYear(expiresOn.getFullYear() + 1)

    const lastYearMinusMonth = new Date()
    lastYearMinusMonth.setMonth(lastYearMinusMonth.getMonth() - 13)

    if (sale.purchaseDate < lastYearMinusMonth) {
      return {
        status: 1,
        paymentType: sale.paymentType,
        message: 'The subscription associated to this license key has expired on ' + moment(expiresOn).format('M/D/YYYY')
      }
    }

    const lastYear = new Date()
    lastYear.setFullYear(lastYear.getFullYear() - 1)

    if (sale.purchaseDate < lastYear) {
      return {
        status: 0,
        license: 'enterprise',
        type: 'subscription',
        expiresOn: expiresOn,
        pendingExpiration: true,
        paymentType: sale.paymentType,
        message: 'The subscription is no longer active probably due to failed payment or deactivation. The subscription can be used maximum one month in inactive state.'
      }
    }

    const nextMonth = new Date()
    nextMonth.setMonth(nextMonth.getMonth() + 1)
    if (expiresOn < nextMonth) {
      return {
        status: 0,
        license: 'enterprise',
        type: 'subscription',
        expiresOn: expiresOn,
        paymentType: sale.paymentType,
        message: 'The subscription verified, but is about to expire on ' + expiresOn
      }
    }

    return {
      status: 0,
      license: 'enterprise',
      type: 'subscription',
      expiresOn: expiresOn,
      paymentType: sale.paymentType,
      needsUsageCheck: product.needsUsageCheck,
      message: 'License key verified as yearly subscription'
    }
  }

  const allSortedVersions = await db().collection('versions').find({}).sort({ releaseDate: -1 }).toArrayAsync()
  const version = allSortedVersions.find(v => v.version === m.version)

  const compareToVersion = (version) => {
    const expiresOn = new Date(sale.purchaseDate)
    expiresOn.setMonth(expiresOn.getMonth() + product.validFor)

    if (expiresOn < version.releaseDate) {
      const latestEligibleVersion = allSortedVersions.find(v => v.releaseDate < expiresOn)
      return {
        error: true,
        status: 1,
        paymentType: sale.paymentType,
        message: `The license key is not valid for version ${m.version} because the ${product.validFor} months of free updates ended on ${moment(expiresOn).format('M/D/YYYY')} and version ${m.version} was released on ${moment(version.releaseDate).format('M/D/YYYY')}.` +
        ` The latest eligible version for this license key is ${latestEligibleVersion.version}. To upgrade your license and use the latest jsreport, please visit your customer's dashboard or contact support.`
      }
    }

    return {
      status: 0,
      license: 'enterprise',
      type: 'perpetual',
      expiresOn: expiresOn,
      needsUsageCheck: product.needsUsageCheck,
      paymentType: sale.paymentType,
      message: 'License key verified'
    }
  }

  // we could forgot to add the version to the db, so we use the last version in that case
  return compareToVersion(version || allSortedVersions[0])
}

module.exports = async (m) => {
  const result = await verify(m)
  const update = Object.assign({}, m, result, { lastVerification: new Date() })
  await db().collection('instances').updateOne({ ip: m.ip, hostId: m.hostId }, { $set: update }, { upsert: true })
  return result
}
