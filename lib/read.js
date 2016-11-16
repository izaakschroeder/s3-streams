'use strict';

var Stream = require('stream'),
	util = require('util');

/**
 * @constructor
 * @param {AWS.S3} client S3 client.
 * @param {Object} options AWS options.
 * @param {Object} streamOptions Passed to the underlying Stream.Readable.
 * @param {Boolean} unauthenticated true for an unauthenticated request. False by default.
 */
function S3ReadStream(client, options, streamOptions, unauthenticated) {
	if (this instanceof S3ReadStream === false) {
		return new S3ReadStream(client, options, streamOptions, unauthenticated);
	}

	if (!client || typeof client.getObject !== 'function') {
		throw new TypeError();
	}

	if (!options.hasOwnProperty('Bucket')) {
		throw new TypeError();
	}

	if (!options.hasOwnProperty('Key')) {
		throw new TypeError();
	}

	Stream.Readable.call(this, Object.assign({ highWaterMark: 4194304 }, streamOptions));
	this._offset = 0;
	this._contentLength = 0;
	this._headersSent = false;
	this._waiting = false;
	this._more = 0;
	this.options = options;
	this.client = client;
	this.unauthenticated = !!unauthenticated;

}
util.inherits(S3ReadStream, Stream.Readable);

S3ReadStream.prototype.request = function request() {
	if (this.req) {
		return this.stream;
	}
	var self = this;
	this.req = this.unauthenticated ?
		this.client.makeUnauthenticatedRequest('getObject', Object.assign({ }, this.options)) :
		this.client.getObject(Object.assign({ }, this.options));

	// req.send is called synchroneously by default inside the createReadStream
	// when it synchroneously emits an error (wrong params for example) we have not yet had a chance to
	// setup the error listener and the error is ignored.
	// Delaying the send works around that issue. File an issue to AWS-SDK for this.
	this.req._send = this.req.send;
	this.req.send = function sendAsync() {
		setImmediate(function sendNow() {
			self.req._send();
		});
	};

	this.stream = this.req.on('httpHeaders', function httpHeaders(statusCode, headers) {

		// Broadcast any errors.
		if (statusCode >= 300) {
			var error = new Error('Bad request, statusCode=' + statusCode);
			error.statusCode = statusCode;
			self.emit('error', error);
			return;
		}

		// Update local info.
		self._contentLength = parseInt(headers['content-length'], 10);

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
			var error = new Error('No header');
			error.type = 'NO_HEADERS';
			return self.emit('error', error);
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
 * Same as normal pipe with a few extra goodies packed in.
 * @param {Object} target Target stream to pipe to.
 * @param {Object} options Settings for the pipe.
 * @param {Boolean} options.smart Change pipe behavior based on target.
 * @returns {Object} Inner stream.
 */
S3ReadStream.prototype.pipe = function pipe(target, options) {
	options = Object.assign({
		smart: true
	}, options);
	if (options.smart && target.hasOwnProperty('setHeader')) {
		this.once('open', function opened(file) {
			target.setHeader('Content-Type', file.ContentType);
			target.setHeader('Content-Length', file.ContentLength);
		});
	}
	return Stream.Readable.prototype.pipe.apply(this, arguments);
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
