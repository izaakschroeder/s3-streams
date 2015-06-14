
var _ = require('lodash'),
	S3WriteStream = require('write'),
	Promise = require('bluebird');

describe('S3WriteStream', function() {

	beforeEach(function() {
		this.sandbox = sinon.sandbox.create();
		this.s3 = { createMultipartUpload: this.sandbox.stub() };
	});

	afterEach(function() {
		this.sandbox.restore();
	});

	describe('constructor', function() {
		it('should fail when no S3 instance is provided', function() {
			expect(S3WriteStream).to.throw(TypeError);
		});

		it('should fail when no `Bucket` parameter is provided', function() {
			expect(_.partial(S3WriteStream, this.s3, { Key: 'bar' })).to.throw(TypeError);
		});

		it('should fail when no `Key` parameter is provided', function() {
			expect(_.partial(S3WriteStream, this.s3, { Bucket: 'foo' })).to.throw(TypeError);
		});

		it('should fail when an invalid `highWaterMark` is provided', function() {
			expect(_.partial(S3WriteStream, this.s3, { Bucket: 'foo', Key: 'bar' }, { highWaterMark: 100 })).to.throw(TypeError);
		});

		it('should create a valid stream', function() {
			var stream = S3WriteStream(this.s3, { Bucket: 'foo', Key: 'bar' });
			expect(stream).to.be.an.instanceof(S3WriteStream);
		});

		it('should create a multipart upload', function() {

		});
	});

	describe('#end', function() {
		it('should finish the multipart upload', function() {

		});
	});

	describe('#write', function() {
		beforeEach(function() {
			this.stream = S3WriteStream(this.s3, { Bucket: 'foo', Key: 'bar' });
			this.sandbox.stub(this.stream, '_writev');
		});

		it('should not write any data if the chunk threshold is not met', function() {
			this.stream.write(new Buffer(S3WriteStream.lowWaterMark - 2));
			this.stream.write(new Buffer(1));
			expect(this.stream._writev).to.not.be.called;
		});

		it('should write data if the chunk threshold is reached', function() {
			this.stream.write(new Buffer(S3WriteStream.lowWaterMark - 1));
			this.stream.write(new Buffer(1));
			expect(this.stream._writev).to.be.calledOnce;
		});
	});

	describe('#_writev', function() {
		it('should invoke _part with all collected data', function() {
			var stream = S3WriteStream(this.s3, { Bucket: 'foo', Key: 'bar' });
			this.sandbox.stub(stream, '_part');
			stream.write(new Buffer('a'));
			stream.write(new Buffer('b'));
			stream.end();
			expect(stream._part).to.be.calledOnce;
			expect(stream._part.getCall(0).args[0].toString()).to.equal('ab');
		});
	});

	describe('#_part', function() {

		beforeEach(function() {
			var stream = S3WriteStream(this.s3, { Bucket: 'foo', Key: 'bar' });
			this.stream = stream;
			this.sandbox.stub(this.stream.upload, 'uploadPart');
			this.sandbox.stub(this.stream.upload, 'finish');
			this.sandbox.spy(this.stream, 'emit');
		});

		it('should pass all the data on to #uploadPart', function() {
			this.stream.upload.uploadPart.returns(Promise.resolve());
			this.stream.write(new Buffer(S3WriteStream.lowWaterMark));
			expect(this.stream.upload.uploadPart).to.be.calledOnce;
		});

		it('should trigger an error when #uploadPart fails', function(done) {
			var spy = sinon.spy();
			this.stream.upload.uploadPart.returns(Promise.reject('fail'));
			this.stream.upload.finish.returns(Promise.resolve());
			this.stream.on('error', function(err) {
				try {
					expect(spy).to.be.calledOnce.and.calledWith('fail');
					expect(err).to.equal('fail');
					done();
				} catch(e) {
					done(e);
				}
			}).on('finish', function() {
				done('no error triggered');
			});
			this.stream.write(new Buffer(S3WriteStream.lowWaterMark), spy);
			// The callback in end will NOT be triggered as per the stream
			// spec; the end callback fires _only_ when the finish event
			// fires, and since there's an error there will be no finish.
			// Important to keep in mind.
			this.stream.end();
		});
	});

	describe('#end', function() {

		beforeEach(function() {
			var stream = S3WriteStream(this.s3, { Bucket: 'foo', Key: 'bar' });
			this.stream = stream;
			this.sandbox.stub(this.stream.upload, 'uploadPart');
			this.sandbox.stub(this.stream.upload, 'finish');
			this.sandbox.spy(this.stream, 'emit');
			this.stream.upload.uploadPart.returns(Promise.resolve());
			this.stream.upload.finish.returns(Promise.resolve());
		});

		it('should work with just a function', function(done) {
			this.stream.end(done);
		});

		it('should work with a buffer and function', function(done) {
			this.stream.end(new Buffer(10), done);
		});

		it('should work with a buffer, encoding and function', function(done) {
			this.stream.end('foo', 'utf8', done);
		});

		it('should not uncork if there is no need', function() {
			this.stream.uncork();
			this.sandbox.stub(this.stream, 'uncork');
			this.stream.end();
			expect(this.stream.uncork).to.not.be.called;
		});

		it('should deal with errors', function(done) {
			var spy = sinon.spy();
			this.stream.upload.finish.returns(Promise.reject('errorz'));
			this.stream.once('error', spy);
			this.stream.end(function(err) {
				process.nextTick(function() {
					try {
						expect(err).to.equal('errorz');
						expect(spy).to.be.calledOnce;
						done();
					} catch (e) {
						done(e);
					}
				});
			});
		});

		it('should deal with errors without a callback specified', function(done) {
			var spy = sinon.spy();
			this.stream.upload.finish.returns(Promise.reject('errorz'));
			this.stream.once('error', spy);
			this.stream.on('error', function(err) {
				try {
					expect(err).to.equal('errorz');
					expect(spy).to.be.calledOnce;
					done();
				} catch (e) {
					done(e);
				}
			});

			this.stream.end();
		});
	});
});
