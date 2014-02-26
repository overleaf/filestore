settings = require("settings-sharelatex")
logger = require("logger-sharelatex")
S3FilestoreManager = require("./S3FilestoreManager")

logger.log backend:settings.filestoreManager,"Loading backend"
module.exports = switch settings.filestoreManager
	when "s3",null
		S3FilestoreManager
	else
		throw new Error( "Unknown filestore backend: #{settings.filestoreManager}" )

###
A filestore must expose the following methods:

sendFile   ( location, target, source, callback = (error)->)
sendStream ( location, target, source stream, callback = (error)->)  
getFileStream ( location, name, callback = (error, result)-> )
copyFile ( location, from, to, callback = (error)->)
deleteFile ( location, name, callback = (error)->)
deleteDirectory ( location, name, callback = (error)->)
checkIfFileExists (location, name, callback = (error,result)-> )

###
