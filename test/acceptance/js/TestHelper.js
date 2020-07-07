const streamifier = require('streamifier')
const rp = require('request-promise-native').defaults({
  resolveWithFullResponse: true
})

const { expect } = require('chai')

module.exports = {
  uploadStringToPersistor,
  getStringFromPersistor,
  expectPersistorToHaveFile,
  expectPersistorNotToHaveFile,
  streamToString,
  getMetric
}

async function getMetric(filestoreUrl, metric) {
  const res = await rp.get(`${filestoreUrl}/metrics`)
  expect(res.statusCode).to.equal(200)
  const metricRegex = new RegExp(`^${metric}{[^}]+} ([0-9]+)$`, 'm')
  const found = metricRegex.exec(res.body)
  return parseInt(found ? found[1] : 0) || 0
}

function streamToString(stream) {
  const chunks = []
  return new Promise((resolve, reject) => {
    stream.on('data', chunk => chunks.push(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    stream.resume()
  })
}

async function uploadStringToPersistor(persistor, bucket, key, content) {
  const fileStream = streamifier.createReadStream(content)
  await persistor.sendStream(bucket, key, fileStream)
}

async function getStringFromPersistor(persistor, bucket, key) {
  const stream = await persistor.getObjectStream(bucket, key, {})
  return streamToString(stream)
}

async function expectPersistorToHaveFile(persistor, bucket, key, content) {
  const foundContent = await getStringFromPersistor(persistor, bucket, key)
  expect(foundContent).to.equal(content)
}

async function expectPersistorNotToHaveFile(persistor, bucket, key) {
  await expect(
    getStringFromPersistor(persistor, bucket, key)
  ).to.eventually.have.been.rejected.with.property('name', 'NotFoundError')
}
