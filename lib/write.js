
var _ = require('lodash'),
	MultipartUpload = require('./multipart'),
	Stream = require('readable-stream'),
	util = require('util');

/**
 * @constructor
 * @param {AWS.S3} client S3 client.
 * @param {Object} options AWS options.
 * @param {Object} streamOptions Passed to the underlying Stream.Writable.
 */
function S3WriteStream(client, options, streamOptions) {
	// Allow people to get away with not using "new"
	if (this instanceof S3WriteStream === false) {
		return new S3WriteStream(client, options, streamOptions);
	}

	// Some sensible defaults
	streamOptions = _.assign({
		highWaterMark: 10485760
	}, streamOptions);

	// The minimum multipart chunk size is 5 MB so we need at LEAST
	// that much space available in buffers.
	if (streamOptions.highWaterMark < S3WriteStream.lowWaterMark) {
		throw new TypeError();
	}

	Stream.Writable.call(this, streamOptions);
	this.upload = new MultipartUpload(client, options);

	// Start by buffering data since AWS requires at least 5 MB
	// of buffered chunks in one go.
	this.cork();
}
util.inherits(S3WriteStream, Stream.Writable);
S3WriteStream.lowWaterMark = 5242880;

/**
 * We override the normal end call to mark when the EOS is
 * actually occuring. This is necessary since Stream.Writable
 * provides no `_flush` method that actually works.
 *
 * @param {Buffer} data Data to write.
 * @param {String} encoding Encoding of data.
 * @param {Function} cb Callback when write is done.
 * @returns {void}
 *
 * @see Stream.Writable.ending
 */
S3WriteStream.prototype.end = function end(data, encoding, cb) {
	var self = this;

	if (_.isFunction(data)) {
		cb = data;
		data = null;
		encoding = null;
	} else if (_.isFunction(encoding)) {
		cb = encoding;
		encoding = null;
	}

	function finalize() {
		self.upload.finish().then(function finished() {
			// Finally we can actually trigger the upstream end.
			Stream.Writable.prototype.end.call(self, cb);
		}).catch(function errored(err) {
			// We failed; emulate how the writable triggers errors
			self._writableState.errorEmitted = true;
			if (_.isFunction(cb)) {
				cb(err);
			}
			self.emit('error', err);
		});
	}

	// If we have data to write, then it's easy we just chain our _flush
	// to the end of the write call, otherwise we write some dummy buffer
	// with nothing in it which will be called after the last other peice
	// of data has been finished writing.
	if (data) {
		self.write(data, encoding, finalize);
	} else {
		self.write(new Buffer(0), finalize);
	}

	// Uncork and flush everything
	if (self._writableState.corked) {
		self._writableState.corked = 1;
		self.uncork();
	}
};

/**
 * We override the normal write since streams provide no minimum
 * buffer threshold before underlying writes begin. We do this
 * by making use of `cork` and `uncork` to turn buffering on and
 * off as necessary.
 * @returns {Undefined} Nothing.
 * @see Stream.Writable.write
 */
S3WriteStream.prototype.write = function write() {
	// Write normally; since we're corked this isn't going to
	// do anything other than add data to the buffer.
	var result = Stream.Writable.prototype.write.apply(this, arguments);

	// Check to see if we've past the upload threshold and if
	// so `uncork` so we can batch write everything at once. Since
	// `uncork` automatically invokes the underlying write, we can
	// safely call `cork` again immediately to go back to buffering.
	if (this._writableState.length >= S3WriteStream.lowWaterMark) {
		this.uncork();
		this.cork();
	}

	return result;
};

S3WriteStream.prototype._part = function _part(buffer, callback) {
	return this.upload.uploadPart(buffer)
		.then(_.partial(callback, null), callback);
};

/**
 * @param {Array} buffers Array of internal node write stream chunks.
 * @param {Function} callback Called on completion of the write.
 * @returns {Promise<Part>} The part resulting from the chunks.
 * @see Stream.Writable._writev
 */
S3WriteStream.prototype._writev = function _writev(buffers, callback) {
	var chunks = _.pluck(buffers, 'chunk'),
		data = Buffer.concat(chunks, this._writableState.length);
	return this._part(data, callback);
};

S3WriteStream.prototype._write = function _write(chunk, encoding, callback) {
	return this._part(chunk, callback);
};

module.exports = S3WriteStream;
