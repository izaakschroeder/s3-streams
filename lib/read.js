
'use strict';

var _ = require('lodash'),
	Stream = require('readable-stream'),
	util = require('util');

/**
 * @constructor
 * @param {AWS.S3} client S3 client.
 * @param {Object} options AWS options.
 * @param {Object} streamOptions Passed to the underlying Stream.Readable.
 */
function S3ReadStream(client, options, streamOptions) {
	if (this instanceof S3ReadStream === false) {
		return new S3ReadStream(client, options, streamOptions);
	}

	if (!client || !_.isFunction(client.getObject)) {
		throw new TypeError();
	}

	if (!_.has(options, 'Bucket')) {
		throw new TypeError();
	}

	if (!_.has(options, 'Key')) {
		throw new TypeError();
	}

	Stream.Readable.call(this, _.assign({ highWaterMark: 4194304 }, streamOptions));
	this._offset = 0;
	this._contentLength = 0;
	this._headersSent = false;
	this._waiting = false;
	this._more = 0;
	this.options = options;
	this.client = client;


}
util.inherits(S3ReadStream, Stream.Readable);

S3ReadStream.prototype.request = function request() {
	if (this.req) {
		return this.stream;
	}
	var self = this;
	this.req = this.client.getObject(_.assign({ }, this.options));
	this.stream = this.req.on('httpHeaders', function httpHeaders(statusCode, headers) {

		// Broadcast any errors.
		if (statusCode >= 300) {
			self.emit('error', { statusCode: statusCode });
			return;
		}

		// Update local info.
		//if (headers['content-range']) {
		//	self._contentLength = parseInt(headers['content-range'].split('/')[1], 10);
		//} else {
		self._contentLength = parseInt(headers['content-length'], 10);
		//}

		// Only send headers once.
		if (self._headersSent) {
			return;
		}

		self._headersSent = true;

		// Mimic an AWS S3 object.
		self.emit('open', {
			ContentLength: self._contentLength,
			ContentType: headers['content-type'],
			Bucket: self.options.Bucket,
			Key: self.options.Key,
			Body: self
		});
	}).createReadStream().on('end', function end() {
		if (!self._headersSent) {
			return self.emit('error', { type: 'NO_HEADERS' });
		}
		self.push(null);
	}).on('error', function error(err) {
		self.emit('error', err);
	}).on('readable', function readable() {
		var chunk;
		while ((null !== (chunk = this.read(self._more))) && self._more) {
			self._more -= chunk.length;
			self.push(chunk);
		}
	});
	return this.stream;
};

/**
 * @param {Number} size Amount of data to read.
 * @returns {Undefined} Nothing.
 * @see Stream.Readable._read
 */
S3ReadStream.prototype._read = function _read(size) {
	this._more += size;
	this.request();
};

module.exports = S3ReadStream;
