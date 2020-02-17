const http = require('http')
const https = require('https')
http.globalAgent.maxSockets = 300
https.globalAgent.maxSockets = 300

const settings = require('settings-sharelatex')
const metrics = require('metrics-sharelatex')

const PersistorHelper = require('./PersistorHelper')

const fs = require('fs')
const S3 = require('aws-sdk/clients/s3')
const { URL } = require('url')
const { callbackify } = require('util')
const {
  WriteError,
  ReadError,
  NotFoundError,
  SettingsError
} = require('./Errors')

const S3Persistor = {
  sendFile: callbackify(sendFile),
  sendStream: callbackify(sendStream),
  getFileStream: callbackify(getFileStream),
  getFileMd5Hash: callbackify(getFileMd5Hash),
  deleteDirectory: callbackify(deleteDirectory),
  getFileSize: callbackify(getFileSize),
  deleteFile: callbackify(deleteFile),
  copyFile: callbackify(copyFile),
  checkIfFileExists: callbackify(checkIfFileExists),
  directorySize: callbackify(directorySize),
  promises: {
    sendFile,
    sendStream,
    getFileStream,
    getFileMd5Hash,
    deleteDirectory,
    getFileSize,
    deleteFile,
    copyFile,
    checkIfFileExists,
    directorySize
  }
}

module.exports = S3Persistor

function hexToBase64(hex) {
  return Buffer.from(hex, 'hex').toString('base64')
}

async function sendFile(bucketName, key, fsPath) {
  let readStream
  try {
    readStream = fs.createReadStream(fsPath)
  } catch (err) {
    throw PersistorHelper.wrapError(
      err,
      'error reading file from disk',
      { bucketName, key, fsPath },
      ReadError
    )
  }
  return sendStream(bucketName, key, readStream)
}

async function sendStream(bucketName, key, readStream, sourceMd5) {
  try {
    // if there is no supplied md5 hash, we calculate the hash as the data passes through
    let hashPromise
    let b64Hash

    if (sourceMd5) {
      b64Hash = hexToBase64(sourceMd5)
    } else {
      hashPromise = PersistorHelper.calculateStreamMd5(readStream)
    }

    const meteredStream = PersistorHelper.getMeteredStream(
      readStream,
      (_, byteCount) => {
        // ignore the error parameter and just log the byte count
        metrics.count('s3.egress', byteCount)
      }
    )

    // if we have an md5 hash, pass this to S3 to verify the upload
    const uploadOptions = {
      Bucket: bucketName,
      Key: key,
      Body: meteredStream
    }
    if (b64Hash) {
      uploadOptions.ContentMD5 = b64Hash
    }

    const response = await _getClientForBucket(bucketName)
      .upload(uploadOptions, { partSize: settings.filestore.s3.partSize })
      .promise()
    let destMd5 = _md5FromResponse(response)
    if (!destMd5) {
      // the eTag isn't in md5 format so we need to calculate it ourselves
      const verifyStream = await getFileStream(
        response.Bucket,
        response.Key,
        {}
      )
      destMd5 = await PersistorHelper.calculateStreamMd5(verifyStream)
    }

    // if we didn't have an md5 hash, we should compare our computed one with S3's
    // as we couldn't tell S3 about it beforehand
    if (hashPromise) {
      sourceMd5 = await hashPromise
      // throws on mismatch
      await PersistorHelper.verifyMd5(
        S3Persistor,
        bucketName,
        key,
        sourceMd5,
        destMd5
      )
    }
  } catch (err) {
    throw PersistorHelper.wrapError(
      err,
      'upload to S3 failed',
      { bucketName, key },
      WriteError
    )
  }
}

async function getFileStream(bucketName, key, opts) {
  opts = opts || {}

  const params = {
    Bucket: bucketName,
    Key: key
  }
  if (opts.start != null && opts.end != null) {
    params.Range = `bytes=${opts.start}-${opts.end}`
  }

  const stream = _getClientForBucket(bucketName)
    .getObject(params)
    .createReadStream()

  const meteredStream = PersistorHelper.getMeteredStream(
    stream,
    (_, byteCount) => {
      // ignore the error parameter and just log the byte count
      metrics.count('s3.ingress', byteCount)
    }
  )

  try {
    await PersistorHelper.waitForStreamReady(stream)
    return meteredStream
  } catch (err) {
    throw PersistorHelper.wrapError(
      err,
      'error reading file from S3',
      { bucketName, key, opts },
      ReadError
    )
  }
}

