/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const http = require('http');
http.globalAgent.maxSockets = 300;
const https = require('https');
https.globalAgent.maxSockets = 300;
const settings = require("settings-sharelatex");
const request = require("request");
const logger = require("logger-sharelatex");
const fs = require("fs");
const knox = require("knox");
const path = require("path");
const LocalFileWriter = require("./LocalFileWriter");
const Errors = require("./Errors");
const _ = require("underscore");

const thirtySeconds = 30 * 1000;

const buildDefaultOptions = (bucketName, method, key)=>
	({
			aws: {
				key: settings.filestore.s3.key,
				secret: settings.filestore.s3.secret,
				bucket: bucketName
			},
			method,
			timeout: thirtySeconds,
			uri:`https://${bucketName}.s3.amazonaws.com/${key}`
	})
;

module.exports = {

	sendFile(bucketName, key, fsPath, callback){
		const s3Client = knox.createClient({
			key: settings.filestore.s3.key,
			secret: settings.filestore.s3.secret,
			bucket: bucketName
		});
		const putEventEmiter = s3Client.putFile(fsPath, key, function(err, res){
			if (err != null) {
				logger.err({err,  bucketName, key, fsPath},"something went wrong uploading file to s3");
				return callback(err);
			}
			if ((res == null)) {
				logger.err({err, res, bucketName, key, fsPath}, "no response from s3 put file");
				return callback("no response from put file");
			}
			if (res.statusCode !== 200) {
				logger.err({bucketName, key, fsPath}, "non 200 response from s3 putting file");
				return callback("non 200 response from s3 on put file");
			}
			return LocalFileWriter.deleteFile(fsPath, function(err){
				logger.log({res,  bucketName, key, fsPath},"file uploaded to s3");
				return callback(err);
			});
		});
		return putEventEmiter.on("error", function(err){
			logger.err({err,  bucketName, key, fsPath}, "error emmited on put of file");
			return callback(err);
		});
	},

	sendStream(bucketName, key, readStream, callback){
		logger.log({bucketName, key}, "sending file to s3");
		readStream.on("error", err=> logger.err({bucketName, key}, "error on stream to send to s3"));
		return LocalFileWriter.writeStream(readStream, null, (err, fsPath)=> {
			if (err != null) {
				logger.err({bucketName, key, fsPath, err}, "something went wrong writing stream to disk");
				return callback(err);
			}
			return this.sendFile(bucketName, key, fsPath, callback);
		});
	},

	// opts may be {start: Number, end: Number}
	getFileStream(bucketName, key, opts, callback){
		if (callback == null) { callback = function(err, res){}; }
		opts = opts || {};
		const headers = {};
		if ((opts.start != null) && (opts.end != null)) {
			headers['Range'] = `bytes=${opts.start}-${opts.end}`;
		}
		callback = _.once(callback);
		logger.log({bucketName, key}, "getting file from s3");
		const s3Client = knox.createClient({
			key: (opts.credentials != null ? opts.credentials.auth_key : undefined) || settings.filestore.s3.key,
			secret: (opts.credentials != null ? opts.credentials.auth_secret : undefined) || settings.filestore.s3.secret,
			bucket: bucketName
		});
		const s3Stream = s3Client.get(key, headers);
		s3Stream.end();
		s3Stream.on('response', function(res) {
			if (res.statusCode === 404) {
				logger.log({bucketName, key}, "file not found in s3");
				return callback(new Errors.NotFoundError(`File not found in S3: ${bucketName}:${key}`), null);
			}
			if (![200, 206].includes(res.statusCode)) {
				logger.log({bucketName, key}, `error getting file from s3: ${res.statusCode}`);
				return callback(new Error(`Got non-200 response from S3: ${res.statusCode}`), null);
			}
			return callback(null, res);
		});
		return s3Stream.on('error', function(err) {
			logger.err({err, bucketName, key}, "error getting file stream from s3");
			return callback(err);
		});
	},

	copyFile(bucketName, sourceKey, destKey, callback){
		logger.log({bucketName, sourceKey, destKey}, "copying file in s3");
		const s3Client = knox.createClient({
			key: settings.filestore.s3.key,
			secret: settings.filestore.s3.secret,
			bucket: bucketName
		});
		return s3Client.copyFile(sourceKey, destKey, function(err){
			if (err != null) {
				logger.err({err, bucketName, sourceKey, destKey}, "something went wrong copying file in aws");
			}
			return callback(err);
		});
	},

	deleteFile(bucketName, key, callback){
		logger.log({bucketName, key}, "delete file in s3");
		const options = buildDefaultOptions(bucketName, "delete", key);
		return request(options, function(err, res){
			if (err != null) {
				logger.err({err, res, bucketName, key}, "something went wrong deleting file in aws");
			}
			return callback(err);
		});
	},

	deleteDirectory(bucketName, key, _callback){
		// deleteMultiple can call the callback multiple times so protect against this.
		const callback = function(...args) {
			_callback(...Array.from(args || []));
			return _callback = function() {};
		};

		logger.log({key, bucketName}, "deleting directory");
		const s3Client = knox.createClient({
			key: settings.filestore.s3.key,
			secret: settings.filestore.s3.secret,
			bucket: bucketName
		});
		return s3Client.list({prefix:key}, function(err, data){
			if (err != null) {
				logger.err({err, bucketName, key}, "something went wrong listing prefix in aws");
				return callback(err);
			}
			const keys = _.map(data.Contents, entry=> entry.Key);
			return s3Client.deleteMultiple(keys, callback);
		});
	},

	checkIfFileExists(bucketName, key, callback){
		logger.log({bucketName, key}, "checking if file exists in s3");
		const options = buildDefaultOptions(bucketName, "head", key);
		return request(options, function(err, res){
			if (err != null) {
				logger.err({err, res, bucketName, key}, "something went wrong checking file in aws");
				return callback(err);
			}
			if ((res == null)) {
				logger.err({err, res, bucketName, key}, "no response object returned when checking if file exists");
				err = new Error(`no response from s3 ${bucketName} ${key}`);
				return callback(err);
			}
			const exists = res.statusCode === 200;
			logger.log({bucketName, key, exists}, "checked if file exsists in s3");
			return callback(err, exists);
		});
	},

	directorySize(bucketName, key, callback){
		logger.log({bucketName, key}, "get project size in s3");
		const s3Client = knox.createClient({
			key: settings.filestore.s3.key,
			secret: settings.filestore.s3.secret,
			bucket: bucketName
		});
		return s3Client.list({prefix:key}, function(err, data){
			if (err != null) {
				logger.err({err, bucketName, key}, "something went wrong listing prefix in aws");
				return callback(err);
			}
			let totalSize = 0;
			_.each(data.Contents, entry=> totalSize += entry.Size);
			logger.log({totalSize}, "total size");
			return callback(null, totalSize);
		});
	}
};
