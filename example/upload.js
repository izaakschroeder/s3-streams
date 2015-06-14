#!/usr/bin/env node

var fs = require('fs'),
	path = require('path'),
	S3S = require(path.join(__dirname, '..')),
	S3 = require('aws-sdk').S3,
	argv = require('yargs').argv;

var s3 = new S3();

var upload = new S3S.WriteStream(s3, {
	Bucket: argv.bucket,
	Key: argv.key || path.basename(argv._[0])
});

var total = 0;

fs.createReadStream(argv._[0])
	.on('open', function open(fd) {
		total = fs.fstatSync(fd).size;
		console.log('Uploading', total, 'bytes.');
	})
	.pipe(upload)
	.on('finish', function end() {
		console.log('Upload complete.');
		process.exit(0);
	})
	.on('error', function error(err) {
		console.error('Unable to upload file:', err);
		process.exit(1);
	});
