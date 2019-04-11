# s3-streams

Support for streaming reads and writes from and to S3 using Amazon's native API.

![build status](http://img.shields.io/travis/izaakschroeder/s3-streams/master.svg?style=flat)
![coverage](http://img.shields.io/coveralls/izaakschroeder/s3-streams/master.svg?style=flat)
![license](http://img.shields.io/npm/l/s3-streams.svg?style=flat)
![version](http://img.shields.io/npm/v/s3-streams.svg?style=flat)
![downloads](http://img.shields.io/npm/dm/s3-streams.svg?style=flat)

Amazon makes it a giant pain to do anything stream-like when it comes to S3 (given the general restriction that every request needs a `Content-Length` header). We provide native stream classes (both `Readable` and `Writable`) that wrap `aws-sdk` S3 requests and responses to make your life easier.

IMPORTANT: This library uses the `streams3` API. In order to provide compatibility with older versions of node we make use of [readable-stream]. This is unlikely to have any effect on your code but has not yet been well tested.

If you are using `node 0.8` you must ensure your version of `npm` is at least `1.4.6`.

Features:
 * Native read streams,
 * Native write streams,
 * Smart piping.

## Usage

```sh
npm install s3-streams
```

### Write Streams

Create streams for uploading to S3:
```javascript
var S3 = require('aws-sdk').S3,
	S3S = require('s3-streams');

var upload = S3S.WriteStream(new S3(), {
	Bucket: 'my-bucket',
	Key: 'my-key',
	// Any other AWS SDK options
	// ContentType: 'application/json'
	// Expires: new Date('2099-01-01')
	// ...
});
```

### Read Streams

Create streams for downloading from S3:
```javascript
var S3 = require('aws-sdk').S3,
	S3S = require('s3-streams');

var download = S3S.ReadStream(new S3(), {
	Bucket: 'my-bucket',
	Key: 'my-key',
	// Any other AWS SDK options
});
```

### Smart Piping
Smart piping automatically forwards headers returned from the S3 service directly to your pipe destination if it has `setHeader` function.

The headers option has two potential models:
- Array: If headers is an array, it will forward any header values that are present on the S3 response.
- Truthy: If it is any other truthy value, only, two headers will be sent ('Content-Type' and 'Content-Length').

Smart pipe files over HTTP:

```javascript
var http = require('http'),
    S3 = require('aws-sdk').S3,
    S3S = require('s3-streams'),
    opts = {
        headers: ['content-type', 'content-length', 'content-range']
    };

http.createServer(function(req, res) {
    var src = S3S.ReadStream(...);
    // Automatically sets the correct HTTP headers
    src.pipe(res, opts);
})
```

Smart pipe files on S3:
```javascript
var S3 = require('aws-sdk').S3,
	S3S = require('s3-streams');

var src = S3S.ReadStream(...),
    dst = S3S.WriteStream(...),
    opts = {
        headers: true // send 'content-type', 'content-length' if truthy
    };

// No data ever gets downloaded locally.
src.pipe(dst, opts);
```

### Extras

You can create streams with different settings by creating a partial for the specific S3 instance you have:

```javascript
var instance = new S3(), s3 = {
	createReadStream: _.partial(S3ReadStream, instance),
	createWriteStream: _.partial(S3WriteStream, instance)
}

var stream = s3.createReadStream({ Bucket: 'my-bucket', Key: 'my-key' });
```

Existing frameworks:
 * knox (doesn't use native AWS SDK, no true streaming support)
 * s3-upload-stream (doesn't use node streams API, no support for streaming downloads)
 * s3-download-stream (only does downloads, downloads are streamed by S3 part, not by individual buffer chunks)
 * streaming-s3 (overall terrible API; no actual streams)
 * create-s3-object-write-stream (probably one of the better ones)

[readable-stream]: http://www.nearform.com/nodecrunch/dont-use-nodes-core-stream-module/
