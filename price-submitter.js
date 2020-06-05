const algosdk = require('algosdk');
const path = require("path");
const process = require('process');
const AbortController = require("abort-controller");

const portNode  = "";
const https = require('https');
const WebSocketClient = require("websocket").client;
const controller = new AbortController();

let token;

let algodclient;

var recoveredAccount; 
var sendAddr;
let realPrice;
let txInterval = 1000;
let websocketReconnection = 2000;
let marketData;

let lastTx = null;
let lastTxTime = 0;

let should_quit = false;


const WEBSOCKET_PING_INTERVAL_TIME_IN_SEC = 5;

// doHttpsRequest = function () {
// 	return new Promise((resolve, reject) => {
// 		const options = {
// 			hostname: 'data.messari.io',
// 			port: 443,
// 			path: '/api/v1/assets/algo/metrics',
// 			method: 'GET',
// 			headers: {
// 				"x-messari-api-key": messariKey
// 			}
// 		};
// 		var req = https.request(options, function(res) {
// 			req.socket.setTimeout(5000);
// 			let data = '';
// 			res.on('data', (chunk) => {
// 				data += chunk;
// 			});
// 			res.on('end', () => {
// 				try {
// 					let resJson = JSON.parse(data);
// 					resolve(resJson);
// 				}
// 				catch (err) {
// 					reject("Error parsing response: " + err);
// 				}
// 			}
// 			);
// 			req.socket.on('timeout', function() {
// 				req.abort();
// 			});
// 		});
// 		req.on('error', function(err) {
// 			reject(err);
// 		  });
// 		req.end();		  
// 	})
// }

async function sleep(milliseconds, cancellable) {
	if (cancellable) {
		while (milliseconds > 0 && (!should_quit)) {
			const maximum = 500;
			const to_wait = (milliseconds > maximum) ? maximum : milliseconds;
			milliseconds -= to_wait;
			await sleep(to_wait, false);
		}
	}
	else {
		return new Promise((resolve) => {
			setTimeout(resolve, milliseconds);
		});
	}
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

function waitForAbort() {
	const signal = controller.signal;
	return new Promise((resolve) => {
		signal.addEventListener("abort", () => {
			client.close();
			resolve();
		});
	});
}

async function listenSocketPrice() {
	const wsClient = new WebSocketClient();

	wsClient.connect(realPrice.socketAddress);
	
	wsClient.on("connectFailed", async function(description) {
		Logger.notify("error", description);
		await sleep(websocketReconnection, true);
		if (!should_quit) {
			wsClient.connect(realPrice.socketAddress);
		}
	});
	
	// Websocket event functions
	const onError = (error) => {
		Logger.notify("error", "Connection Error: " + error.toString());
	};
	
	const onMessage = async (message) => {
		if (message.type === "utf8") {
			try {
				const json = JSON.parse(message.utf8Data);
				if (json && json.type === "ticker") {
					json.price = parseFloat(json.price);
					marketData = json;
				}
			}
			catch (err) {
				console.log("Error: " + err);
			}
		}
	};
	
	const onPing = () => {
		externalWsConnection.ping("ping");
	};
	
	const onClose = async (reasonCode, description) => {
		if (!should_quit) {
			Logger.notify("info", "Code: " + reasonCode.toString() + ". " + description);
			if (wsIntervalResolution) {
				clearInterval(wsIntervalResolution);
			}
			externalWsConnection.off("close", onClose);
			externalWsConnection.off("error", onError);
			externalWsConnection.off("message", onMessage);
			await sleep(websocketReconnection, true);
			wsClient.connect(settings.real_price.socketAddress);
		}
	};
	
	wsClient.on("connect", function(wsConnection) {
		externalWsConnection = wsConnection;
		wsConnection.on("error", onError);
		wsConnection.on("close", onClose);
		wsConnection.on("message", onMessage);
		wsConnection.send(JSON.stringify(realPrice.subscribe));
		wsIntervalResolution = setInterval(onPing, WEBSOCKET_PING_INTERVAL_TIME_IN_SEC);
	});
	
	await waitForAbort();
}

async function sendPriceTransaction() {
	process.on('SIGINT', function() {
		should_quit = true;
	});
	process.on('SIGTERM', function() {
		should_quit = true;
	});

	console.log("******   sendPriceTransaction   ******\n");

	while (!should_quit) {
		let sleepInterval = txInterval;

		if (marketData) {
			let start = Date.now();

			try {
				previousTxTime = lastTxTime;
				var date = new Date();
	
				let note = {
					price_algo_usd: marketData.price,
					last_trade_at: marketData.time,
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
				if (elapsed < txInterval) {
					sleepInterval = txInterval - elapsed;
				}
			}
			catch(e) {
				if(e && e.error && e.error.message) {
					console.log(e.error.message);
				}
				else {
					console.log("Error: " + e);
				}
			}
		}
		await sleep(sleepInterval, true);
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
	if (settings.websocketReconnection) {
		websocketReconnection = settings.websocketReconnection;
	}

	if (!settings.server) {
		throw new Error("ERROR: server not defined.");
	}
	if (!settings.token || typeof settings.token !== "object") {
		throw new Error("ERROR: token must be an object.");
	}
	// if (!settings["messari-api-key"]) {
	// 	throw new Error("ERROR: Messari key missing.");
	// }
	// messariKey = settings["messari-api-key"];

	server = settings.server;
	token = settings.token;
	realPrice = settings.realPrice;
	if (!realPrice) {
		throw new Error("ERROR: realPrice field not set.");
	}
	algodclient = new algosdk.Algod(token, server, portNode); 

	if(recoveredAccount.addr !== settings.public) {
		throw new Error("ERROR: Unable to load settings file.");
	}	
	setTimeout(sendPriceTransaction);
	listenSocketPrice();
})().catch(e => {
    console.log(e);
 });
