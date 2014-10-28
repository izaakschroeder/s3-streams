
'use strict';

var _ = require('lodash'),
	MultipartUpload = require('./multipart'),
	Stream = require('stream'),
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
	this._ending = false;

	// Start by buffering data since AWS requires at least 5 MB
	// of buffered chunks in one go.
	this.cork();

	// If an error occurs then abort the upload.
	//this.once('error', function error() {
	//	upload.abort();
	//});
}
util.inherits(S3WriteStream, Stream.Writable);
S3WriteStream.lowWaterMark = 5242880;

/**
 * We override the normal end call to mark when the EOS is
 * actually occuring. This is necessary since Stream.Writable
 * provides no `_flush` method that actually works.
 * @see Stream.Writable.ending
 * @returns {Undefined} Something.
 */
S3WriteStream.prototype.end = function end() {
	// Mark the stream as ending and continue on as normal.
	this._ending = true;
	return Stream.Writable.prototype.end.apply(this, arguments);
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
	Stream.Writable.prototype.write.apply(this, arguments);

	// Check to see if we've past the upload threshold and if
	// so `uncork` so we can batch write everything at once. Since
	// `uncork` automatically invokes the underlying write, we can
	// safely call `cork` again immediately to go back to buffering.
	if (this._writableState.length >= S3WriteStream.lowWaterMark) {
		this.uncork();
		this.cork();
	}
};

S3WriteStream.prototype._part = function _part(buffer, callback) {

	var part = this.upload.uploadPart(buffer);

	// Note that the stream is going down. This means that during
	// the this call to `uploadPart` the last part will have been
	// added to `parts` and thus it will be safe to finalize the
	// multi- part upload.
	if (this._ending) {
		this.upload.finish();
	}

	return part.then(_.partial(callback, null), callback);

};

/**
 * @param {Array} chunks Array of internal node write stream chunks.
 * @param {Function} callback Called on completion of the write.
 * @returns {Promise<Part>} The part resulting from the chunks.
 * @see Stream.Writable._writev
 */
S3WriteStream.prototype._writev = function _writev(chunks, callback) {
	var data = Buffer.concat(_.pluck(chunks, 'chunk'), this._writableState.length);
	return this._part(data, callback);
};

S3WriteStream.prototype._write = function _write(chunk, encoding, callback) {
	return this._part(chunk, callback);
};

module.exports = S3WriteStream;
