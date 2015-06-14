#!/usr/bin/env node

var fs = require('fs'),
	path = require('path'),
	S3S = require(path.join(__dirname, '..')),
	S3 = require('aws-sdk').S3,
	argv = require('yargs').argv;

var s3 = new S3();

var download = new S3S.ReadStream(s3, {
	Bucket: argv.bucket,
	Key: argv.key
});


download
	.on('open', function open(object) {
		console.log('Downloading', object.ContentLength, 'bytes.');
	})
	.pipe(fs.createWriteStream(argv._[0]))
	.on('finish', function end() {
		console.log('Download complete.');
		process.exit(0);
	})
	.on('error', function error(err) {
		console.error('Unable to download file:', err);
		process.exit(1);
	});
