const fs = require('fs-extra')
const path = require('path')
const async = require('async')
const fileConverter = require('./FileConverter')
const keyBuilder = require('./KeyBuilder')
const fileController = require('./FileController')
const logger = require('logger-sharelatex')
const settings = require('settings-sharelatex')
const streamBuffers = require('stream-buffers')
const _ = require('underscore')

const checkCanStoreFiles = function(callback) {
  callback = _.once(callback)
  const req = { params: {}, query: {}, headers: {} }
  req.params.project_id = settings.health_check.project_id
  req.params.file_id = settings.health_check.file_id
  const myWritableStreamBuffer = new streamBuffers.WritableStreamBuffer({
    initialSize: 100
  })
  const res = {
    send(code) {
      if (code !== 200) {
        callback(new Error(`non-200 code from getFile: ${code}`))
      }
    }
  }
  myWritableStreamBuffer.send = res.send
  keyBuilder.userFileKey(req, res, function() {
    fileController.getFile(req, myWritableStreamBuffer)
    myWritableStreamBuffer.on('close', function() {
      if (myWritableStreamBuffer.size() > 0) {
        callback()
      } else {
        const err = 'no data in write stream buffer for health check'
        logger.err({ err }, 'error performing health check')
        callback(err)
      }
    })
  })
}

const checkFileConvert = function(callback) {
  if (!settings.enableConversions) {
    return callback()
  }
  const imgPath = path.join(settings.path.uploadFolder, '/tiny.pdf')
  async.waterfall(
    [
      cb => fs.copy('./tiny.pdf', imgPath, cb),
      cb => fileConverter.thumbnail(imgPath, cb),
      (resultPath, cb) => fs.unlink(resultPath, cb),
      cb => fs.unlink(imgPath, cb)
    ],
    callback
  )
}

module.exports = {
  check(req, res) {
    logger.log({}, 'performing health check')
    async.parallel([checkFileConvert, checkCanStoreFiles], function(err) {
      if (err) {
        logger.err({ err }, 'Health check: error running')
        res.send(500)
      } else {
        res.send(200)
      }
    })
  }
}
