const crypto = require('crypto')
const Stream = require('stream')
const logger = require('logger-sharelatex')
const metrics = require('metrics-sharelatex')
const {
  WriteError,
  ReadError,
  NotFoundError,
  UpstreamError
} = require('./Errors')
const { promisify } = require('util')

const pipeline = promisify(Stream.pipeline)

// Observes data that passes through and computes some metadata for it
// - specifically, it computes the number of bytes transferred, and optionally
//   computes a cryptographic hash based on the 'hash' option. e.g., pass
//   { hash: 'md5' } to compute the md5 hash of the stream
// - if 'metric' is supplied as an option, this metric will be incremented by
//   the number of bytes transferred
class ObserverStream extends Stream.Transform {
  constructor(options) {
    options.autoDestroy = true
    super(options)

    this.bytes = 0

    if (options.hash) {
      this.hash = crypto.createHash(options.hash)
    }
    if (options.metric) {
      const onEnd = () => {
        metrics.count(options.metric, this.bytes)
      }
      this.once('error', onEnd)
      this.once('end', onEnd)
    }
  }

  _transform(chunk, encoding, done) {
    if (this.hash) {
      this.hash.update(chunk)
    }
    this.bytes += chunk.length
    this.push(chunk)
    done()
  }

  getHash() {
    return this.hash && this.hash.digest('hex')
  }
}

module.exports = {
  ObserverStream,
  calculateStreamMd5,
  verifyMd5,
  getReadyPipeline,
  wrapError,
  hexToBase64,
  base64ToHex
}

// returns a promise which resolves with the md5 hash of the stream
// - consumes the stream
function calculateStreamMd5(stream) {
  const hash = crypto.createHash('md5')
  hash.setEncoding('hex')

  return pipeline(stream, hash).then(() => hash.read())
}

// verifies the md5 hash of a file against the supplied md5 or the one stored in
// storage if not supplied - deletes the new file if the md5 does not match and
// throws an error
async function verifyMd5(persistor, bucket, key, sourceMd5, destMd5 = null) {
  if (!destMd5) {
    destMd5 = await persistor.promises.getFileMd5Hash(bucket, key)
  }

  if (sourceMd5 !== destMd5) {
    try {
      await persistor.promises.deleteFile(bucket, key)
    } catch (err) {
      logger.warn(err, 'error deleting file for invalid upload')
    }

    throw new WriteError({
      message: 'source and destination hashes do not match',
      info: {
        sourceMd5,
        destMd5,
        bucket,
        key
      }
    })
  }
}

// resolves when a stream is 'readable', or rejects if the stream throws an error
// before that happens - this lets us handle protocol-level errors before trying
// to read them
function getReadyPipeline(...streams) {
  return new Promise((resolve, reject) => {
    const lastStream = streams.slice(-1)[0]
    let resolvedOrErrored = false

    const handler = function(err) {
      if (!resolvedOrErrored) {
        resolvedOrErrored = true

        lastStream.removeListener('readable', handler)
        if (err) {
          return reject(
            wrapError(err, 'error before stream became ready', {}, ReadError)
          )
        }
        resolve(lastStream)
      }
    }

    pipeline(...streams).catch(handler)
    lastStream.on('readable', handler)
  })
}

function wrapError(error, message, params, ErrorType) {
  if (
    error instanceof NotFoundError ||
    ['NoSuchKey', 'NotFound', 404, 'AccessDenied', 'ENOENT'].includes(
      error.code
    ) ||
    (error.response && error.response.statusCode === 404)
  ) {
    return new NotFoundError({
      message: 'no such file',
      info: params
    }).withCause(error)
  } else if (
    error instanceof UpstreamError ||
    parseInt(error.code) >= 500 ||
    (error.message && error.message.match(/^Cannot parse response as JSON.*/))
  ) {
    return new UpstreamError({
      message: 'internal error from upstream storage',
      info: params
    }).withCause(error)
  } else {
    return new ErrorType({
      message: message,
      info: params
    }).withCause(error)
  }
}

function base64ToHex(base64) {
  return Buffer.from(base64, 'base64').toString('hex')
}

function hexToBase64(hex) {
  return Buffer.from(hex, 'hex').toString('base64')
}
