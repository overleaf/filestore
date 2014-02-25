settings = require("settings-sharelatex")
logger = require("logger-sharelatex")
S3FilestoreManager = require("./S3FilestoreManager")

logger.log backend:settings.filestoreManager,"Loading backend"
module.exports = switch settings.filestoreManager
	when "s3",null
		S3FilestoreManager
	else
		throw new Error( "Unknown filestore backend: #{settings.filestoreManager}" )
