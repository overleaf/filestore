const settings = require('settings-sharelatex')
const fs = require('fs')
const S3 = require('aws-sdk/clients/s3')
const S3Persistor = require('../app/js/S3Persistor.js')
const PromisePool = require('promise-pool')

const CONCURRENCY = 10
const S3_BUCKET = 'fake_user_files'
const OUTPUT_FILENAME = 'results.csv'
const ERRORS_FILENAME = 'errors.txt'

let lastUpdate = new Date()

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

async function writeResult(stream, filename, md5) {
  await stream.write(`${filename},${md5}\n`)
}

;(async function() {
  const client = new S3(_buildClientOptions())

  const stream = fs.createWriteStream(OUTPUT_FILENAME)
  const errorStream = fs.createWriteStream(ERRORS_FILENAME)

  const initialJob = {
    jobType: 'list'
  }

  const pool = new PromisePool.Pool(
    async jobDetails => {
      if (jobDetails.jobType === 'list') {
        return new Promise((resolve, reject) => {
          const requestOptions = {
            Bucket: S3_BUCKET
          }
          if (jobDetails.continuationToken) {
            requestOptions.ContinuationToken = jobDetails.continuationToken
          }
          client.listObjectsV2(requestOptions, (err, response) => {
            if (err) {
              errorStream.write(
                `Failed to list objects: ${JSON.stringify(
                  jobDetails
                )}, ${err}\n`
              )
              return reject(err)
            }
            Promise.all(
              response.Contents.map(async file => {
                if (!file.ETag.match(/^[a-f0-9]{32}$/)) {
                  await writeResult(stream, file.Key, file.ETag)
                } else {
                  pool.add({
                    jobType: 'md5',
                    key: file.Key
                  })
                }
              })
            )
              .then(() => {
                if (response.ContinuationToken) {
                  pool.add({
                    jobType: 'list',
                    continuationToken: response.ContinuationToken
                  })
                }
              })
              .catch(reject)
          })
        })
      }

      if (jobDetails.jobType === 'md5') {
        return new Promise((resolve, reject) => {
          S3Persistor.getFileMd5Hash(S3_BUCKET, jobDetails.key, (err, md5) => {
            if (err) {
              errorStream.write(
                `Failed to get object md5: ${JSON.stringify(
                  jobDetails
                )}, ${err}\n`
              )
              return reject(err)
            }
            writeResult(stream, jobDetails.key, md5)
              .then(resolve)
              .catch(reject)
          })
        })
      }
    },
    CONCURRENCY,
    false,
    [initialJob]
  )

  pool.retries = 10
  pool.retryInterval = 5000

  pool
    .start(progress => {
      if (progress.success) {
        const now = new Date()
        if (now - lastUpdate > 10000) {
          lastUpdate = new Date()
          console.log(
            `${progress.total} jobs queued. ${progress.rejected} failed, ${progress.fulfilled} succeeded`
          )
        }
      } else {
        console.log(JSON.stringify(progress))
      }
    })
    .then(() => {
      errorStream.close()
      stream.close()
      console.log("finished")
      process.exit(0)
    })
    .catch(err => {
      errorStream.close()
      stream.close()
      console.log(err)
      process.exit(1)
    })
})()
