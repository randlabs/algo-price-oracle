const algosdk = require('algosdk');
const path = require("path");

const portNode  = "";
const https = require('https');

let token;

let algodclient;

var recoveredAccount; 
var sendAddr;
let txInterval = 1000;
let messariKey;

let lastTx = null;
let lastTxTime = 0;

doHttpsRequest = function () {
	return new Promise((resolve, reject) => {
		const options = {
			hostname: 'data.messari.io',
			port: 443,
			path: '/api/v1/assets/algo/metrics',
			method: 'GET',
			headers: {
				"x-messari-api-key": messariKey
			}
		};
		var req = https.request(options, function(res) {
			req.socket.setTimeout(5000);
			let data = '';
			res.on('data', (chunk) => {
				data += chunk;
			});
			res.on('end', () => {
				try {
					let resJson = JSON.parse(data);
					resolve(resJson);
				}
				catch (err) {
					reject("Error parsing response: " + err);
				}
			}
			);
			req.socket.on('timeout', function() {
				req.abort();
			});
		});
		req.on('error', function(err) {
			reject(err);
		  });
		req.end();		  
	})
}

function timeoutPromise(ms, promise) {
	return new Promise((resolve, reject) => {
	  const timeoutId = setTimeout(() => {
		reject(new Error("promise timeout"))
	  }, ms);
	  promise.then(
		(res) => {
		  clearTimeout(timeoutId);
		  resolve(res);
		},
		(err) => {
		  clearTimeout(timeoutId);
		  reject(err);
		}
	  );
	})
  }
  
async function main() {
	let start = Date.now();

	try {
		previousTxTime = lastTxTime;
		var date = new Date();

		let req = (await timeoutPromise(5000, doHttpsRequest()));

		let note = {
			price_algo_usd: req.data.market_data.price_usd,
			price_algo_btc: req.data.market_data.price_btc,
			last_trade_at: req.data.market_data.last_trade_at,
			timestamp: date.toISOString()
		};	

		let params = await algodclient.getTransactionParams();
	
		let txnHeader = {
			"from": sendAddr,
			"to": sendAddr,
			"fee": 1000,
			"amount": 0,
			"firstRound": params.lastRound,
			"lastRound": params.lastRound + parseInt(500),
			"genesisID": params.genesisID,
			"genesisHash": params.genesishashb64,
			"flatFee": true,
			"note": new Uint8Array(Buffer.from(JSON.stringify(note), "utf8")),
		};
	
		const txHeaders = {
			'Content-Type' : 'application/x-binary'
		}
		
		let signedTxn = algosdk.signTransaction(txnHeader, recoveredAccount.sk);
		let tx = (await timeoutPromise(5000, algodclient.sendRawTransaction(signedTxn.blob, txHeaders)));

		lastTx = tx;
		lastTxTime = date.getTime();
	
		console.log("Price submitter tx " + tx.txId + " submitted on block " + params.lastRound + " Data Timestamp " + note.timestamp);

		// more than interval just do it
		let elapsed = Date.now() - start;
		if (elapsed > txInterval) {
			setTimeout(main);
		}
		else {
			setTimeout(main, txInterval - elapsed);
		}
	}
	catch(e) {
		if(e && e.error) {
			console.log(e.error);
		}
		else {
			console.log("Error: " + e);
		}
		setTimeout(main, 10000);
	}
}

(async() => {
	let settings;
	try {
		let filename = path.resolve(__dirname, "settings.js");
	
		settings = require(filename);
	}
	catch (err) {
		throw new Error("ERROR: Unable to load settings file.");
	}

	recoveredAccount = algosdk.mnemonicToSecretKey(settings.key);
	sendAddr = recoveredAccount.addr;

	if (settings.interval) {
		txInterval = settings.interval;
	}

	if (!settings.server) {
		throw new Error("ERROR: server not defined.");
	}
	if (!settings.token || typeof settings.token !== "object") {
		throw new Error("ERROR: token must be an object.");
	}
	if (!settings["messari-api-key"]) {
		throw new Error("ERROR: Messari key missing.");
	}
	messariKey = settings["messari-api-key"];

	server = settings.server;
	token = settings.token;
	algodclient = new algosdk.Algod(token, server, portNode); 

	if(recoveredAccount.addr !== settings.public) {
		throw new Error("ERROR: Unable to load settings file.");
	}		

	setTimeout(main);
})().catch(e => {
    console.log(e);
 });
