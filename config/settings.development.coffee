module.exports =
	internal:
		filestore:
			port: 3009
			host: "localhost"
			
	# which filestore to use
	# current options are:
	# "s3" - Amazon S3
	# if no filestore is chosen, s3 will be used by default
	filestoreManager: "s3"

	# ShareLaTeX stores binary files like images in S3.
	# Fill in your Amazon S3 credentials below.
	s3:
		key: ''
		secret: ''
		buckets:
			user_files: ""
			template_files: ""

	# Filestore health check
	# ----------------------
	# Project and file details to check in filestore when calling /health_check
	# health_check:
	# 	project_id: ""
	# 	file_id: ""
