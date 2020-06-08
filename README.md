# algo-price-oracle

This price oracle maintains an on-chain ALGO/USD price to serve as a reliable source for DeFi decentralized applications.

## Price Source

The code gets ALGO/USD price from Coinbase API subscribing to a socket receiving new trade updates keeping the price always updated.

## Transaction Submission

Periodically, the oracle submits a transaction with the last ALGO/USD price, the timestamp of the last trade, and the timestamp of the transaction submission. The transaction timestamp is needed to enable frequencies faster than the block speed, currently around 4 seconds.
This oracle aims to submit the price with a frequency of 1/2 seconds. 

## Address

This Price Oracle uses the public address: [PRICEP3G2F5L6ZG5WTJIAKEQW4OJJ3FM4XVFQDZI7M2VBTFVUHTTR2AU2U](http://algoexplorer.io/address/PRICEP3G2F5L6ZG5WTJIAKEQW4OJJ3FM4XVFQDZI7M2VBTFVUHTTR2AU2U) to submit transactions.

## Configuration

The submitter address and the API endpoint must be set on the configuration file.

It needs a settings.js file like this one:

```
module.exports = {
	key: "YOUR MNEMONIC",
	public: "MYALGORANDADDRESS",
	server: "api.algoexplorer.io",
	interval: 1000,
	token: headers needed to call Algorand APIs. Using algoexplorer.io API it is not neeeded
}
```
