logger = require("logger-sharelatex")
assert = require("chai").assert
sinon = require('sinon')
chai = require('chai')
should = chai.should()
expect = chai.expect
modulePath = "../../../app/js/FilestoreManager.js"
SandboxedModule = require('sandboxed-module')


describe "FilestoreManagerTests", ->

	beforeEach ->
		@S3FilestoreManager =
			getFileStream: sinon.stub()
			checkIfFileExists: sinon.stub()
			deleteFile: sinon.stub()
			deleteDirectory: sinon.stub()
			sendStreamToS3: sinon.stub()
			insertFile: sinon.stub()

	describe "test s3 mixin", ->
		beforeEach ->
			@settings =
				filestoreBackend: "s3"
			@requires =
				"./S3FilestoreManager": @S3FilestoreManager
				"settings-sharelatex": @settings
				"logger-sharelatex":
					log:->
					err:->
			@FilestoreManager = SandboxedModule.require modulePath, requires: @requires

		it "should load getFileStream", (done) ->
			@FilestoreManager.should.respondTo("getFileStream")
			@FilestoreManager.getFileStream()
			@S3FilestoreManager.getFileStream.calledOnce.should.equal true
			done()

		it "should load checkIfFileExists", (done) ->
			@FilestoreManager.checkIfFileExists()
			@S3FilestoreManager.checkIfFileExists.calledOnce.should.equal true
			done()

		it "should load deleteFile", (done) ->
			@FilestoreManager.deleteFile()
			@S3FilestoreManager.deleteFile.calledOnce.should.equal true
			done()

		it "should load deleteDirectory", (done) ->
			@FilestoreManager.deleteDirectory()
			@S3FilestoreManager.deleteDirectory.calledOnce.should.equal true
			done()

		it "should load sendStreamToS3", (done) ->
			@FilestoreManager.sendStreamToS3()
			@S3FilestoreManager.sendStreamToS3.calledOnce.should.equal true
			done()

		it "should load insertFile", (done) ->
			@FilestoreManager.insertFile()
			@S3FilestoreManager.insertFile.calledOnce.should.equal true
			done()

	describe "test unspecified mixins", ->

		it "should load s3 when no manager specified", (done) ->
			@settings =
			@requires =
				"./S3FilestoreManager": @S3FilestoreManager
				"settings-sharelatex": @settings
				"logger-sharelatex":
					log:->
					err:->
			@FilestoreManager=SandboxedModule.require modulePath, requires: @requires
			@FilestoreManager.should.respondTo("getFileStream")
			@FilestoreManager.getFileStream()
			@S3FilestoreManager.getFileStream.calledOnce.should.equal true
			done()

	describe "test invalid mixins", ->
		it "should not load an invalid manager", (done) ->
			@settings =
				filestoreBackend:"magic"
			@requires =
				"./S3FilestoreManager": @S3FilestoreManager
				"settings-sharelatex": @settings
				"logger-sharelatex":
					log:->
					err:->
			@FilestoreManager=null
			try
				@FilestoreManager=SandboxedModule.require modulePath, requires: @requires
			catch error
				assert.equal("Unknown filestore backend: magic",error.message)
			assert.isNull(@FilestoreManager)
			done()


