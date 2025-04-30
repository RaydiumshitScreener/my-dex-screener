import React, { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { ethers } from 'ethers';
import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL, VersionedTransaction } from '@solana/web3.js';
import { getAssociatedTokenAddress, getAccount, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import styles from '../styles/Home.module.css';

const erc20ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)",
  "function decimals() external view returns (uint8)"
];

const Home = () => {
  const [tokens, setTokens] = useState({ eth: [], sol: [] });
  const [selectedToken, setSelectedToken] = useState('');
  const [amount, setAmount] = useState('');
  const [account, setAccount] = useState('');
  const [provider, setProvider] = useState(null);
  const [solanaConnection, setSolanaConnection] = useState(null);
  const [solanaWallet, setSolanaWallet] = useState(null);
  const [transactionType, setTransactionType] = useState('buy');
  const [networkStatus, setNetworkStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [chain, setChain] = useState('sol');
  const [expectedOutput, setExpectedOutput] = useState(null);
  const [userBalance, setUserBalance] = useState(null);

  const ethTokenAddresses = {
    USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    DAI: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
    UNI: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
    WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    LINK: '0x514910771AF9Ca656af840dff83E8264EcF986CA',
  };

  const solTokenAddresses = {
    USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    SOL: 'So11111111111111111111111111111111111111112',
    SRM: 'SRMuApVNdxXokk5GT7XD5cUUgXMBCoAz2LHeuAoKWR',
    RAY: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
    ORCA: 'orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE',
  };

  const uniswapRouterAddress = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D';
  const uniswapRouterABI = [
    "function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)",
    "function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)",
    "function WETH() external pure returns (address)",
    "function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)",
    "function getAmountsIn(uint amountOut, address[] calldata path) external view returns (uint[] memory amounts)"
  ];

  const feeRecipientEth = '0x8a265138C91C9114c661eeB9cdb314DcA52C0A32';
  const feeRecipientSol = 'FohW4KYMUv2VpwaB3H4SMZcew32mAL9cpDbqqexskmPu';
  const feePercentage = 0.003;

  const SOLANA_RPC_ENDPOINT = 'https://mainnet.helius-rpc.com/?api-key=11089c25-5c8e-436f-b1ab-60ac992c4e25';
  const JUPITER_API_BASE = 'https://quote-api.jup.ag/v6';

  const getSolExpectedOutput = async (amountIn, tokenAddress, isBuy) => {
    if (!solanaConnection) return { quote: null, outAmount: null };

    const inputMint = isBuy ? solTokenAddresses.SOL : tokenAddress;
    const outputMint = isBuy ? tokenAddress : solTokenAddresses.SOL;

    const url = `${JUPITER_API_BASE}/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amountIn}&slippageBps=50`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch quote: ${response.status} ${response.statusText}`);
    }

    const quote = await response.json();

    if (!quote || !quote.outAmount) {
      throw new Error('No swap route found.');
    }

    return { quote, outAmount: parseInt(quote.outAmount) };
  };

  const handleSolSwap = async (quote, userPubkey) => {
    const response = await fetch(`${JUPITER_API_BASE}/swap`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey: userPubkey.toString(),
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: 5000,
        feeAccount: 'FohW4KYMUv2VpwaB3H4SMZcew32mAL9cpDbqqexskmPu', // Fee account address
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch swap transaction: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return await response.json();
  };

  useEffect(() => {
    async function fetchTokens() {
      try {
        const ethResponse = await fetch(
          'https://api.coingecko.com/api/v3/simple/price?ids=tether,dai,uniswap,weth,chainlink&vs_currencies=usd'
        );
        const ethData = await ethResponse.json();
        const ethTokenList = [
          { name: 'USDT', price: ethData.tether?.usd?.toFixed(2) || 'N/A' },
          { name: 'DAI', price: ethData.dai?.usd?.toFixed(2) || 'N/A' },
          { name: 'UNI', price: ethData.uniswap?.usd?.toFixed(2) || 'N/A' },
          { name: 'WETH', price: ethData.weth?.usd?.toFixed(2) || 'N/A' },
          { name: 'LINK', price: ethData.chainlink?.usd?.toFixed(2) || 'N/A' }
        ];

        const solResponse = await fetch(
          'https://api.coingecko.com/api/v3/simple/price?ids=usd-coin,solana,serum,raydium,orca&vs_currencies=usd'
        );
        const solData = await solResponse.json();
        const solTokenList = [
          { name: 'USDC', price: solData['usd-coin']?.usd?.toFixed(2) || 'N/A' },
          { name: 'SOL', price: solData.solana?.usd?.toFixed(2) || 'N/A' },
          { name: 'SRM', price: solData.serum?.usd?.toFixed(2) || 'N/A' },
          { name: 'RAY', price: solData.raydium?.usd?.toFixed(2) || 'N/A' },
          { name: 'ORCA', price: solData.orca?.usd?.toFixed(2) || 'N/A' }
        ];

        setTokens({ eth: ethTokenList, sol: solTokenList });
      } catch (error) {
        console.error('Failed to fetch token prices:', error);
        setNetworkStatus('Failed to load token prices');
      }
    }

    fetchTokens();
  }, []);

  useEffect(() => {
    if (chain === 'eth' && window.ethereum) {
      setNetworkStatus('MetaMask detected');
      window.ethereum.on('accountsChanged', (accounts) => {
        setAccount(accounts[0] || '');
        setUserBalance(null);
      });
      window.ethereum.on('chainChanged', () => {
        window.location.reload();
      });
    } else if (chain === 'sol' && window.solana) {
      setNetworkStatus('Phantom detected');
      try {
        const connection = new Connection(SOLANA_RPC_ENDPOINT, 'confirmed');
        setSolanaConnection(connection);
      } catch (error) {
        console.error('Failed to initialize Solana connection:', error);
        setNetworkStatus('Failed to connect to Solana network.');
      }
      window.solana.on('accountChanged', (publicKey) => {
        setAccount(publicKey ? publicKey.toString() : '');
        setUserBalance(null);
      });
    } else {
      setNetworkStatus(`Please install ${chain === 'eth' ? 'MetaMask' : 'Phantom'}`);
    }
  }, [chain]);

  const connectEthWallet = async () => {
    if (!window.ethereum) {
      alert('Please install MetaMask!');
      return;
    }

    try {
      const ethersProvider = new ethers.BrowserProvider(window.ethereum);
      await window.ethereum.request({ method: 'eth_requestAccounts' });
      const signer = await ethersProvider.getSigner();
      const address = await signer.getAddress();
      setAccount(address);
      setProvider(ethersProvider);
      const net = await ethersProvider.getNetwork();
      if (net.chainId !== 1n) {
        alert('Please switch to Ethereum Mainnet in MetaMask');
      }
      const balance = await ethersProvider.getBalance(address);
      setUserBalance(ethers.formatEther(balance));
    } catch (error) {
      console.error('Wallet connection failed:', error);
      alert('Failed to connect wallet: ' + error.message);
    }
  };

  const connectSolWallet = async () => {
    if (!window.solana) {
      alert('Please install Phantom!');
      return;
    }

    try {
      const response = await window.solana.connect();
      setSolanaWallet(window.solana);
      setAccount(response.publicKey.toString());
      const connection = new Connection(SOLANA_RPC_ENDPOINT, 'confirmed');
      setSolanaConnection(connection);
      const networkVersion = await connection.getVersion();
      console.log('Connected to Solana Mainnet, version:', networkVersion['solana-core']);
      setNetworkStatus('Connected to Solana Mainnet');
      const userPubkey = new PublicKey(response.publicKey);
      const balance = await connection.getBalance(userPubkey);
      setUserBalance((balance / LAMPORTS_PER_SOL).toFixed(6));
    } catch (error) {
      console.error('Solana wallet connection failed:', error);
      setNetworkStatus('Failed to connect to Solana network: ' + error.message);
      alert('Failed to connect Solana wallet: ' + error.message);
    }
  };

  useEffect(() => {
    const fetchBalance = async () => {
      if (!account) {
        setUserBalance(null);
        return;
      }

      if (chain === 'eth' && provider) {
        const balance = await provider.getBalance(account);
        setUserBalance(ethers.formatEther(balance));
      } else if (chain === 'sol' && solanaConnection) {
        const userPubkey = new PublicKey(account);
        const balance = await solanaConnection.getBalance(userPubkey);
        setUserBalance((balance / LAMPORTS_PER_SOL).toFixed(6));
      }
    };

    fetchBalance();
  }, [account, chain, provider, solanaConnection]);

  const getEthExpectedOutput = async (amountIn, tokenAddress, signer, isBuy) => {
    const uniswapRouter = new ethers.Contract(uniswapRouterAddress, uniswapRouterABI, signer);
    const wethAddress = await uniswapRouter.WETH();
    const path = isBuy ? [wethAddress, tokenAddress] : [tokenAddress, wethAddress];
    const amounts = isBuy
      ? await uniswapRouter.getAmountsOut(amountIn, path)
      : await uniswapRouter.getAmountsIn(amountIn, path);
    return isBuy ? amounts[1] : amounts[0];
  };

  const calculateExpectedOutput = useCallback(async () => {
    if (!selectedToken || !amount || isNaN(amount) || amount <= 0) {
      setExpectedOutput(null);
      return;
    }

    try {
      if (chain === 'eth' && provider) {
        const signer = await provider.getSigner();
        const tokenAddress = ethTokenAddresses[selectedToken];
        const parsedAmount = transactionType === 'buy'
          ? ethers.parseEther(amount)
          : ethers.parseUnits(amount, 18);

        const feeAmount = (parsedAmount * BigInt(Math.floor(feePercentage * 10000))) / BigInt(10000);
        const swapAmount = parsedAmount - feeAmount;

        const output = await getEthExpectedOutput(swapAmount, tokenAddress, signer, transactionType === 'buy');
        const tokenContract = new ethers.Contract(tokenAddress, erc20ABI, signer);
        const decimals = await tokenContract.decimals();
        const formattedOutput = ethers.formatUnits(output, transactionType === 'buy' ? decimals : 18);
        setExpectedOutput(formattedOutput);
      } else if (chain === 'sol' && solanaConnection) {
        const parsedAmount = transactionType === 'buy'
          ? Math.floor(parseFloat(amount) * LAMPORTS_PER_SOL)
          : Math.floor(parseFloat(amount) * 1_000_000);

        const feeAmount = Math.floor(parsedAmount * feePercentage);
        const swapAmount = parsedAmount - feeAmount;

        const { outAmount } = await getSolExpectedOutput(swapAmount, solTokenAddresses[selectedToken], transactionType === 'buy');
        const formattedOutput = (outAmount / 1_000_000).toFixed(6);
        setExpectedOutput(formattedOutput);
      }
    } catch (error) {
      console.error('Failed to calculate expected output:', error);
      setExpectedOutput(null);
    }
  }, [amount, selectedToken, transactionType, chain, provider, solanaConnection, ethTokenAddresses, solTokenAddresses, feePercentage]);

  useEffect(() => {
    calculateExpectedOutput();
  }, [amount, selectedToken, transactionType, chain, provider, solanaConnection, calculateExpectedOutput]);

  const isValidSolanaAddress = (address) => {
    if (!address || typeof address !== 'string') {
      return false;
    }
    try {
      new PublicKey(address);
      return true;
    } catch (error) {
      return false;
    }
  };

  const handleEthTransaction = async (signer, tokenAddress, amountIn) => {
    if (transactionType === 'buy') {
      const ethAmount = ethers.parseEther(amountIn);
      const feeAmount = (ethAmount * BigInt(Math.floor(feePercentage * 10000))) / BigInt(10000);
      const swapAmount = ethAmount - feeAmount;

      if (swapAmount <= 0) {
        throw new Error('Amount too low to cover the fee.');
      }

      const ethBalance = await provider.getBalance(account);
      if (ethBalance < ethAmount) {
        throw new Error(`Insufficient ETH balance. Available: ${ethers.formatEther(ethBalance)} ETH`);
      }

      const feeTx = await signer.sendTransaction({
        to: feeRecipientEth,
        value: feeAmount,
        gasLimit: 21000,
      });
      await feeTx.wait();
      console.log('Fee transaction sent:', feeTx.hash);

      const expectedOutputAmount = await getEthExpectedOutput(swapAmount, tokenAddress, signer, true);
      const amountOutMin = (expectedOutputAmount * 95n) / 100n;

      const deadline = Math.floor(Date.now() / 1000) + 60 * 20;
      const uniswapRouter = new ethers.Contract(uniswapRouterAddress, uniswapRouterABI, signer);
      const swapTx = await uniswapRouter.swapExactETHForTokens(
        amountOutMin,
        [await uniswapRouter.WETH(), tokenAddress],
        account,
        deadline,
        {
          value: swapAmount,
          gasLimit: 350000,
        }
      );
      const receipt = await swapTx.wait();
      return receipt;
    } else {
      const tokenContract = new ethers.Contract(tokenAddress, erc20ABI, signer);
      const decimals = await tokenContract.decimals();
      const tokenAmount = ethers.parseUnits(amountIn, decimals);

      const tokenBalance = await tokenContract.balanceOf(account);
      if (tokenBalance < tokenAmount) {
        throw new Error(`Insufficient ${selectedToken} balance. Available: ${ethers.formatUnits(tokenBalance, decimals)}`);
      }

      const feeAmount = (tokenAmount * BigInt(Math.floor(feePercentage * 10000))) / BigInt(10000);
      const feeInEth = await getEthExpectedOutput(feeAmount, tokenAddress, signer, false);
      const ethBalance = await provider.getBalance(account);
      if (ethBalance < feeInEth) {
        throw new Error('Insufficient ETH balance to cover the fee.');
      }

      const feeTx = await signer.sendTransaction({
        to: feeRecipientEth,
        value: feeInEth,
        gasLimit: 21000,
      });
      await feeTx.wait();
      console.log('Fee transaction sent:', feeTx.hash);

      const swapAmount = tokenAmount - feeAmount;

      const allowance = await tokenContract.allowance(account, uniswapRouterAddress);
      if (allowance < tokenAmount) {
        const approveTx = await tokenContract.approve(uniswapRouterAddress, tokenAmount);
        await approveTx.wait();
        console.log('Approval successful:', approveTx.hash);
      }

      const expectedEth = await getEthExpectedOutput(swapAmount, tokenAddress, signer, false);
      const amountOutMin = (expectedEth * 95n) / 100n;

      const deadline = Math.floor(Date.now() / 1000) + 60 * 20;
      const uniswapRouter = new ethers.Contract(uniswapRouterAddress, uniswapRouterABI, signer);
      const swapTx = await uniswapRouter.swapExactTokensForETH(
        swapAmount,
        amountOutMin,
        [tokenAddress, await uniswapRouter.WETH()],
        account,
        deadline,
        { gasLimit: 350000 }
      );
      const receipt = await swapTx.wait();
      return receipt;
    }
  };

  const handleSolTransaction = async (tokenAddress) => {
    if (!solanaWallet || !solanaConnection) {
      throw new Error('Solana wallet or connection not available.');
    }

    if (!tokenAddress) {
      throw new Error('Token address is undefined or empty. Please select a valid token.');
    }

    if (!isValidSolanaAddress(tokenAddress)) {
      throw new Error(`Invalid token address: ${tokenAddress}. Please check the token address in solTokenAddresses.`);
    }

    if (!isValidSolanaAddress(solTokenAddresses.SOL)) {
      throw new Error(`Invalid SOL address in solTokenAddresses: ${solTokenAddresses.SOL}`);
    }

    const userPubkey = new PublicKey(account);
    const solAmount = parseFloat(amount);
    const lamports = transactionType === 'buy'
      ? Math.floor(solAmount * LAMPORTS_PER_SOL)
      : Math.floor(solAmount * 1_000_000);

    const feeLamports = Math.floor(lamports * feePercentage);
    const swapLamports = lamports - feeLamports;

    if (swapLamports <= 0) {
      throw new Error('Input amount too low to cover fee.');
    }

    const userBalanceLamports = await solanaConnection.getBalance(userPubkey);
    const minRequiredLamports = lamports + 5000;

    let ataCreationFee = 0;
    let userAta;
    if (transactionType === 'buy') {
      const outputMint = new PublicKey(tokenAddress);
      userAta = await getAssociatedTokenAddress(outputMint, userPubkey);
      let ataExists = false;
      try {
        await getAccount(solanaConnection, userAta);
        ataExists = true;
      } catch (error) {
        ataExists = false;
      }

      ataCreationFee = ataExists ? 0 : 0.00203928 * LAMPORTS_PER_SOL;
      const totalRequiredLamports = minRequiredLamports + ataCreationFee;

      if (userBalanceLamports < totalRequiredLamports) {
        throw new Error(
          `Insufficient SOL balance. Required: ${(totalRequiredLamports / LAMPORTS_PER_SOL).toFixed(6)} SOL, Available: ${(userBalanceLamports / LAMPORTS_PER_SOL).toFixed(6)} SOL${ataExists ? '' : ' (includes ATA creation fee)'}`
        );
      }
    } else {
      userAta = await getAssociatedTokenAddress(new PublicKey(tokenAddress), userPubkey);
      try {
        const tokenAccount = await getAccount(solanaConnection, userAta);
        const tokenBalance = Number(tokenAccount.amount);
        if (tokenBalance < swapLamports) {
          throw new Error(`Insufficient ${selectedToken} balance. Available: ${(tokenBalance / 1_000_000).toFixed(6)}`);
        }
      } catch (error) {
        throw new Error(`Token account for ${selectedToken} not found. Please ensure you own this token.`);
      }

      if (userBalanceLamports < feeLamports + 5000) {
        throw new Error(
          `Insufficient SOL balance to cover fee. Required: ${((feeLamports + 5000) / LAMPORTS_PER_SOL).toFixed(6)} SOL, Available: ${(userBalanceLamports / LAMPORTS_PER_SOL).toFixed(6)} SOL`
        );
      }
    }

    const feeRecipientPubkey = new PublicKey(feeRecipientSol);

    const feeTx = new Transaction();
    feeTx.feePayer = userPubkey;
    feeTx.recentBlockhash = (await solanaConnection.getLatestBlockhash()).blockhash;
    feeTx.add(
      SystemProgram.transfer({
        fromPubkey: userPubkey,
        toPubkey: feeRecipientPubkey,
        lamports: feeLamports,
      })
    );

    const signedFeeTx = await solanaWallet.signTransaction(feeTx);
    const feeSignature = await solanaConnection.sendRawTransaction(signedFeeTx.serialize(), {
      skipPreflight: false,
    });
    await solanaConnection.confirmTransaction(feeSignature);
    console.log('Fee transaction (SOL):', feeSignature);

    const { quote } = await getSolExpectedOutput(swapLamports, tokenAddress, transactionType === 'buy');

    const swapResponse = await handleSolSwap(quote, userPubkey);

    const swapTransactionBuf = Buffer.from(swapResponse.swapTransaction, 'base64');
    const transaction = VersionedTransaction.deserialize(swapTransactionBuf);

    const latestBlockhash = await solanaConnection.getLatestBlockhash();
    transaction.message.recentBlockhash = latestBlockhash.blockhash;

    const signedTransaction = await solanaWallet.signTransaction(transaction);
    const signature = await solanaConnection.sendRawTransaction(signedTransaction.serialize(), {
      skipPreflight: false,
    });

    await solanaConnection.confirmTransaction(signature);
    console.log('Swap transaction (SOL):', signature);

    return { transactionHash: signature };
  };

  const handleTransaction = async (e) => {
    e.preventDefault();

    if (!selectedToken || !amount || isNaN(amount) || amount <= 0) {
      alert('Please select a token and enter a valid amount.');
      return;
    }

    if (!account) {
      alert('Please connect your wallet first.');
      return;
    }

    setLoading(true);
    try {
      if (chain === 'eth') {
        const signer = await provider.getSigner();
        const net = await provider.getNetwork();
        if (net.chainId !== 1n) {
          throw new Error('Please switch to Ethereum Mainnet in MetaMask.');
        }
        const tokenAddress = ethTokenAddresses[selectedToken];
        const receipt = await handleEthTransaction(signer, tokenAddress, amount);
        alert(`Successfully ${transactionType === 'buy' ? 'bought' : 'sold'} ${selectedToken}! Tx: ${receipt.hash}`);
      } else if (chain === 'sol') {
        const tokenAddress = solTokenAddresses[selectedToken];
        if (!tokenAddress) {
          throw new Error(`Token address for ${selectedToken} is undefined. Please check solTokenAddresses.`);
        }
        const receipt = await handleSolTransaction(tokenAddress);
        alert(`Successfully ${transactionType === 'buy' ? 'bought' : 'sold'} ${selectedToken}! Tx: ${receipt.transactionHash}`);
      }
    } catch (error) {
      console.error('Transaction failed:', error);
      if (error.code === 4001) {
        alert('Transaction failed: User rejected the transaction.');
      } else {
        alert(`Transaction failed: ${error.message || 'Unknown error'}`);
      }
    } finally {
      setLoading(false);
      if (chain === 'eth' && provider) {
        const balance = await provider.getBalance(account);
        setUserBalance(ethers.formatEther(balance));
      } else if (chain === 'sol' && solanaConnection) {
        const userPubkey = new PublicKey(account);
        const balance = await solanaConnection.getBalance(userPubkey);
        setUserBalance((balance / LAMPORTS_PER_SOL).toFixed(6));
      }
      calculateExpectedOutput();
    }
  };

  const feeAmountDisplay = amount && !isNaN(amount) ? (parseFloat(amount) * feePercentage).toFixed(6) : '0';

  return (
    <div className={styles.pageWrapper}>
      <Head>
        <title>Bitlyx Sol</title>
        <meta name="description" content="Swap tokens on Ethereum and Solana with Bitlyx Sol" />
      </Head>
      <header className={styles.header}>
        <div className={styles.logo}>Bitlyx Sol</div>
        <nav className={styles.nav}>
          <Link href="/" className={`${styles.navLink} ${styles.active}`}>
            Swap
          </Link>
          <Link href="/new-pairs" className={styles.navLink}>
            New Pairs
          </Link>
          <Link href="#" className={styles.navLink}>
            Limit
          </Link>
          <Link href="#" className={styles.navLink}>
            DCA
          </Link>
          <Link href="#" className={styles.navLink}>
            Bridge
          </Link>
          <div className={styles.chainSelector}>
            <button
              className={`${styles.chainButton} ${chain === 'eth' ? styles.active : ''}`}
              onClick={() => setChain('eth')}
            >
              Ethereum
            </button>
            <button
              className={`${styles.chainButton} ${chain === 'sol' ? styles.active : ''}`}
              onClick={() => setChain('sol')}
            >
              Solana
            </button>
          </div>
          <button className={styles.settingsButton}>⚙️</button>
        </nav>
        <div className={styles.walletSection}>
          {!account ? (
            <button
              onClick={chain === 'eth' ? connectEthWallet : connectSolWallet}
              className={styles.connectButton}
              disabled={loading}
            >
              Connect Wallet
            </button>
          ) : (
            <div className={styles.connectedWallet}>
              <span>{account.slice(0, 6)}...{account.slice(-4)}</span>
              <button className={styles.disconnectButton}>✖</button>
            </div>
          )}
        </div>
      </header>

      <main className={styles.container}>
        <div className={styles.swapBox}>
          <h1>Swap Tokens ({chain === 'eth' ? 'Ethereum' : 'Solana'} Mainnet)</h1>
          <p className={styles.networkStatus}>{networkStatus}</p>
          {account && (
            <div className={styles.balanceInfo}>
              <p>Your Balance: {userBalance || '0'} {chain === 'eth' ? 'ETH' : 'SOL'}</p>
            </div>
          )}
          <form onSubmit={handleTransaction} className={styles.form}>
            <div className={styles.formGroup}>
              <label>Token:</label>
              <select
                value={selectedToken}
                onChange={(e) => setSelectedToken(e.target.value)}
                className={styles.select}
              >
                <option value="">Select Token</option>
                {(chain === 'eth' ? tokens.eth : tokens.sol).map((token) => (
                  <option key={token.name} value={token.name}>
                    {token.name} - ${token.price}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.formGroup}>
              <label>Amount ({transactionType === 'buy' ? (chain === 'eth' ? 'ETH' : 'SOL') : selectedToken}):</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={styles.input}
                min="0"
                step="any"
                placeholder={`Enter ${transactionType === 'buy' ? (chain === 'eth' ? 'ETH' : 'SOL') : selectedToken} amount`}
              />
              <p className={styles.feeInfo}>
                Transaction Fee (0.3%): {feeAmountDisplay} {transactionType === 'buy' ? (chain === 'eth' ? 'ETH' : 'SOL') : selectedToken}
              </p>
              {expectedOutput && (
                <p className={styles.feeInfo}>
                  Expected Output: {parseFloat(expectedOutput).toFixed(6)} {transactionType === 'buy' ? selectedToken : (chain === 'eth' ? 'ETH' : 'SOL')}
                </p>
              )}
            </div>
            <div className={styles.formGroup}>
              <label>Transaction Type:</label>
              <select
                value={transactionType}
                onChange={(e) => setTransactionType(e.target.value)}
                className={styles.select}
              >
                <option value="buy">Buy</option>
                <option value="sell">Sell</option>
              </select>
            </div>
            <button type="submit" className={styles.button} disabled={loading}>
              {loading ? 'Processing...' : transactionType === 'buy' ? 'Buy Token' : 'Sell Token'}
            </button>
          </form>
        </div>
        {(chain === 'eth' ? tokens

.eth : tokens.sol).length > 0 && (
          <div className={styles.tokenPrices}>
            <h2>Market Overview</h2>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Token</th>
                  <th>Price (USD)</th>
                  <th>Change (24h)</th>
                </tr>
              </thead>
              <tbody>
                {(chain === 'eth' ? tokens.eth : tokens.sol).map((token) => (
                  <tr key={token.name}>
                    <td>{token.name}</td>
                    <td>${token.price}</td>
                    <td className={styles.priceChange}>+0.00%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerLinks}>
          <Link href="#" className={styles.footerLink}>Docs</Link>
          <Link href="#" className={styles.footerLink}>Terms</Link>
          <Link href="#" className={styles.footerLink}>Privacy</Link>
        </div>
        <div className={styles.socialLinks}>
          <a href="https://twitter.com" target="_blank" rel="noopener noreferrer">Twitter</a>
          <a href="https://discord.com" target="_blank" rel="noopener noreferrer">Discord</a>
        </div>
        <p>© 2025 Bitlyx Sol. All rights reserved.</p>
      </footer>
    </div>
  );
};

export default Home;