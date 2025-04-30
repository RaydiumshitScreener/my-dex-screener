     const web3 = require("@solana/web3.js");
     (async () => {
       const solana = new web3.Connection("https://dimensional-twilight-sun.solana-mainnet.quiknode.pro/4b31011e30a3f1919ca1c85281b242acafdad215/");
       console.log(await solana.getSlot());
     })();
