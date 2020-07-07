const logger = require('logger-sharelatex')
const Settings = require('settings-sharelatex')
const fs = require('fs')
const Path = require('path')
const { promisify } = require('util')
const disrequire = require('disrequire')
const AWS = require('aws-sdk')

logger.logger.level('info')

const fsReaddir = promisify(fs.readdir)
const sleep = promisify(setTimeout)

class FilestoreApp {
  constructor() {
    this.running = false
    this.initing = false
  }

  async runServer() {
    if (this.running) {
      return
    }

    if (this.initing) {
      return this.waitForInit()
    }
    this.initing = true

    this.app = await FilestoreApp.requireApp()

    await new Promise((resolve, reject) => {
      this.server = this.app.listen(
        Settings.internal.filestore.port,
        'localhost',
        err => {
          if (err) {
            return reject(err)
          }
          resolve()
        }
      )
    })

    if (Settings.filestore.backend === 's3') {
      try {
        await FilestoreApp.waitForS3()
      } catch (err) {
        await this.stop()
        throw err
      }
    }

    this.initing = false
    this.persistor = require('../../../app/js/PersistorManager')
  }

  async waitForInit() {
    while (this.initing) {
      await sleep(1000)
    }
  }

  async stop() {
    if (!this.server) return
    const closeServer = promisify(this.server.close).bind(this.server)
    try {
      await closeServer()
    } finally {
      delete this.server
    }
  }

  static async waitForS3() {
    let tries = 0
    if (!Settings.filestore.s3.endpoint) {
      return
    }

    const s3 = new AWS.S3({
      accessKeyId: Settings.filestore.s3.key,
      secretAccessKey: Settings.filestore.s3.secret,
      endpoint: Settings.filestore.s3.endpoint,
      s3ForcePathStyle: true,
      signatureVersion: 'v4'
    })

    while (true) {
      try {
        return await s3
          .putObject({
            Key: 'startup',
            Body: '42',
            Bucket: Settings.filestore.stores.user_files
          })
          .promise()
      } catch (err) {
        // swallow errors, as we may experience them until fake-s3 is running
        if (tries === 9) {
          // throw just before hitting the 10s test timeout
          throw err
        }
        tries++
        await sleep(1000)
      }
    }
  }

  static async requireApp() {
    // unload the app, as we may be doing this on multiple runs with
    // different settings, which affect startup in some cases
    const files = await fsReaddir(Path.resolve(__dirname, '../../../app/js'))
    files.forEach(file => {
      disrequire(Path.resolve(__dirname, '../../../app/js', file))
    })
    disrequire(Path.resolve(__dirname, '../../../app'))
    disrequire('@overleaf/object-persistor')

    return require('../../../app')
  }
}

module.exports = FilestoreApp
