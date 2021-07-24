const db = require('./mongo').db

const updateInstances = (m, result) => {
  const update = Object.assign({}, m, result, { lastVerification: new Date() })
  return db().collection('instances').updateOne({ ip: m.ip, hostId: m.hostId }, { $set: update }, { upsert: true })
}

module.exports = (m) => {
  if (m.licenseKey === 'free') {
    if (m.numberOfTemplates <= 5) {
      let result = {
        status: 0,
        license: 'free',
        type: 'free',
        message: 'Using free license'
      }

      return updateInstances(m, result).then(() => result)
    }

    if (m.numberOfTemplates > 5) {
      return db().collection('instances').find({ ip: m.ip, hostId: m.hostId }).toArrayAsync().then((res) => {
        if (res.length === 0 || !res[0].trialStart) {
          const trialExpires = new Date()
          trialExpires.setMonth(trialExpires.getMonth() + 1)

          let result = {
            status: 0,
            license: 'trial',
            type: 'trial',
            trialStart: new Date(),
            expiresOn: trialExpires,
            message: 'Starting one month enterprise trial'
          }

          return updateInstances(m, result).then(() => result)
        }

        const trialExpires = new Date(res[0].trialStart)
        trialExpires.setMonth(trialExpires.getMonth() + 1)

        if (trialExpires < new Date()) {
          let result = {
            status: 1,
            type: 'trial',
            message: 'Enterprise trial expired'
          }
          return updateInstances(m, result).then(() => result)
        }

        let result = {
          status: 0,
          type: 'trial',
          license: 'trial',
          expiresOn: trialExpires,
          message: 'Using enterprise trial license'
        }

        return updateInstances(m, result).then(() => result)
      })
    }
  }

  // gumroad unfortunately creates new license key for each recuring payment message
  // this means we need to match the sales by the email and product_id, matching just by license key is not enough

  // the first we find the original sale web hook message, because this is the only one having
  // the valid client license key
  return db().collection('sales').find({ license_key: m.licenseKey })
    .sort({ purchaseDate: 1 }).limit(1).toArrayAsync()
    .then((sales) => {
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
        ? { $or: [ { email: sales[0].email }, { purchaser_id: sales[0].purchaser_id } ], permalink: sales[0].permalink }
        : { email: sales[0].email, permalink: sales[0].permalink }

      // now we can use the original sale information to find also the recuring charges information
      return db().collection('sales').find(query).sort({ purchaseDate: -1 }).limit(1).toArrayAsync().then((rsales) => {
        // the sale now includes really the last web hook message corresponding to the license key
        const sale = rsales[0]

        return db().collection('products').find({ permalink: sale.permalink }).toArrayAsync().then((products) => {
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
                message: 'The subscription associated to this license key has expired on ' + expiresOn
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

          return db().collection('versions').find({ version: m.version }).toArrayAsync().then((versions) => {
            const compareToVersion = (version) => {
              const expiresOn = new Date(sale.purchaseDate)
              expiresOn.setMonth(expiresOn.getMonth() + product.validFor)

              if (expiresOn < version.releaseDate) {
                return {
                  error: true,
                  status: 1,
                  paymentType: sale.paymentType,
                  message: 'The license key is not valid for this version'
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

            if (versions.length === 0) {
            // we probably forgot to add the version to the db
            // lets find the last version and check if that is actually valid, which roughly implies if the newer is valid
              return db().collection('versions').find({}).sort({ releaseDate: -1 }).toArrayAsync().then((lastReleasedVersions) => {
                return compareToVersion(lastReleasedVersions[0])
              })
            }

            return compareToVersion(versions[0])
          })
        })
      })
    }).then((res) => updateInstances(m, res).then(() => res))
}
