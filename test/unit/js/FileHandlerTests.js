const sinon = require('sinon')
const chai = require('chai')
const { expect } = chai
const modulePath = '../../../app/js/FileHandler.js'
const SandboxedModule = require('sandboxed-module')
const { ObjectId } = require('mongodb')
const Errors = require('../../../app/js/Errors')

chai.use(require('sinon-chai'))
chai.use(require('chai-as-promised'))

describe('FileHandler', function() {
  let PersistorManager,
    LocalFileWriter,
    FileConverter,
    KeyBuilder,
    ImageOptimiser,
    FileHandler,
    fs

  const Settings = {
    retryDelay: 1,
    maxRetries: 2
  }

  const bucket = 'my_bucket'
  const key = `${ObjectId()}/${ObjectId()}`
  const convertedFolderKey = `${ObjectId()}/${ObjectId()}`
  const projectKey = `${ObjectId()}/`
  const sourceStream = 'sourceStream'
  const convertedKey = 'convertedKey'
  const readStream = {
    stream: 'readStream',
    on: sinon.stub()
  }

  beforeEach(function() {
    PersistorManager = {
      promises: {
        getFileStream: sinon.stub().resolves(sourceStream),
        checkIfFileExists: sinon.stub().resolves(),
        deleteFile: sinon.stub().resolves(),
        deleteDirectory: sinon.stub().resolves(),
        sendStream: sinon.stub().resolves(),
        insertFile: sinon.stub().resolves(),
        sendFile: sinon.stub().resolves(),
        directorySize: sinon.stub().resolves()
      }
    }
    LocalFileWriter = {
      // the callback style is used for detached cleanup calls
      deleteFile: sinon.stub().yields(),
      promises: {
        writeStream: sinon.stub().resolves(),
        deleteFile: sinon.stub().resolves()
      }
    }
    FileConverter = {
      promises: {
        convert: sinon.stub().resolves(),
        thumbnail: sinon.stub().resolves(),
        preview: sinon.stub().resolves()
      }
    }
    KeyBuilder = {
      addCachingToKey: sinon.stub().returns(convertedKey),
      getConvertedFolderKey: sinon.stub().returns(convertedFolderKey)
    }
    ImageOptimiser = {
      promises: {
        compressPng: sinon.stub().resolves()
      }
    }
    fs = {
      createReadStream: sinon.stub().returns(readStream)
    }

    FileHandler = SandboxedModule.require(modulePath, {
      requires: {
        'settings-sharelatex': Settings,
        './PersistorManager': PersistorManager,
        './LocalFileWriter': LocalFileWriter,
        './FileConverter': FileConverter,
        './KeyBuilder': KeyBuilder,
        './ImageOptimiser': ImageOptimiser,
        './Errors': Errors,
        fs: fs
      },
      globals: { console }
    })
  })

  describe('insertFile', function() {
    const stream = 'stream'

    it('should send file to the filestore', function(done) {
      FileHandler.insertFile(bucket, key, stream, err => {
        expect(err).not.to.exist
        expect(PersistorManager.promises.sendStream).to.have.been.calledWith(
          bucket,
          key,
          stream
        )
        done()
      })
    })

    it('should delete the convertedKey folder', function(done) {
      FileHandler.insertFile(bucket, key, stream, err => {
        expect(err).not.to.exist
        expect(
          PersistorManager.promises.deleteDirectory
        ).to.have.been.calledWith(bucket, convertedFolderKey)
        done()
      })
    })

    it('should throw an error when the key is in the wrong format', function(done) {
      KeyBuilder.getConvertedFolderKey.returns('wombat')
      FileHandler.insertFile(bucket, key, stream, err => {
        expect(err).to.exist
        done()
      })
    })
  })

  describe('deleteFile', function() {
    it('should tell the filestore manager to delete the file', function(done) {
      FileHandler.deleteFile(bucket, key, err => {
        expect(err).not.to.exist
        expect(PersistorManager.promises.deleteFile).to.have.been.calledWith(
          bucket,
          key
        )
        done()
      })
    })

    it('should tell the filestore manager to delete the cached folder', function(done) {
      FileHandler.deleteFile(bucket, key, err => {
        expect(err).not.to.exist
        expect(
          PersistorManager.promises.deleteDirectory
        ).to.have.been.calledWith(bucket, convertedFolderKey)
        done()
      })
    })

    it('should throw an error when the key is in the wrong format', function(done) {
      KeyBuilder.getConvertedFolderKey.returns('wombat')
      FileHandler.deleteFile(bucket, key, err => {
        expect(err).to.exist
        done()
      })
    })
  })

  describe('deleteProject', function() {
    it('should tell the filestore manager to delete the folder', function(done) {
      FileHandler.deleteProject(bucket, projectKey, err => {
        expect(err).not.to.exist
        expect(
          PersistorManager.promises.deleteDirectory
        ).to.have.been.calledWith(bucket, projectKey)
        done()
      })
    })

    it('should throw an error when the key is in the wrong format', function(done) {
      FileHandler.deleteProject(bucket, 'wombat', err => {
        expect(err).to.exist
        done()
      })
    })
  })

  describe('getFile', function() {
    it('should return the source stream no format or style are defined', function(done) {
      FileHandler.getFile(bucket, key, null, (err, stream) => {
        expect(err).not.to.exist
        expect(stream).to.equal(sourceStream)
        done()
      })
    })

    it('should pass options through to PersistorManager', function(done) {
      const options = { start: 0, end: 8 }
      FileHandler.getFile(bucket, key, options, err => {
        expect(err).not.to.exist
        expect(PersistorManager.promises.getFileStream).to.have.been.calledWith(
          bucket,
          key,
          options
        )
        done()
      })
    })

    describe('when a format is defined', function() {
      let result

      describe('when the file is not cached', function() {
        beforeEach(function(done) {
          FileHandler.getFile(bucket, key, { format: 'png' }, (err, stream) => {
            result = { err, stream }
            done()
          })
        })

        it('should convert the file', function() {
          expect(FileConverter.promises.convert).to.have.been.called
        })

        it('should compress the converted file', function() {
          expect(ImageOptimiser.promises.compressPng).to.have.been.called
        })

        it('should return the the converted stream', function() {
          expect(result.err).not.to.exist
          expect(result.stream).to.equal(readStream)
          expect(
            PersistorManager.promises.getFileStream
          ).to.have.been.calledWith(bucket, key)
        })
      })

      describe('when the file is cached', function() {
        beforeEach(function(done) {
          PersistorManager.promises.checkIfFileExists = sinon
            .stub()
            .resolves(true)
          FileHandler.getFile(bucket, key, { format: 'png' }, (err, stream) => {
            result = { err, stream }
            done()
          })
        })

        it('should not convert the file', function() {
          expect(FileConverter.promises.convert).not.to.have.been.called
        })

        it('should not compress the converted file again', function() {
          expect(ImageOptimiser.promises.compressPng).not.to.have.been.called
        })

        it('should return the cached stream', function() {
          expect(result.err).not.to.exist
          expect(result.stream).to.equal(sourceStream)
          expect(
            PersistorManager.promises.getFileStream
          ).to.have.been.calledWith(bucket, convertedKey)
        })
      })
    })

    describe('when a style is defined', function() {
      it('generates a thumbnail when requested', function(done) {
        FileHandler.getFile(bucket, key, { style: 'thumbnail' }, err => {
          expect(err).not.to.exist
          expect(FileConverter.promises.thumbnail).to.have.been.called
          expect(FileConverter.promises.preview).not.to.have.been.called
          done()
        })
      })

      it('generates a preview when requested', function(done) {
        FileHandler.getFile(bucket, key, { style: 'preview' }, err => {
          expect(err).not.to.exist
          expect(FileConverter.promises.thumbnail).not.to.have.been.called
          expect(FileConverter.promises.preview).to.have.been.called
          done()
        })
      })
    })

    describe('when upstream returns an internal error', function() {
      it('should retry if upstream returns an error', function(done) {
        PersistorManager.promises.getFileStream
          .onCall(0)
          .rejects(new Errors.UpstreamError())
        FileHandler.getFile(bucket, key, null, (err, stream) => {
          expect(err).not.to.exist
          expect(stream).to.equal(sourceStream)
          expect(PersistorManager.promises.getFileStream).to.have.been
            .calledTwice
          done()
        })
      })

      it('should retry if upstream returns an error a second time', function(done) {
        PersistorManager.promises.getFileStream
          .onCall(0)
          .rejects(new Errors.UpstreamError())
        PersistorManager.promises.getFileStream
          .onCall(1)
          .rejects(new Errors.UpstreamError())
        FileHandler.getFile(bucket, key, null, (err, stream) => {
          expect(err).not.to.exist
          expect(stream).to.equal(sourceStream)
          expect(PersistorManager.promises.getFileStream).to.have.been
            .calledThrice
          done()
        })
      })

      it('should not retry if upstream returns an error too many times', function(done) {
        PersistorManager.promises.getFileStream = sinon
          .stub()
          .rejects(new Errors.UpstreamError())
        FileHandler.getFile(bucket, key, null, err => {
          expect(err).to.be.instanceOf(Errors.UpstreamError)
          done()
        })
      })
    })
  })

  describe('getDirectorySize', function() {
    it('should call the filestore manager to get directory size', function(done) {
      FileHandler.getDirectorySize(bucket, key, err => {
        expect(err).not.to.exist
        expect(PersistorManager.promises.directorySize).to.have.been.calledWith(
          bucket,
          key
        )
        done()
      })
    })
  })
})
