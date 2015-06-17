
var _ = require('lodash'),
	crypto = require('crypto'),
	S3ReadStream = require('read'),
	Stream = require('readable-stream'),
	EventEmitter = require('events').EventEmitter;

/*
function streamCheck(stream) {
	return new Promise(function(resolve, reject) {
		stream.once('error', reject).once('end', resolve);
		stream.read(0);
	});
}

function streamContents(stream) {
	return new Promise(function(resolve, reject) {
		var chunks = [ ], len = 0;
		stream.once('error', reject).on('readable', function() {
			var chunk;
			while (null !== (chunk = this.read())) {
				chunks.push(chunk);
				len += chunk.length;
			}
		}).once('end', function() {
			var result = Buffer.concat(chunks, len);

		});
		stream.read(0);
	});
}

chai.overwriteProperty('ok', function (_super) {
	return function checkModel () {
		var obj = this._obj;
		if (obj instanceof Stream.Readable || obj instanceof Stream.Writable) {
			new Assertion(obj).to.have.deep.property('_attrs.id').a('number');
		} else {
			_super.call(this);
		}
	};
});


*/

describe('S3ReadStream', function() {

	beforeEach(function() {
		this.sandbox = sinon.sandbox.create();
		this.s3 = { getObject: this.sandbox.stub() };
		this.request = new EventEmitter();
		this.s3.getObject.returns(this.request);
		this.source = new Stream.PassThrough();
		this.request.createReadStream = sinon.stub().returns(this.source);
	});

	afterEach(function() {
		this.sandbox.restore();
	});

	describe('constructor', function() {
		it('should fail when no S3 instance is provided', function() {
			expect(S3ReadStream).to.throw(TypeError);
		});

		it('should fail when no `Bucket` parameter is provided', function() {
			expect(_.partial(S3ReadStream, this.s3, { Key: 'bar' })).to.throw(TypeError);
		});

		it('should fail when no `Key` parameter is provided', function() {
			expect(_.partial(S3ReadStream, this.s3, { Bucket: 'foo' })).to.throw(TypeError);
		});

		it('should create a valid stream', function() {
			var stream = S3ReadStream(this.s3, { Bucket: 'foo', Key: 'bar' });
			expect(stream).to.be.an.instanceof(S3ReadStream);
		});

	});

	describe('#_read', function() {
		beforeEach(function() {
			this.stream = S3ReadStream(this.s3, { Bucket: 'foo', Key: 'bar' }, { highWaterMark: 500 });
		});

		afterEach(function() {

		});

		it('should fail on bad HTTP request', function(done) {
			this.stream.on('error', function(err) {
				expect(err).to.be.not.null;
				done();
			});
			this.stream.read(0);
			this.request.emit('httpHeaders', 400, { }, { });
		});

		it('should error if S3 provides no http information', function(done) {
			var stream = this.stream, called = false;
			stream.on('error', function(err) {
				if (called) {
					return;
				}
				called = true;
				expect(err).to.not.be.null;
				done();
			});
			stream.read(0);
			this.source.end(new Buffer(1));
		});

		it('should error if S3 provides no http information', function(done) {
			var stream = this.stream, called = false;
			stream.on('error', function(err) {
				if (called) {
					return;
				}
				called = true;
				expect(err).to.not.be.null;
				done();
			});
			stream.read(0);
			this.source.end();
		});

		it('should pass through the data from S3', function(done) {
			var data = crypto.pseudoRandomBytes(1000);
			var stream = this.stream;

			var collect = [ ];
			stream.on('readable', function() {
				var buf;
				while (null !== (buf = this.read())) {
					collect.push(buf);
				}
			}).on('end', function() {
				var result = Buffer.concat(collect);
				expect(result.toString('hex')).to.equal(data.toString('hex'));
				done();
			}).on('error', function(err) {
				done('stream error', err);
			});

			stream.read(0);

			this.request.emit('httpHeaders', 200, { 'content-length': data.length });
			this.source.end(data);

		});

		it('should pass through error events from S3', function(done) {
			this.stream.on('error', function(err) {
				expect(err).to.be.not.null;
				done();
			});
			this.stream.read(0);
			this.source.emit('error', 's3-error');
		});

		it('should only send headers once', function() {
			var emit = this.sandbox.stub(this.stream, 'emit');
			this.stream.read(0);
			this.request.emit('httpHeaders', 200, { 'content-length': 5 });
			this.request.emit('httpHeaders', 200, { });
			expect(emit).to.be.calledWithMatch('open', { Bucket: 'foo', Key: 'bar', ContentLength: 5 });
		});
	});

	describe('#pipe', function() {
		describe('HTTP smart piping', function() {
			var source, target;

			beforeEach(function() {
				source = S3ReadStream(this.s3, { Bucket: 'foo', Key: 'bar' }, { highWaterMark: 500 });
				target = {
					setHeader: sinon.stub(),
					on: sinon.stub(),
					once: sinon.stub(),
					emit: sinon.stub()
				};
			});
			it('should set HTTP headers in smart mode', function() {
				source.pipe(target);
				// Since target is fake, yank the stream ourselves
				source.read(0);
				this.request.emit('httpHeaders', 200, {
					'content-length': 5,
					'content-type': 'ab'
				});
				expect(target.setHeader).to.be.calledWith('Content-Length', 5);
				expect(target.setHeader).to.be.calledWith('Content-Type', 'ab');
			});
			it('should do nothing in dumb mode', function() {
				source.pipe(target, { smart: false });
				// Since target is fake, yank the stream ourselves
				source.read(0);
				this.request.emit('httpHeaders', 200, {
					'content-length': 5,
					'content-type': 'ab'
				});
				expect(target.setHeader).to.not.beCalled;
			});
		});

	});
});
