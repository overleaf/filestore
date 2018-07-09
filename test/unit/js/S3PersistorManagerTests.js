/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const { assert } = require('chai')
const sinon = require('sinon')
const chai = require('chai')
const should = chai.should()
const { expect } = chai
const modulePath = '../../../app/js/S3PersistorManager.js'
const SandboxedModule = require('sandboxed-module')
const Errors = require('../../../app/js/Errors.js')

describe('S3PersistorManagerTests', function () {
  beforeEach(function () {
    this.settings = {
      filestore: {
        backend: 's3',
        s3: {
          secret: 'secret',
          key: 'this_key'
        },
        stores: {
          user_files: 'sl_user_files'
        }
      }
    }
    this.stubbedKnoxClient = {
      putFile: sinon.stub(),
      copyFile: sinon.stub(),
      list: sinon.stub(),
      deleteMultiple: sinon.stub(),
      get: sinon.stub()
    }
    this.knox =
			{createClient: sinon.stub().returns(this.stubbedKnoxClient)}
    this.LocalFileWriter = {
      writeStream: sinon.stub(),
      deleteFile: sinon.stub()
    }
    this.requires = {
      'knox': this.knox,
      'settings-sharelatex': this.settings,
      './LocalFileWriter': this.LocalFileWriter,
      'logger-sharelatex': {
        log () {},
        err () {}
      }
    }
    this.key = 'my/key'
    this.bucketName = 'my-bucket'
    return this.error = 'my errror'
  })

  describe('getFileStream', function () {
    beforeEach(function () {
      this.S3PersistorManager = SandboxedModule.require(modulePath, {requires: this.requires})
      return this.opts = {}
    })

    it('should use correct key', function (done) {
      this.stubbedKnoxClient.get.returns({
        on () {},
        end () {}
      })
      this.S3PersistorManager.getFileStream(this.bucketName, this.key, this.opts, err => {}) // empty callback
      this.stubbedKnoxClient.get.calledWith(this.key).should.equal(true)
      return done()
    })

    it('should use default auth', function (done) {
      this.stubbedKnoxClient.get.returns({
        on () {},
        end () {}
      })
      this.S3PersistorManager.getFileStream(this.bucketName, this.key, this.opts, err => {}) // empty callback
      const clientParams = {
        key: this.settings.filestore.s3.key,
        secret: this.settings.filestore.s3.secret,
        bucket: this.bucketName
      }
      this.knox.createClient.calledWith(clientParams).should.equal(true)
      return done()
    })

    describe('with supplied auth', function () {
      beforeEach(function () {
        this.S3PersistorManager = SandboxedModule.require(modulePath, {requires: this.requires})
        this.credentials = {
          auth_key: 'that_key',
          auth_secret: 'that_secret'
        }
        return this.opts =
					{credentials: this.credentials}
      })

      return it('should use supplied auth', function (done) {
        this.stubbedKnoxClient.get.returns({
          on () {},
          end () {}
        })
        this.S3PersistorManager.getFileStream(this.bucketName, this.key, this.opts, err => {}) // empty callback
        const clientParams = {
          key: this.credentials.auth_key,
          secret: this.credentials.auth_secret,
          bucket: this.bucketName
        }
        this.knox.createClient.calledWith(clientParams).should.equal(true)
        return done()
      })
    })

    describe('with start and end options', function () {
      beforeEach(function () {
        return this.opts = {
          start: 0,
          end: 8
        }
      })
      return it('should pass headers to the knox.Client.get()', function (done) {
        this.stubbedKnoxClient.get.returns({
          on () {},
          end () {}
        })
        this.S3PersistorManager.getFileStream(this.bucketName, this.key, this.opts, err => {}) // empty callback
        this.stubbedKnoxClient.get.calledWith(this.key, {'Range': 'bytes=0-8'}).should.equal(true)
        return done()
      })
    })

    return describe('error conditions', function () {
      beforeEach(function () {
        this.stubbedKnoxClient.get.returns({
          on: (key, callback) => {
            if (key === 'response') {
              return callback({statusCode: 500})
            }
          },
          end () {}
        })
      })

      describe("when the file doesn't exist", function () {
        beforeEach(function () {
          this.stubbedKnoxClient.get.returns({
            on: (key, callback) => {
              if (key === 'response') {
                return callback({statusCode: 404})
              }
            },
            end () {}
          })
        })

        it('should produce a NotFoundError', function (done) {
          return this.S3PersistorManager.getFileStream(this.bucketName, this.key, this.opts, (err, stream) => { // empty callback
            expect(stream).to.equal(null)
            expect(err).to.not.equal(null)
            expect(err).to.be.an.instanceOf(Error)
            expect(err.name).to.eq('NotFoundError')
            return done()
          })
        })

        return it('should have bucket and key in the Error message', function (done) {
          return this.S3PersistorManager.getFileStream(this.bucketName, this.key, this.opts, (err, stream) => { // empty callback
            expect(err).to.not.equal(null)
            err.message.should.match(new RegExp(`.*${this.bucketName}.*`))
            err.message.should.match(new RegExp(`.*${this.key}.*`))
            return done()
          })
        })
      })

      return describe('when the S3 service produces an error', function () {
        beforeEach(function () {
          this.stubbedKnoxClient.get.returns({
            on: (key, callback) => {
              if (key === 'response') {
                return callback({statusCode: 500})
              }
            },
            end () {}
          })
        })

        return it('should produce an error', function (done) {
          return this.S3PersistorManager.getFileStream(this.bucketName, this.key, this.opts, (err, stream) => { // empty callback
            expect(stream).to.equal(null)
            expect(err).to.not.equal(null)
            expect(err).to.be.an.instanceOf(Error)
            return done()
          })
        })
      })
    })
  })

  describe('sendFile', function () {
    beforeEach(function () {
      this.S3PersistorManager = SandboxedModule.require(modulePath, {requires: this.requires})
      return this.stubbedKnoxClient.putFile.returns({on () {}})
    })

    it('should put file with knox', function (done) {
      this.LocalFileWriter.deleteFile.callsArgWith(1)
      this.stubbedKnoxClient.putFile.callsArgWith(2, this.error)
      return this.S3PersistorManager.sendFile(this.bucketName, this.key, this.fsPath, err => {
        this.stubbedKnoxClient.putFile.calledWith(this.fsPath, this.key).should.equal(true)
        err.should.equal(this.error)
        return done()
      })
    })

    return it('should delete the file and pass the error with it', function (done) {
      this.LocalFileWriter.deleteFile.callsArgWith(1)
      this.stubbedKnoxClient.putFile.callsArgWith(2, this.error)
      return this.S3PersistorManager.sendFile(this.bucketName, this.key, this.fsPath, err => {
        this.stubbedKnoxClient.putFile.calledWith(this.fsPath, this.key).should.equal(true)
        err.should.equal(this.error)
        return done()
      })
    })
  })

  describe('sendStream', function () {
    beforeEach(function () {
      this.fsPath = 'to/some/where'
      this.origin =
				{on () {}}
      this.S3PersistorManager = SandboxedModule.require(modulePath, {requires: this.requires})
      return this.S3PersistorManager.sendFile = sinon.stub().callsArgWith(3)
    })

    it('should send stream to LocalFileWriter', function (done) {
      this.LocalFileWriter.deleteFile.callsArgWith(1)
      this.LocalFileWriter.writeStream.callsArgWith(2, null, this.fsPath)
      return this.S3PersistorManager.sendStream(this.bucketName, this.key, this.origin, () => {
        this.LocalFileWriter.writeStream.calledWith(this.origin).should.equal(true)
        return done()
      })
    })

    it('should return the error from LocalFileWriter', function (done) {
      this.LocalFileWriter.deleteFile.callsArgWith(1)
      this.LocalFileWriter.writeStream.callsArgWith(2, this.error)
      return this.S3PersistorManager.sendStream(this.bucketName, this.key, this.origin, err => {
        err.should.equal(this.error)
        return done()
      })
    })

    return it('should send the file to the filestore', function (done) {
      this.LocalFileWriter.deleteFile.callsArgWith(1)
      this.LocalFileWriter.writeStream.callsArgWith(2)
      return this.S3PersistorManager.sendStream(this.bucketName, this.key, this.origin, err => {
        this.S3PersistorManager.sendFile.called.should.equal(true)
        return done()
      })
    })
  })

  describe('copyFile', function () {
    beforeEach(function () {
      this.sourceKey = 'my/key'
      this.destKey = 'my/dest/key'
      return this.S3PersistorManager = SandboxedModule.require(modulePath, {requires: this.requires})
    })

    return it('should use knox to copy file', function (done) {
      this.stubbedKnoxClient.copyFile.callsArgWith(2, this.error)
      return this.S3PersistorManager.copyFile(this.bucketName, this.sourceKey, this.destKey, err => {
        err.should.equal(this.error)
        this.stubbedKnoxClient.copyFile.calledWith(this.sourceKey, this.destKey).should.equal(true)
        return done()
      })
    })
  })

  describe('deleteDirectory', function () {
    beforeEach(function () {
      return this.S3PersistorManager = SandboxedModule.require(modulePath, {requires: this.requires})
    })

    return it('should list the contents passing them onto multi delete', function (done) {
      const data =
				{Contents: [{Key: '1234'}, {Key: '456'}]}
      this.stubbedKnoxClient.list.callsArgWith(1, null, data)
      this.stubbedKnoxClient.deleteMultiple.callsArgWith(1)
      return this.S3PersistorManager.deleteDirectory(this.bucketName, this.key, err => {
        this.stubbedKnoxClient.deleteMultiple.calledWith(['1234', '456']).should.equal(true)
        return done()
      })
    })
  })

  describe('deleteFile', function () {
    it('should use correct options', function (done) {
      this.request = sinon.stub().callsArgWith(1)
      this.requires['request'] = this.request
      this.S3PersistorManager = SandboxedModule.require(modulePath, {requires: this.requires})

      return this.S3PersistorManager.deleteFile(this.bucketName, this.key, err => {
        const opts = this.request.args[0][0]
        assert.deepEqual(opts.aws, {key: this.settings.filestore.s3.key, secret: this.settings.filestore.s3.secret, bucket: this.bucketName})
        opts.method.should.equal('delete')
        opts.timeout.should.equal((30 * 1000))
        opts.uri.should.equal(`https://${this.bucketName}.s3.amazonaws.com/${this.key}`)
        return done()
      })
    })

    return it('should return the error', function (done) {
      this.request = sinon.stub().callsArgWith(1, this.error)
      this.requires['request'] = this.request
      this.S3PersistorManager = SandboxedModule.require(modulePath, {requires: this.requires})

      return this.S3PersistorManager.deleteFile(this.bucketName, this.key, err => {
        err.should.equal(this.error)
        return done()
      })
    })
  })

  describe('checkIfFileExists', function () {
    it('should use correct options', function (done) {
      this.request = sinon.stub().callsArgWith(1, null, {statusCode: 200})
      this.requires['request'] = this.request
      this.S3PersistorManager = SandboxedModule.require(modulePath, {requires: this.requires})

      return this.S3PersistorManager.checkIfFileExists(this.bucketName, this.key, err => {
        const opts = this.request.args[0][0]
        assert.deepEqual(opts.aws, {key: this.settings.filestore.s3.key, secret: this.settings.filestore.s3.secret, bucket: this.bucketName})
        opts.method.should.equal('head')
        opts.timeout.should.equal((30 * 1000))
        opts.uri.should.equal(`https://${this.bucketName}.s3.amazonaws.com/${this.key}`)
        return done()
      })
    })

    it('should return true for a 200', function (done) {
      this.request = sinon.stub().callsArgWith(1, null, {statusCode: 200})
      this.requires['request'] = this.request
      this.S3PersistorManager = SandboxedModule.require(modulePath, {requires: this.requires})
      return this.S3PersistorManager.checkIfFileExists(this.bucketName, this.key, (err, exists) => {
        exists.should.equal(true)
        return done()
      })
    })

    it('should return false for a non 200', function (done) {
      this.request = sinon.stub().callsArgWith(1, null, {statusCode: 404})
      this.requires['request'] = this.request
      this.S3PersistorManager = SandboxedModule.require(modulePath, {requires: this.requires})
      return this.S3PersistorManager.checkIfFileExists(this.bucketName, this.key, (err, exists) => {
        exists.should.equal(false)
        return done()
      })
    })

    return it('should return the error', function (done) {
      this.request = sinon.stub().callsArgWith(1, this.error, {})
      this.requires['request'] = this.request
      this.S3PersistorManager = SandboxedModule.require(modulePath, {requires: this.requires})

      return this.S3PersistorManager.checkIfFileExists(this.bucketName, this.key, err => {
        err.should.equal(this.error)
        return done()
      })
    })
  })

  return describe('directorySize', function () {
    beforeEach(function () {
      return this.S3PersistorManager = SandboxedModule.require(modulePath, {requires: this.requires})
    })

    return it('should sum directory files size', function (done) {
      const data =
				{Contents: [ {Size: 1024}, {Size: 2048} ]}
      this.stubbedKnoxClient.list.callsArgWith(1, null, data)
      return this.S3PersistorManager.directorySize(this.bucketName, this.key, (err, totalSize) => {
        totalSize.should.equal(3072)
        return done()
      })
    })
  })
})
