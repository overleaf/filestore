settings = require("settings-sharelatex")
logger = require("logger-sharelatex")
S3FilestoreManager = require("./S3FilestoreManager")

logger.log backend:settings.filestoreBackend,"Loading backend"
module.exports = switch settings.filestoreBackend
	when "s3",null
		S3FilestoreManager
	else
		throw new Error( "Unknown filestore backend: #{settings.filestoreBackend}" )
