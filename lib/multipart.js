
var _ = require('lodash'),
	crypto = require('crypto'),
	Promise = require('bluebird');

/**
 * @constructor
 * @param {AWS.S3} s3 Instance.
 * @param {Object} options Options.
 */
function MultipartUpload(s3, options) {

	//
	if (this instanceof MultipartUpload === false) {
		return new MultipartUpload(s3, options);
	}

	// Safety first
	if (!s3 || !_.isFunction(s3.createMultipartUpload)) {
		throw new TypeError();
	}

	if (!_.has(options, 'Bucket')) {
		throw new TypeError();
	}

	if (!_.has(options, 'Key')) {
		throw new TypeError();
	}

	this.s3 = s3;
	this.options = options;
	this.upload = this.create();
	this.parts = [ ];
}

/**
 *
 *
 * @returns {Promise} The upload ID of the new multipart upload.
 */
MultipartUpload.prototype.create = function create() {
	var self = this;
	return new Promise(function uploadPromise(resolve, reject) {
		self.s3.createMultipartUpload(self.options, function uploadDone(err, data) {
			return err ? reject(err) : resolve(data.UploadId);
		});
	});
};

/**
 *
 *
 * @returns {Promise} AWS result of the abortion.
 */
MultipartUpload.prototype.abort = function abort() {
	var self = this;
	return self.upload.then(function afterUpload(uploadId) {
		return new Promise(function abortPromise(resolve, reject) {
			self.s3.abortMultipartUpload({
				Key: self.options.Key,
				Bucket: self.options.Bucket,
				UploadId: uploadId
			}, function abortDone(err, result) {
				return err ? reject(err) : resolve(result);
			});
		});
	});
};

/**
 * Upload a part of a multipart upload.
 * @param {Buffer} data Buffer to turn into an upload part.
 * @returns {Promise<Part>} The upload part.
 */
MultipartUpload.prototype.uploadPart = function uploadPart(data) {
	var self = this,
		partNumber = this.parts.length + 1;

	var part = this.upload.then(function afterUpload(uploadId) {
		return new Promise(function partPromise(resolve, reject) {
			var s3Part = {
				Bucket: self.options.Bucket,
				Key: self.options.Key,
				Body: data,
				UploadId: uploadId,
				PartNumber: partNumber
			};

			// If the user wants verify the integrity of their upload parts
			if (self.options.ContentMD5) {
				s3Part.ContentMD5 = crypto
					.createHash('md5')
					.update(data)
					.digest('base64');
			}

			self.s3.uploadPart(s3Part, function partDone(err, result) {
				return (err) ? reject(err) : resolve(_.assign({ }, result, {
					PartNumber: partNumber
				}));
			});
		});
	});

	this.parts.push(part);

	return part;
};

/**
 * Complete the multipart upload.
 * @returns {Promise} The AWS result for completing the multipart upload.
 */
MultipartUpload.prototype.finish = function finish() {
	var self = this;
	return self.upload.then(function afterUpload(uploadId) {
		return Promise.all(self.parts).then(function afterParts(parts) {
			return new Promise(function multipartPromise(resolve, reject) {
				self.s3.completeMultipartUpload({
					Bucket: self.options.Bucket,
					Key: self.options.Key,
					UploadId: uploadId,
					MultipartUpload: {
						Parts: parts
					}
				}, function multipartComplete(err, result) {
					return err ? reject(err) : resolve(result);
				});
			});
		});
	});
};

module.exports = MultipartUpload;
