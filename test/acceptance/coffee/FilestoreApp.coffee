app = require('../../../app')
require("logger-sharelatex").logger.level("info")
logger = require("logger-sharelatex")
Settings = require("settings-sharelatex")
Metrics = require("metrics-sharelatex")

module.exports =
	running: false
	initing: false
	server: null
	callbacks: []
	ensureRunning: (callback = (error) ->) ->
		if @running
			return callback()
		else if @initing
			@callbacks.push callback
		else
			@initing = true
			@callbacks.push callback
			@server = app.listen Settings.internal?.filestore?.port, "localhost", (error) =>
				throw error if error?
				@running = true
				logger.log("filestore running in dev mode")

				for callback in @callbacks
					callback()

	stop: (callback = (error) ->) ->
		logger.log("stopping")
		@server.close (error) ->
			logger.log("stopped")
			Metrics.close()
			callback(error)
