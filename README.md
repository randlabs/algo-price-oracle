# Algo Price Oracle

The Algo Price Oracle maintains an on-chain ALGO/USD price to serve as a reliable source for external applications.

## Price Source

The code gets ALGO/USD price from Coinbase API subscribing to a socket receiving new trade updates keeping the price always updated. The 

## Transaction Submission

Periodically, the oracle submits a transaction with the last ALGO/USD price, the timestamp of the last trade, and the timestamp of the transaction submission. The transaction timestamp is needed to enable frequencies faster than the block speed, currently around 4 seconds.
This oracle aims to submit the price with a frequency of 1/2 seconds. 

## Address

Algo Price Oracle uses the public address: [PRICEP3G2F5L6ZG5WTJIAKEQW4OJJ3FM4XVFQDZI7M2VBTFVUHTTR2AU2U](http://algoexplorer.io/address/PRICEP3G2F5L6ZG5WTJIAKEQW4OJJ3FM4XVFQDZI7M2VBTFVUHTTR2AU2U) to submit transactions.

## Configuration

The submitter address and the API endpoint must be set on the configuration file.

It needs a settings.js file like this one:

```
module.exports = {
	// private key passphrase of the transaction submitter
	submitterKey: "YOUR MNEMONIC",

	// public address of the submitter private key
	submitterPublic: "MY-ALGORAND-ADDRESS-SUBMITTER",
	
	// private key passphrase of the oracle
	oracleKey: "YOUR MNEMONIC",

	// public address of the oracle private key
	oraclePublic: "MY-ALGORAND-ADDRESS-ORACLE",
	
	// API server
	server: "https://api.algoexplorer.io",
	
	// tx submission interval
	interval: 1000,

	// decimals of the price sumbitted on-chain
	decimals: 4,

	// reconnection timeout
	websocketReconnection: 2000,

	// number of rounds that the price can be used
	priceExpiration: 20,

	// headers needed to call Algorand APIs. Using algoexplorer.io API it is not neeeded
	token: {
		'X-YOUR-KEY' : 'your-key',
	}
}
```
