#!/usr/bin/env node

const PushTrackerKinveyKeys = require('@maxmobility/private-keys').PushTrackerKinveyKeys;
const https = require('https');
const fs = require('fs');

if (process.argv.length < 5) {
	console.error('You must provide: file path, uploaded name, and version string, and (OPTIONALLY) the change notes file!');
	process.exit(1);
}

function versionStringToByte(version) {
    const [major, minor] = version.split('.');
    return (parseInt(major) << 4) | parseInt(minor);
}

const fileName = process.argv[2];
const uploadName = process.argv[3];
const versionString = process.argv[4];
const versionNumber = versionStringToByte(versionString);
const versionDecimal = parseFloat(versionString);
let fileData = null;

try {
	fileData = fs.readFileSync(fileName);
} catch (e) {
	console.error(`Could not open ${fileName}: ${err}`);
	process.exit(1);
}

if (!fileData) {
	console.error(`Could not open ${fileName}: unknown error!`);
	process.exit(1);
}

let changeNotes = {
	"en": [],
	"es": [],
	"de": [],
	"fr": [],
  "ja": [],
	"ko": [],
	"nl": [],
  "ru": [],
	"sv": [],
	"zh": [],
	"zh-CN": []
};

if (process.argv.length === 6) {
  const changeNotesFileName = process.argv[5];
  let changeNotesData = null;
  try {
    changeNotesData = fs.readFileSync(changeNotesFileName);
  } catch (err) {
    console.error(`Could not open ${changeNotesFileName}: ${err}!`);
    process.exit(1);
  }
  if (!changeNotesData) {
	  console.error(`Could not open ${changeNotesFileName}: unknown error!`);
	  process.exit(1);
  }
  try {
    changeNotes = JSON.parse(changeNotesData);
  } catch (err) {
    console.error(`Could not parse content from ${changeNotesFileName}: ${err}`);
  }
}

const metadata = JSON.stringify({
  "_acl": {
    "gr": true
  },
	"_public": true,
	"_filename": uploadName,
	"_version": versionDecimal,
	"version": versionString,
	"size": fileData.length,
	"mimeType": "application/octet-stream",
	"firmware_file": true,
	"translation_file": false,
	"change_notes": changeNotes
})

let auth = null;
let env = PushTrackerKinveyKeys.DEV_KEY;
let authorizationToEncode = PushTrackerKinveyKeys.TEST_USER_PREAUTH;
const data = Buffer.from(authorizationToEncode);
auth = 'Basic ' + data.toString('base64');

const options = {
	hostname: PushTrackerKinveyKeys.HOST_URL.replace('https://', ''),
	port: 443,
	path: '/blob/' + env + '/',
	method: 'POST',
	headers: {
		'Content-Type': 'application/json',
		'X-Kinvey-Content-Type': 'application/octet-stream',
		'Authorization': auth
	}
}

const req = https.request(options, (res) => {
  const statusCode = res.statusCode;
	console.log(`statusCode: ${statusCode}`)

  if (statusCode === 201) {
		res.on('data', (d) => {
			// have uploaded the metadata - now upload the file to google
			// cloud storage
			const data = JSON.parse(d.toString());
			const requiredHeaders = data['_requiredHeaders'];
			const url = data['_uploadURL'].replace('http://storage.googleapis.com', '');
			//console.log(`uploading to url: ${url}`);

			const uploadOptions = {
				hostname: 'storage.googleapis.com',
				path: url,
				method: 'PUT',
				headers: {
					'Content-Length': fileData.length,
					'Content-Type': 'application/octet-stream'
				}
			};
			// add any required headers
			Object.keys(requiredHeaders).map(k => {
				uploadOptions.headers[k] = requiredHeaders[k];
			});
			let uploadReq = https.request(uploadOptions, (res2) => {
				console.log(`upload status: ${res2.statusCode}`);
        process.exit(0);
			});
			uploadReq.on('error', (error) => {
				console.error(error);
        process.exit(1);
			});
			// now acutally upload the file
			uploadReq.write(fileData);
			uploadReq.end();
		});
  } else {
    res.on('data', d => {
      console.error('Could not upload file, status code:', statusCode);
      console.error('data:');
      console.error(d.toString());
      process.exit(1);
    });
  }
});

req.on('error', (error) => {
	console.error(error)
  process.exit(1);
});

// now actually send the request
req.write(metadata)
req.end()

