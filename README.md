# algo-price-oracle
This code takes the algo price from Messari API periodically and submittes it on-chain to Algorand Blockchain through a transaction in the Note field. 

It needs a settings.js file like this one:

```
module.exports = {
	key: "YOUR MNEMONIC",
	public: "MYALGORANDADDRESS",
	server: "api.algoexplorer.io",
	"messari-api-key": "YOUR MESSARI KEY",
	interval: 1000	
}
```
