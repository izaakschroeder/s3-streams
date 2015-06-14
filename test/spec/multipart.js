
var _ = require('lodash'),
	MultipartUpload = require('multipart'),
	Promise = require('bluebird');

describe('MultipartUpload', function() {

	beforeEach(function() {
		this.sandbox = sinon.sandbox.create();
		this.s3 = {
			uploadPart: this.sandbox.stub(),
			abortMultipartUpload: this.sandbox.stub(),
			completeMultipartUpload: this.sandbox.stub(),
			createMultipartUpload: this.sandbox.stub()
		};
	});

	afterEach(function() {
		this.sandbox.restore();
	});

	describe('constructor', function() {
		it('should fail when no S3 instance is provided', function() {
			expect(MultipartUpload).to.throw(TypeError);
		});

		it('should fail when no `Bucket` parameter is provided', function() {
			expect(_.partial(MultipartUpload, this.s3, { Key: 'bar' })).to.throw(TypeError);
		});

		it('should fail when no `Key` parameter is provided', function() {
			expect(_.partial(MultipartUpload, this.s3, { Bucket: 'foo' })).to.throw(TypeError);
		});
	});

	describe('#create', function() {
		it('should reject the promise with the correct error on failure', function() {
			var result = { };
			this.s3.createMultipartUpload.callsArgWith(1, result);
			var upload = MultipartUpload(this.s3, {
				Bucket: 'foo',
				Key: 'bar'
			});
			return expect(upload.upload).to.be.rejectedWith(result);
		});
	});

	describe('#abort', function() {

		it('should abort the upload', function() {
			var s3 = this.s3;
			s3.createMultipartUpload.callsArgWith(1, null, { UploadId: '5' });
			s3.abortMultipartUpload.callsArgWith(1, null, { });
			var result = MultipartUpload(s3, { Bucket: 'foo', Key: 'bar' }).abort();

			return expect(result).to.be.fulfilled.then(function() {
				return expect(s3.abortMultipartUpload).to.be.calledWithMatch({
					UploadId: '5',
					Bucket: 'foo',
					Key: 'bar'
				});
			});

		});

		it('should return a promise', function() {
			var part = MultipartUpload(this.s3, {
				Bucket: 'foo',
				Key: 'bar'
			});
			expect(part.abort()).to.be.an.instanceof(Promise);
		});

		it('should resolve the promise with the correct results on success', function() {
			var result = { };
			this.s3.createMultipartUpload.callsArgWith(1, null, { UploadId: '5' });
			this.s3.abortMultipartUpload.callsArgWith(1, null, result);
			var upload = MultipartUpload(this.s3, {
				Bucket: 'foo',
				Key: 'bar'
			});
			return expect(upload.abort()).to.eventually.equal(result);
		});

		it('should reject the promise with the correct error on failure', function() {
			var result = { };
			this.s3.createMultipartUpload.callsArgWith(1, null, { UploadId: '5' });
			this.s3.abortMultipartUpload.callsArgWith(1, result);
			var upload = MultipartUpload(this.s3, {
				Bucket: 'foo',
				Key: 'bar'
			});
			return expect(upload.abort()).to.be.rejectedWith(result);
		});
	});

	describe('#uploadPart', function() {
		beforeEach(function() {
		});

		it('should upload the part', function() {
			this.s3.createMultipartUpload.callsArgWith(1, null, { UploadId: '5' });
			this.s3.uploadPart.callsArgWith(1, null, { });
			var upload = MultipartUpload(this.s3, {
				Bucket: 'foo',
				Key: 'bar'
			});
			var s3 = this.s3;

			return expect(upload.uploadPart(new Buffer('foo'))).to.be.fulfilled.then(function() {
				return expect(s3.uploadPart).to.be.calledWithMatch({
					UploadId: '5',
					Bucket: 'foo',
					Key: 'bar'
				});
			});
		});

		it('should include the corrent ContentMD5 if necessary', function() {
			this.s3.createMultipartUpload.callsArgWith(1, null, { UploadId: '5' });
			this.s3.uploadPart.callsArgWith(1, null, { });
			var upload = MultipartUpload(this.s3, {
				Bucket: 'foo',
				Key: 'bar',
				ContentMD5: true
			});
			var s3 = this.s3;
			return expect(upload.uploadPart(new Buffer('foo'))).to.be.fulfilled.then(function() {
				return expect(s3.uploadPart).to.be.calledWithMatch({
					UploadId: '5',
					Bucket: 'foo',
					Key: 'bar'
				});
			});
		});

		it('should return a promise', function() {
			var upload = MultipartUpload(this.s3, {
				Bucket: 'foo',
				Key: 'bar'
			});
			expect(upload.uploadPart()).to.be.an.instanceof(Promise);
		});

		it('should resolve the promise with the correct results on success', function() {
			var result = { };
			this.s3.createMultipartUpload.callsArgWith(1, null, { UploadId: '5' });
			this.s3.uploadPart.callsArgWith(1, null, result);
			var upload = MultipartUpload(this.s3, {
				Bucket: 'foo',
				Key: 'bar'
			});
			return expect(upload.uploadPart()).to.eventually.include(result)
				.and.include({ PartNumber: 1 });
		});

		it('should reject the promise with the correct error on failure', function() {
			var result = { };
			this.s3.uploadPart.callsArgWith(1, result);
			this.s3.createMultipartUpload.callsArgWith(1, null, { UploadId: '5' });
			var upload = MultipartUpload(this.s3, {
				Bucket: 'foo',
				Key: 'bar'
			});
			return expect(upload.uploadPart()).to.be.rejectedWith(result);
		});
	});

	describe('#finish', function() {

		it('should finish the upload', function() {
			this.s3.createMultipartUpload.callsArgWith(1, null, { UploadId: '5' });
			this.s3.completeMultipartUpload.callsArgWith(1, null, { });

			var upload = MultipartUpload(this.s3, {
				Bucket: 'foo',
				Key: 'bar'
			});

			var s3 = this.s3;

			return expect(upload.finish()).to.be.fulfilled.then(function() {
				return expect(s3.completeMultipartUpload).to.be.calledWithMatch({
					Bucket: 'foo',
					Key: 'bar',
					UploadId: '5',
					MultipartUpload: {
						Parts: [ ]
					}
				});
			});
		});

		it('should return a promise', function() {
			var upload = MultipartUpload(this.s3, {
				Bucket: 'foo',
				Key: 'bar'
			});
			expect(upload.finish()).to.be.an.instanceof(Promise);
		});

		it('should resolve the promise with the correct results on success', function() {
			var result = { };

			this.s3.createMultipartUpload.callsArgWith(1, null, { UploadId: '5' });
			this.s3.completeMultipartUpload.callsArgWith(1, null, result);

			var upload = MultipartUpload(this.s3, {
				Bucket: 'foo',
				Key: 'bar'
			});

			return expect(upload.finish()).to.eventually.equal(result);
		});

		it('should reject the promise with the correct error on failure', function() {
			var result = { };
			this.s3.createMultipartUpload.callsArgWith(1, null, { UploadId: '5' });
			this.s3.completeMultipartUpload.callsArgWith(1, result);
			var upload = MultipartUpload(this.s3, {
				Bucket: 'foo',
				Key: 'bar'
			});
			return expect(upload.finish()).to.be.rejectedWith(result);
		});
	});


});