async function deleteDirectory(bucketName, key) {
  let response

  try {
    response = await _getClientForBucket(bucketName)
      .listObjects({ Bucket: bucketName, Prefix: key })
      .promise()
  } catch (err) {
    throw PersistorHelper.wrapError(
      err,
      'failed to list objects in S3',
      { bucketName, key },
      ReadError
    )
  }

  const objects = response.Contents.map(item => ({ Key: item.Key }))
  if (objects.length) {
    try {
      await _getClientForBucket(bucketName)
        .deleteObjects({
          Bucket: bucketName,
          Delete: {
            Objects: objects,
            Quiet: true
          }
        })
        .promise()
    } catch (err) {
      throw PersistorHelper.wrapError(
        err,
        'failed to delete objects in S3',
        { bucketName, key },
        WriteError
      )
    }
  }
}

async function getFileSize(bucketName, key) {
  try {
    const response = await _getClientForBucket(bucketName)
      .headObject({ Bucket: bucketName, Key: key })
      .promise()
    return response.ContentLength
  } catch (err) {
    throw PersistorHelper.wrapError(
      err,
      'error getting size of s3 object',
      { bucketName, key },
      ReadError
    )
  }
}

async function getFileMd5Hash(bucketName, key) {
  try {
    const response = await _getClientForBucket(bucketName)
      .headObject({ Bucket: bucketName, Key: key })
      .promise()
    return _md5FromResponse(response)
  } catch (err) {
    throw PersistorHelper.wrapError(
      err,
      'error getting hash of s3 object',
      { bucketName, key },
      ReadError
    )
  }
}

async function deleteFile(bucketName, key) {
  try {
    await _getClientForBucket(bucketName)
      .deleteObject({ Bucket: bucketName, Key: key })
      .promise()
  } catch (err) {
    // s3 does not give us a NotFoundError here
    throw PersistorHelper.wrapError(
      err,
      'failed to delete file in S3',
      { bucketName, key },
      WriteError
    )
  }
}

async function copyFile(bucketName, sourceKey, destKey) {
  const params = {
    Bucket: bucketName,
    Key: destKey,
    CopySource: `${bucketName}/${sourceKey}`
  }
  try {
    await _getClientForBucket(bucketName)
      .copyObject(params)
      .promise()
  } catch (err) {
    throw PersistorHelper.wrapError(
      err,
      'failed to copy file in S3',
      params,
      WriteError
    )
  }
}

async function checkIfFileExists(bucketName, key) {
  try {
    await getFileSize(bucketName, key)
    return true
  } catch (err) {
    if (err instanceof NotFoundError) {
      return false
    }
    throw PersistorHelper.wrapError(
      err,
      'error checking whether S3 object exists',
      { bucketName, key },
      ReadError
    )
  }
}

async function directorySize(bucketName, key) {
  try {
    const response = await _getClientForBucket(bucketName)
      .listObjects({ Bucket: bucketName, Prefix: key })
      .promise()

    return response.Contents.reduce((acc, item) => item.Size + acc, 0)
  } catch (err) {
    throw PersistorHelper.wrapError(
      err,
      'error getting directory size in S3',
      { bucketName, key },
      ReadError
    )
  }
}

const _clients = new Map()
let _defaultClient

function _getClientForBucket(bucket) {
  if (_clients[bucket]) {
    return _clients[bucket]
  }

  if (
    settings.filestore.s3BucketCreds &&
    settings.filestore.s3BucketCreds[bucket]
  ) {
    _clients[bucket] = new S3(
      _buildClientOptions(settings.filestore.s3BucketCreds[bucket])
    )
    return _clients[bucket]
  }

  // no specific credentials for the bucket
  if (_defaultClient) {
    return _defaultClient
  }

  if (settings.filestore.s3.key) {
    _defaultClient = new S3(_buildClientOptions())
    return _defaultClient
  }

  throw new SettingsError({
    message: 'no bucket-specific or default credentials provided',
    info: { bucket }
  })
}

function _buildClientOptions(bucketCredentials) {
  const options = {}

  if (bucketCredentials) {
    options.credentials = {
      accessKeyId: bucketCredentials.auth_key,
      secretAccessKey: bucketCredentials.auth_secret
    }
  } else {
    options.credentials = {
      accessKeyId: settings.filestore.s3.key,
      secretAccessKey: settings.filestore.s3.secret
    }
  }

  if (settings.filestore.s3.endpoint) {
    const endpoint = new URL(settings.filestore.s3.endpoint)
    options.endpoint = settings.filestore.s3.endpoint
    options.sslEnabled = endpoint.protocol === 'https'
  }

  // path-style access is only used for acceptance tests
  if (settings.filestore.s3.pathStyle) {
    options.s3ForcePathStyle = true
  }

  return options
}

function _md5FromResponse(response) {
  const md5 = (response.ETag || '').replace(/[ "]/g, '')
  if (!md5.match(/^[a-f0-9]{32}$/)) {
    return null
  }

  return md5
}
