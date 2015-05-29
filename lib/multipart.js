
'use strict';

var _ = require('lodash'),
	crypto = require('crypto'),
	Promise = require('bluebird');

// TODO: Eventually support the same kind of multipart E-Tags that S3 does?
// See: http://stackoverflow.com/questions/12186993
// Basically the problem is that if a large upload fails and you wish to resume
// it, you resume on the part boundary instead of re-uploading the whole file.
// However, to get the correct has, you have to rewind the file from the very
// beginning. AWS E-Tags sidestep this by just using the E-Tags from all the
// collected parts. If uploading large files it may be wise to calculate the
// E-Tag first anyway, so you can verify the content hasn't changed when you
// redo the upload (à la Content-MD5).

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

	if (_.isString(options.ETag)) {
		this.eTag = {
			update: _.noop,
			digest: _.constant(options.ETag)
		};
	} else {
		this.eTag = options.ETag;
	}
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

	if (!Buffer.isBuffer(data)) {
		return Promise.reject(new TypeError('Must pass buffer.'));
	}

	if (self.eTag) {
		self.eTag.update(data);
	}

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
				var s3Options = {
					Bucket: self.options.Bucket,
					Key: self.options.Key,
					UploadId: uploadId,
					MultipartUpload: {
						Parts: parts
					}
				};

				if (self.eTag) {
					s3Options.ETag = self.eTag.digest('hex');
				}

				self.s3.completeMultipartUpload(s3Options, function multipartComplete(err, result) {
					return err ? reject(err) : resolve(result);
				});
			});
		});
	});
};

module.exports = MultipartUpload;
