process.env['extensions:mongodbStore:uri'] = 'mongodb://localhost:27017/sales-test'
process.env['db:salesDatabaseName'] = 'sales-test'

require('should')
const mongo = require('../lib/mongo')
const verify = require('../lib/verify')

describe('verify', () => {
  beforeEach(() => {
    return mongo()
      .then(() => mongo.db().collection('sales').removeManyAsync({}))
      .then(() => mongo.db().collection('products').removeManyAsync({}))
      .then(() => mongo.db().collection('versions').removeManyAsync({}))
      .then(() => mongo.db().collection('instances').removeManyAsync({}))
  })

  it('should return license key is not valid if not found in sales', () => {
    return verify({
      licenseKey: 'foo',
      version: '1.1.1'
    }).then((res) => {
      res.status.should.be.eql(1)
      res.message.should.be.eql('License key is not valid')
    })
  })

  it('should verify existing subscription', () => {
    const lastMonth = new Date()
    lastMonth.setMonth(lastMonth.getMonth() - 1)

    return mongo.db().collection('sales').insertOneAsync({
      purchaseDate: lastMonth,
      license_key: 'foo',
      product_id: 1,
      paymentType: 'manual'
    }).then(() => mongo.db().collection('products').insertOneAsync({
      isYearly: true,
      product_id: 1
    }).then(() => {
      return verify({
        licenseKey: 'foo',
        version: '1.1.1'
      }).then((res) => {
        res.status.should.be.eql(0)
        res.paymentType.should.be.eql('manual')
        res.message.should.be.eql('License key verified as yearly subscription')
      })
    }))
  })

  it('should reject expired subscription', () => {
    const lastYear = new Date()
    lastYear.setMonth(lastYear.getMonth() - 15)

    return mongo.db().collection('sales').insertOneAsync({
      purchaseDate: lastYear,
      license_key: 'foo',
      product_id: 1
    }).then(() => mongo.db().collection('products').insertOneAsync({
      isYearly: true,
      product_id: 1
    }).then(() => {
      return verify({
        licenseKey: 'foo',
        version: '1.1.1'
      }).then((res) => {
        res.status.should.be.eql(1)
        res.message.should.be.containEql('The subscription associated to this license key has expired')
      })
    }))
  })

  it('should warn about expiring subscription', () => {
    const expiringMonthDate = new Date()
    expiringMonthDate.setMonth(expiringMonthDate.getMonth() - 11)

    return mongo.db().collection('sales').insertOneAsync({
      purchaseDate: expiringMonthDate,
      license_key: 'foo',
      product_id: 1
    }).then(() => mongo.db().collection('products').insertOneAsync({
      isYearly: true,
      product_id: 1
    }).then(() => {
      return verify({
        licenseKey: 'foo',
        version: '1.1.1'
      }).then((res) => {
        res.status.should.be.eql(0)
        res.message.should.be.containEql('The subscription verified, but is about to expire')
      })
    }))
  })

  it('should warn about subscription expired for one month', () => {
    const expiringMonthDate = new Date()
    expiringMonthDate.setMonth(expiringMonthDate.getMonth() - 13)
    expiringMonthDate.setDate(expiringMonthDate.getDate() + 1)

    return mongo.db().collection('sales').insertOneAsync({
      purchaseDate: expiringMonthDate,
      license_key: 'foo',
      product_id: 1
    }).then(() => mongo.db().collection('products').insertOneAsync({
      isYearly: true,
      product_id: 1
    }).then(() => {
      return verify({
        licenseKey: 'foo',
        version: '1.1.1'
      }).then((res) => {
        res.status.should.be.eql(0)
        res.message.should.be.containEql('The subscription is no longer active probably due to failed payment or deactivation. The subscription can be used maximum one month in inactive state.')
      })
    }))
  })

  it('should verify existing subscription with existing reoccuring payment', () => {
    const originalPurchase = new Date()
    originalPurchase.setFullYear(originalPurchase.getFullYear() - 1)

    const reoccuringPurchase = new Date()
    reoccuringPurchase.setDate(reoccuringPurchase.getDate() - 2)

    return mongo.db().collection('sales').insertOneAsync({
      purchaseDate: originalPurchase,
      email: 'a@a.com',
      license_key: 'foo',
      permalink: '1'
    }).then(() => mongo.db().collection('sales').insertOneAsync({
      purchaseDate: reoccuringPurchase,
      license_key: 'different',
      email: 'a@a.com',
      permalink: '1'
    })).then(() => mongo.db().collection('products').insertOneAsync({
      isYearly: true,
      product_id: 1,
      permalink: '1'
    }).then(() => {
      return verify({
        licenseKey: 'foo',
        version: '1.1.1'
      }).then((res) => {
        res.status.should.be.eql(0)
        res.message.should.be.eql('License key verified as yearly subscription')
      })
    }))
  })

  it('should verify existing subscription using purchaser_id is exists in the original sale', () => {
    const originalPurchase = new Date()
    originalPurchase.setFullYear(originalPurchase.getFullYear() - 1)

    const reoccuringPurchase = new Date()
    reoccuringPurchase.setDate(reoccuringPurchase.getDate() - 2)

    return mongo.db().collection('sales').insertOneAsync({
      purchaseDate: originalPurchase,
      email: 'a@a.com',
      purchaser_id: 1,
      license_key: 'foo',
      permalink: '1'
    }).then(() => mongo.db().collection('sales').insertOneAsync({
      purchaseDate: reoccuringPurchase,
      license_key: 'different',
      purchaser_id: 1,
      email: 'different@emai;.com',
      permalink: '1'
    })).then(() => mongo.db().collection('products').insertOneAsync({
      isYearly: true,
      product_id: 1,
      permalink: '1'
    }).then(() => {
      return verify({
        licenseKey: 'foo',
        version: '1.1.1'
      }).then((res) => {
        res.status.should.be.eql(0)
        res.message.should.be.eql('License key verified as yearly subscription')
      })
    }))
  })

  it('should verify valid perpetual license', () => {
    const lastMonth = new Date()
    lastMonth.setMonth(lastMonth.getMonth() - 1)

    return mongo.db().collection('sales').insertAsync({
      purchaseDate: lastMonth,
      license_key: 'foo',
      product_id: 1
    }).then(() => mongo.db().collection('products').insertOneAsync({
      validFor: 6,
      product_id: 1
    })).then(() => mongo.db().collection('versions').insertOneAsync({
      version: '1.1.1',
      releaseDate: new Date()
    }).then(() => {
      return verify({
        licenseKey: 'foo',
        version: '1.1.1'
      }).then((res) => {
        res.status.should.be.eql(0)
        res.message.should.be.eql('License key verified')
      })
    }))
  })

  it('should reject expired perpetual license', () => {
    const lastYear = new Date()
    lastYear.setMonth(lastYear.getMonth() - 12)

    return mongo.db().collection('sales').insertOneAsync({
      purchaseDate: lastYear,
      license_key: 'foo',
      product_id: 1
    }).then(() => mongo.db().collection('products').insertOneAsync({
      validFor: 6,
      product_id: 1
    })).then(() => mongo.db().collection('versions').insertOneAsync({
      version: '1.1.1',
      releaseDate: new Date()
    }).then(() => {
      return verify({
        licenseKey: 'foo',
        version: '1.1.1'
      }).then((res) => {
        res.status.should.be.eql(1)
        res.message.should.be.eql('The license key is not valid for this version')
      })
    }))
  })

  it('should reject perpetual license with missing version based on the last existing', () => {
    const lastYear = new Date()
    lastYear.setMonth(lastYear.getMonth() - 12)

    return mongo.db().collection('sales').insertAsync({
      purchaseDate: lastYear,
      license_key: 'foo',
      product_id: 1
    }).then(() => mongo.db().collection('products').insertAsync({
      validFor: 6,
      product_id: 1
    })).then(() => mongo.db().collection('versions').insertAsync({
      version: '1.1.1',
      releaseDate: new Date()
    }).then(() => {
      return verify({
        licenseKey: 'foo',
        version: '1.1.2'
      }).then((res) => {
        res.status.should.be.eql(1)
        res.message.should.be.eql('The license key is not valid for this version')
      })
    }))
  })

  it('should verify perpetual license with missing version based on the last existing', () => {
    const lastYear = new Date()
    lastYear.setMonth(lastYear.getMonth() - 12)

    return mongo.db().collection('sales').insertAsync({
      purchaseDate: lastYear,
      license_key: 'foo',
      product_id: 1
    }).then(() => mongo.db().collection('products').insertAsync({
      validFor: 6,
      product_id: 1
    })).then(() => mongo.db().collection('versions').insertAsync({
      version: '1.1.1',
      releaseDate: lastYear
    }).then(() => {
      return verify({
        licenseKey: 'foo',
        version: '1.1.2'
      }).then((res) => {
        res.status.should.be.eql(0)
        res.message.should.be.eql('License key verified')
      })
    }))
  })

  it('should update instances', () => {
    const lastMonth = new Date()
    lastMonth.setMonth(lastMonth.getMonth() - 1)

    return mongo.db().collection('sales').insertAsync({
      purchaseDate: lastMonth,
      license_key: 'foo',
      product_id: 1
    }).then(() => mongo.db().collection('products').insertAsync({
      isYearly: true,
      product_id: 1
    }).then(() => {
      return verify({
        licenseKey: 'foo',
        ip: '192.168.0.1',
        hostId: 'x',
        version: '1.1.1'
      }).then(() => mongo.db().collection('instances').find({}).toArrayAsync())
        .then((res) => {
          res.should.have.length(1)
          res[0].status.should.be.eql(0)
          res[0].ip.should.be.eql('192.168.0.1')
          res[0].hostId.should.be.eql('x')
          res[0].licenseKey.should.be.eql('foo')
          res[0].lastVerification.should.be.ok()
        })
    }))
  })

  it('should verify free license if numberOfTemplates less or eql 5', () => {
    return verify({
      licenseKey: 'free',
      numberOfTemplates: 1,
      version: '1.1.1'
    }).then((res) => {
      res.status.should.be.eql(0)
      res.message.should.be.eql('Using free license')
    })
  })

  it('should start enterprise trial if free license and number of templates is higher then 5', () => {
    return verify({
      licenseKey: 'free',
      numberOfTemplates: 6,
      version: '1.1.1'
    }).then((res) => {
      res.status.should.be.eql(0)
      res.message.should.be.eql('Starting one month enterprise trial')
    })
  })

  it('should reject trial after one month if number of templates higher', () => {
    const lastYear = new Date()
    lastYear.setFullYear(lastYear.getFullYear() - 1)

    return mongo.db().collection('instances').insertOneAsync({
      trialStart: lastYear,
      license_key: 'foo',
      ip: '192.168.0.1',
      hostId: 'a'
    }).then(() => verify({
      licenseKey: 'free',
      ip: '192.168.0.1',
      hostId: 'a',
      numberOfTemplates: 6,
      version: '1.1.1'
    }).then((res) => {
      res.status.should.be.eql(1)
      res.message.should.be.eql('Enterprise trial expired')
    }))
  })

  it('should start enterprise trial if free license, number of templates is higher then 5 and free instance already registered', () => {
    return mongo.db().collection('instances').insertOneAsync({
      ip: '192.168.0.1',
      license: 'free',
      hostId: 'a'
    }).then(() => verify({
      licenseKey: 'free',
      ip: '192.168.0.1',
      hostId: 'a',
      numberOfTemplates: 6,
      version: '1.1.1'
    }).then((res) => {
      res.status.should.be.eql(0)
      res.message.should.be.eql('Starting one month enterprise trial')
    }))
  })
})
