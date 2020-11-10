const algosdk = require('algosdk');
const templates = require('algosdk/src/logicTemplates/templates');
const path = require("path");
const process = require('process');
const AbortController = require("abort-controller");
const { stringContaining } = require('expect');

const portNode  = "";
const WebSocketClient = require("websocket").client;
const controller = new AbortController();

let token = String.empty;

let algodclient;

var oracleAccount;
var submitterAccount;
let realPrice;
let txInterval = 1000;
let websocketReconnection = 2000;
let marketData;
let priceDecimals = 4;
var lastPriceRound;
let priceExpiration = 20;

let should_quit = false;


const WEBSOCKET_PING_INTERVAL_TIME_IN_SEC = 5;

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
				var date = new Date();
	
				let params = await algodclient.getTransactionParams().do();
		
				params.fee = 1000
				params.flatFee = true
				params.lastRound = params.firstRound + 10

				if (params.lastRound !== lastPriceRound) {
					let price = Math.floor (marketData.price * Math.pow(10, priceDecimals) );

					let oracleProgramReferenceProgramBytesReplace = Buffer.from("ASAEAQAFBjEQIhIxATIAEhAxCCMSEDEJMgMSEDEFFyQSEDEEJQ4Q", 'base64');
		
					let referenceOffsets = [ /*Price*/ 5, /*LastValid*/ 6];
					let injectionVector =  [price, params.lastRound + priceExpiration];
					let injectionTypes = [templates.valTypes.INT, templates.valTypes.INT];
		
					var buff = templates.inject(oracleProgramReferenceProgramBytesReplace, referenceOffsets, injectionVector, injectionTypes);
					let oracleProgram = new Uint8Array(buff);			
					let lsigOracle = algosdk.makeLogicSig(oracleProgram);

					lsigOracle.sign(oracleAccount.sk);
			
					let priceObj = {
						signature: lsigOracle.get_obj_for_encoding(),
						price: price,
						decimals: priceDecimals,
						last_trade_at: marketData.time,
						timestamp: date.toISOString()
					}
			
				 	let oraclePriceSubmitterTx = algosdk.makePaymentTxnWithSuggestedParams (submitterAccount.addr,
						submitterAccount.addr, 0, undefined, algosdk.encodeObj(priceObj), params);
					let oraclePriceSubmitterTxSigned = oraclePriceSubmitterTx.signTxn(submitterAccount.sk);
					let oraclePriceTx = (await timeoutPromise(5000,  algodclient.sendRawTransaction(oraclePriceSubmitterTxSigned).do() ) );

					lastPriceRound = params.lastRound;
					
					console.log("Price Transaction Submitted: " + oraclePriceTx.txId + " submitted on block " + params.lastRound + " Data Timestamp " + priceObj.timestamp);
				}		

				// more than interval just do it
				let elapsed = Date.now() - start;
				if (elapsed < txInterval) {
					sleepInterval = txInterval - elapsed;
				}
				//console.log('Sleep interval ' + sleepInterval);
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

	// I use the same account until we can get it signed by the real price authority
	submitterAccount = algosdk.mnemonicToSecretKey(settings.submitterKey);
	oracleAccount = algosdk.mnemonicToSecretKey(settings.oracleKey);

	if (settings.interval) {
		txInterval = settings.interval;
	}
	if (settings.websocketReconnection) {
		websocketReconnection = settings.websocketReconnection;
	}

	if (settings.decimals) {
		priceDecimals = settings.decimals;
	}
	if (settings.priceExpiration) {
		priceExpiration = settings.priceExpiration;
	}
	if (settings.token) {
		token = settings.token;
	}

	if (!settings.server) {
		throw new Error("ERROR: server not defined.");
	}

	server = settings.server;

	realPrice = 
		{
			configKeyName: "price",
			subscribe: {
				type: "subscribe",
				product_ids: [
					"ALGO-USD",
				],
				channels: [
					{
						name: "ticker",
						product_ids: [
							"ALGO-USD",
						]
					}
				]
			},
			socketAddress: "wss://ws-feed.pro.coinbase.com"
		};

	algodclient = new algosdk.Algodv2(token, server, portNode); 

	if(submitterAccount.addr !== settings.submitterPublic) {
		throw new Error("ERROR: Submitter Public key does not match the Private key.");
	}
	if(oracleAccount.addr !== settings.oraclePublic) {
		throw new Error("ERROR: Oracle Public key does not match the Private key.");
	}

	setTimeout(sendPriceTransaction);
	listenSocketPrice();
})().catch(e => {
    console.log(e);
 });
