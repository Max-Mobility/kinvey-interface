#!/usr/bin/env node
const path = require('path');
const glob = require('glob');

const PushTrackerKinveyKeys = require('@maxmobility/private-keys').PushTrackerKinveyKeys;
const https = require('https');
const fs = require('fs');

if (process.argv.length < 5) {
	console.error('You must provide: (path to i18n directory | path to single language file), app_name, and version string!');
	process.exit(1);
}

const input = process.argv[2];
const appName = process.argv[3];
const versionString = process.argv[4];
const versionNumber = +versionString;
const versionDecimal = parseFloat(versionString);
let fileData = null;

async function processFiles() {
  if (input.includes('.json')) {
    await upload(input);
  } else {
    const folderName = input;
    const globText = path.join(folderName, '*.json');
    const fileNames = glob.sync(globText);
    for (let i=0; i<fileNames.length; i++) {
      const fileName = fileNames[i];
      await upload(fileName);
    }
  }
  process.exit(0);
}

async function upload(fileName) {
  console.log('loading', fileName);
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

  const uploadName = path.basename(fileName);
  console.log('uploading', uploadName);

  const metadata = JSON.stringify({
    "_acl": {
      "gr": true
    },
	  "_public": true,
	  "_filename": uploadName,
	  "_version": versionDecimal,
    "app_name": appName,
	  "version": versionString,
	  "size": fileData.length,
	  "mimeType": "application/json",
	  "firmware_file": false,
	  "translation_file": true
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

  await new Promise((resolve, reject) => {
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
            resolve();
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
  });
}

processFiles();

