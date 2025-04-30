import { useEffect, useState, useCallback } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import * as solanaWeb3 from '@solana/web3.js';
import { Liquidity, MAINNET_PROGRAM_ID } from '@raydium-io/raydium-sdk';
import axios from 'axios';
import styles from '../styles/Home.module.css';

// Rate limiter for RPC requests
class RateLimiter {
  constructor(limit, interval) {
    this.limit = limit;
    this.interval = interval;
    this.queue = [];
    this.count = 0;
    setInterval(() => {
      this.count = 0;
      this.processQueue();
    }, interval);
  }

  async execute(task) {
    if (this.count < this.limit) {
      this.count++;
      return task();
    }
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
    });
  }

  processQueue() {
    while (this.count < this.limit && this.queue.length > 0) {
      const { task, resolve, reject } = this.queue.shift();
      this.count++;
      try {
        task().then(resolve).catch(reject);
      } catch (error) {
        reject(error);
      }
    }
  }
}

// Set to 10 RPS to avoid QuickNode Free plan 15 RPS limit
const rateLimiter = new RateLimiter(10, 1000);

const RAYDIUM_PUBLIC_KEY = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8';
const HTTP_URL = 'https://dimensional-twilight-sun.solana-mainnet.quiknode.pro/4b31011e30a3f1919ca1c85281b242acafdad215/';
const WSS_URL = 'wss://dimensional-twilight-sun.solana-mainnet.quiknode.pro/4b31011e30a3f1919ca1c85281b242acafdad215/';
const INSTRUCTION_NAME = 'initialize2';
const LIQUIDITY_API = '/mock-liquidity.json'; // Replace with https://api.raydium.io/v2/amm/pools for production
const TOKEN_API = 'https://raw.githubusercontent.com/jup-ag/token-list/main/token-list.json';

const NewPairs = () => {
  const [pairs, setPairs] = useState([]);
  const [connection, setConnection] = useState(null);
  const [subscriptionId, setSubscriptionId] = useState(null);
  const [error, setError] = useState(null);
  const [tokenCache, setTokenCache] = useState({});
  const [signatureCache, setSignatureCache] = useState(new Set());
  const [poolAddressCache, setPoolAddressCache] = useState(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [retryCooldown, setRetryCooldown] = useState(false);
  const [rateLimitErrors, setRateLimitErrors] = useState(0);

  const isValidPublicKey = (key) => {
    try {
      new solanaWeb3.PublicKey(key);
      return true;
    } catch {
      return false;
    }
  };

  const retry = async (fn, retries = 3, delay = 2000) => {
    for (let i = 0; i < retries; i++) {
      try {
        return await fn();
      } catch (error) {
        if (i === retries - 1) throw error;
        console.warn(`Retry ${i + 1}/${retries} failed: ${error.message}. Waiting ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  };

  const formatTimestamp = (timestamp) => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  const getTokenMetadata = async (tokenMint) => {
    const mintStr = tokenMint.toBase58();
    if (tokenCache[mintStr]) {
      return tokenCache[mintStr];
    }
    try {
      const { data } = await retry(() => axios.get(TOKEN_API, { timeout: 10000 }));
      console.log('Token API data:', data.slice(0, 5)); // Debug
      const token = data.find((t) => t.address === mintStr);
      const metadata = token
        ? { name: token.name || 'Unknown', symbol: token.symbol || 'TKN' }
        : { name: `Token_${mintStr.slice(0, 4)}`, symbol: 'TKN' };
      setTokenCache((prev) => {
        const updated = { ...prev, [mintStr]: metadata };
        try {
          localStorage.setItem('tokenCache', JSON.stringify(updated));
        } catch (e) {
          console.warn('Failed to save token cache:', e.message);
        }
        return updated;
      });
      return metadata;
    } catch (error) {
      console.error(`Failed to fetch metadata for mint ${mintStr}:`, error.message);
      return { name: `Token_${mintStr.slice(0, 4)}`, symbol: 'TKN' };
    }
  };

  const getPoolData = async (poolAddress) => {
    if (!isValidPublicKey(poolAddress)) {
      console.warn(`Invalid pool address: ${poolAddress}`);
      return {
        liquidity: 'TBD',
        initialLiquidity: 'TBD',
        marketCap: 'N/A',
        txns: 'TBD',
        volume: 'N/A',
      };
    }
    try {
      const poolInfo = await rateLimiter.execute(() =>
        Liquidity.fetchInfo({
          connection,
          poolKeys: { id: new solanaWeb3.PublicKey(poolAddress) },
          programId: MAINNET_PROGRAM_ID.AmmV4,
        })
      );
      let pool = null;
      try {
        const { data } = await retry(() => axios.get(LIQUIDITY_API, { timeout: 10000 }));
        pool = [...(data.official || []), ...(data.unOfficial || [])].find((p) => p.id === poolAddress);
      } catch (error) {
        console.warn(`Failed to fetch liquidity data for ${poolAddress}:`, error.message);
      }
      return {
        liquidity: poolInfo.totalLiquidity ? (poolInfo.totalLiquidity.toNumber() / 1e9).toFixed(2) : pool?.liquidity || 'TBD',
        initialLiquidity: pool?.initialLiquidity || 'TBD',
        marketCap: pool?.marketCap || 'N/A',
        txns: pool?.txns || 'TBD',
        volume: pool?.volume24h || 'N/A',
      };
    } catch (error) {
      console.error(`Error fetching pool data for ${poolAddress}:`, error.message);
      return {
        liquidity: 'TBD',
        initialLiquidity: 'TBD',
        marketCap: 'N/A',
        txns: 'TBD',
        volume: 'N/A',
      };
    }
  };

  const addPair = async (transaction) => {
    const signature = transaction.transaction.signatures[0];
    if (signatureCache.has(signature)) {
      console.log('Skipping duplicate signature:', signature);
      return;
    }
    signatureCache.add(signature);

    const timestamp = transaction.meta?.blockTime || Math.floor(Date.now() / 1000);
    const instructions = transaction.transaction.message.instructions || [];
    const innerInstructions = transaction.meta?.innerInstructions?.flatMap((inner) => inner.instructions) || [];

    const allInstructions = [...instructions, ...innerInstructions];
    const initInstruction = allInstructions.find((instr) =>
      instr.programId?.equals(new solanaWeb3.PublicKey(RAYDIUM_PUBLIC_KEY))
    );

    if (!initInstruction) {
      console.warn('No Raydium instruction found in transaction:', signature, 'Instructions:', allInstructions.map((i) => ({
        programId: i.programId?.toBase58(),
        accounts: i.accounts?.map(a => a.toBase58()),
        data: i.data?.slice(0, 20), // Truncate for readability
      })));
      return;
    }

    const poolAddress = initInstruction.accounts[0]?.toBase58();
    const tokenMint = initInstruction.accounts[4]?.toBase58();
    if (!isValidPublicKey(tokenMint) || !isValidPublicKey(poolAddress)) {
      console.warn('Invalid tokenMint or poolAddress:', { tokenMint, poolAddress, signature });
      return;
    }

    if (poolAddressCache.has(poolAddress)) {
      console.log('Skipping duplicate pool address:', poolAddress);
      return;
    }
    poolAddressCache.add(poolAddress);

    const tokenMetadata = await getTokenMetadata(new solanaWeb3.PublicKey(tokenMint));
    const poolData = await getPoolData(poolAddress);

    const newPair = {
      id: signature,
      poolAddress,
      created: formatTimestamp(timestamp),
      token: `${tokenMetadata.name} (${tokenMetadata.symbol})`,
      liquidity: poolData.liquidity,
      initialLiquidity: poolData.initialLiquidity,
      marketCap: poolData.marketCap,
      txns: poolData.txns,
      volume: poolData.volume,
      auditLink: `https://rugcheck.xyz/tokens/${tokenMint}`,
      tradeLink: `https://raydium.io/swap/?inputMint=sol&outputMint=${tokenMint}`,
      viewLink: `https://solscan.io/token/${tokenMint}`,
    };

    setPairs((prev) => {
      const updated = [newPair, ...prev.filter((p) => p.poolAddress !== newPair.poolAddress)].slice(0, 100);
      return updated;
    });
    setIsLoading(false);
  };

  const fetchInitialPools = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data } = await retry(() => axios.get(LIQUIDITY_API, { timeout: 10000 }));
      console.log('Liquidity API data:', data); // Debug
      if (!data || (!Array.isArray(data.official) && !Array.isArray(data.unOfficial))) {
        throw new Error('Invalid liquidity API response: missing official or unOfficial arrays');
      }
      const seenIds = new Set();
      const recentPools = [...(data.official || []), ...(data.unOfficial || [])]
        .filter((pool) => {
          if (!pool.id || !pool.createdTimestamp || !isValidPublicKey(pool.id) || !isValidPublicKey(pool.baseMint)) {
            console.warn('Invalid pool data:', pool);
            return false;
          }
          if (seenIds.has(pool.id)) return false;
          seenIds.add(pool.id);
          return true;
        })
        .sort((a, b) => (b.createdTimestamp || 0) - (a.createdTimestamp || 0))
        .slice(0, 5);

      console.log('Filtered pools:', recentPools); // Debug
      for (const pool of recentPools) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const mockTransaction = {
          transaction: {
            signatures: ['mock_' + pool.id],
            message: {
              instructions: [
                {
                  programId: new solanaWeb3.PublicKey(RAYDIUM_PUBLIC_KEY),
                  data: Buffer.from('initialize2'),
                  accounts: [
                    new solanaWeb3.PublicKey(pool.id),
                    {},
                    {},
                    {},
                    new solanaWeb3.PublicKey(pool.baseMint),
                  ],
                },
              ],
            },
          },
          meta: { blockTime: Math.floor((pool.createdTimestamp || Date.now()) / 1000), innerInstructions: [] },
        };
        await addPair(mockTransaction);
      }
      if (recentPools.length === 0) {
        throw new Error('No valid pools found in mock data');
      }
    } catch (error) {
      console.error('Error fetching initial pools:', error.message);
      setError('Failed to load initial pool data. Ensure /mock-liquidity.json exists in public/ with valid base58 pool IDs (e.g., 4k3Dyjzv...).');
      const mockPoolId = 'mock_pool_' + Date.now();
      const mockTransaction = {
        transaction: {
          signatures: [mockPoolId],
          message: {
            instructions: [
              {
                programId: new solanaWeb3.PublicKey(RAYDIUM_PUBLIC_KEY),
                data: Buffer.from('initialize2'),
                accounts: [
                  new solanaWeb3.PublicKey('4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R'),
                  {},
                  {},
                  {},
                  new solanaWeb3.PublicKey('So11111111111111111111111111111111111111112'),
                ],
              },
            ],
          },
        },
        meta: { blockTime: Math.floor(Date.now() / 1000), innerInstructions: [] },
      };
      await addPair(mockTransaction);
    }
    setIsLoading(false);
  }, [connection]);

  useEffect(() => {
    try {
      const cached = localStorage.getItem('tokenCache');
      if (cached) setTokenCache(JSON.parse(cached));
    } catch (e) {
      console.warn('Failed to load token cache:', e.message);
    }

    const solanaConnection = new solanaWeb3.Connection(HTTP_URL, {
      wsEndpoint: WSS_URL,
      commitment: 'confirmed',
      disableRetryOnRateLimit: true,
    });
    setConnection(solanaConnection);

    rateLimiter.execute(() => solanaConnection.getVersion()).then((version) => {
      console.log('Connected to Solana RPC. Version:', version['solana-core']);
    }).catch((error) => {
      console.error('Failed to connect to Solana RPC:', error.message);
      setError('Failed to connect to Solana network. Check your QuickNode endpoint at https://dashboard.quicknode.com.');
    });

    fetchInitialPools();

    const subscribeToNewPools = async (retryCount = 0, maxRetries = 3) => {
      if (!solanaConnection) return;

      try {
        const transactionQueue = [];
        let lastProcessed = 0;
        let circuitBreaker = false;

        const processQueue = async () => {
          if (circuitBreaker) return;
          const now = Date.now();
          if (now - lastProcessed < 500 || transactionQueue.length === 0) return;
          lastProcessed = now;
          const transaction = transactionQueue.shift();
          try {
            await addPair(transaction);
          } catch (error) {
            console.error('Error processing transaction:', error.message);
          }
          setTimeout(processQueue, 500);
        };

        const newSubscriptionId = solanaConnection.onLogs(
          new solanaWeb3.PublicKey(RAYDIUM_PUBLIC_KEY),
          async (logs) => {
            if (circuitBreaker) return;
            if (logs.err === null && logs.logs.some((log) => log.includes('initialize2'))) {
              try {
                const transaction = await rateLimiter.execute(() =>
                  solanaConnection.getParsedTransaction(logs.signature, {
                    maxSupportedTransactionVersion: 0,
                    commitment: 'confirmed',
                  })
                );
                if (transaction) {
                  console.log('New pool transaction:', transaction.transaction.signatures[0]);
                  transactionQueue.push(transaction);
                  if (transactionQueue.length > 3) transactionQueue.shift(); // Cap at 3
                  processQueue();
                } else {
                  console.warn('No transaction data for signature:', logs.signature);
                }
              } catch (error) {
                if (error.message.includes('429')) {
                  setRateLimitErrors((prev) => prev + 1);
                  if (rateLimitErrors >= 1) {
                    circuitBreaker = true;
                    console.warn('Rate limit hit. Pausing for 10s...');
                    setError('QuickNode rate limit exceeded. Pausing for 10s. Check dashboard: https://dashboard.quicknode.com');
                    setTimeout(() => {
                      circuitBreaker = false;
                      setRateLimitErrors(0);
                      setError(null);
                    }, 10000);
                  }
                }
                console.error('Transaction fetch error:', error.message, 'Signature:', logs.signature);
              }
            }
          },
          'confirmed'
        );
        setSubscriptionId(newSubscriptionId);
        console.log('Subscribed to Raydium pool creation logs. ID:', newSubscriptionId);
      } catch (error) {
        console.error('Error subscribing to new pools:', error.message);
        if (retryCount < maxRetries) {
          console.log(`Retrying subscription (${retryCount + 1}/${maxRetries})...`);
          setTimeout(() => subscribeToNewPools(retryCount + 1, maxRetries), 5000);
        } else {
          setError('Failed to subscribe to new pool updates. Check your QuickNode endpoint at https://dashboard.quicknode.com.');
        }
      }
    };

    subscribeToNewPools();

    const clearCacheInterval = setInterval(() => {
      setSignatureCache(new Set());
      setPoolAddressCache(new Set());
    }, 24 * 60 * 60 * 1000);

    return () => {
      clearInterval(clearCacheInterval);
      if (solanaConnection && subscriptionId) {
        solanaConnection.removeOnLogsListener(subscriptionId).catch((error) => {
          console.error('Error unsubscribing from logs:', error.message);
        });
      }
    };
  }, []);

  const handleRetry = () => {
    if (retryCooldown) return;
    setIsLoading(true);
    setError(null);
    setPairs([]);
    fetchInitialPools().catch((error) => {
      console.error('Retry failed:', error.message);
      setError('Failed to retry loading pools. Check /mock-liquidity.json or QuickNode settings.');
      setIsLoading(false);
    });
    setRetryCooldown(true);
    setTimeout(() => setRetryCooldown(false), 3000);
  };

  return (
    <div className={styles.pageWrapper}>
      <Head>
        <title>New Pairs - Bitlyx Sol</title>
        <meta name="description" content="View new token pairs on Raydium DEX with Bitlyx Sol" />
      </Head>
      <header className={styles.header}>
        <div className={styles.logo}>Bitlyx Sol</div>
        <nav className={styles.nav}>
          <Link href="/" className={styles.navLink}>
            Swap
          </Link>
          <Link href="/new-pairs" className={`${styles.navLink} ${styles.active}`}>
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
            <button className={`${styles.chainButton} ${styles.active}`}>Solana</button>
          </div>
          <button className={styles.settingsButton}>⚙️</button>
        </nav>
        <div className={styles.walletSection}>
          <button className={styles.connectButton}>Connect Wallet</button>
        </div>
      </header>
      <main className={styles.container}>
        <div className={styles.swapBox}>
          <h1>New Pairs on Raydium DEX</h1>
          {error && <p className={styles.error}>{error}</p>}
          {isLoading ? (
            <p>Loading new pairs... <span className={styles.spinner}>🌀</span></p>
          ) : pairs.length === 0 ? (
            <div>
              <p>No new pairs found. Try refreshing or checking your QuickNode configuration at https://dashboard.quicknode.com.</p>
              <button
                className={`${styles.button} ${retryCooldown ? styles.disabled : ''}`}
                onClick={handleRetry}
                disabled={retryCooldown}
              >
                {retryCooldown ? 'Wait 3s' : 'Retry'}
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className={`${styles.table} ${styles.newPairsTable}`}>
                <thead>
                  <tr>
                    <th>Created</th>
                    <th>Token</th>
                    <th>Liquidity</th>
                    <th>Initial Liquidity</th>
                    <th>MKT Cap</th>
                    <th>TXNS</th>
                    <th>Volume</th>
                    <th>Audit Results</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pairs.map((pair) => (
                    <tr key={pair.id}>
                      <td>{pair.created}</td>
                      <td>{pair.token}</td>
                      <td>${pair.liquidity}</td>
                      <td>${pair.initialLiquidity}</td>
                      <td>${pair.marketCap}</td>
                      <td>{pair.txns}</td>
                      <td>${pair.volume}</td>
                      <td>
                        <a href={pair.auditLink} target="_blank" rel="noopener noreferrer" className={styles.footerLink}>
                          Check Audit
                        </a>
                      </td>
                      <td>
                        <a href={pair.tradeLink} target="_blank" rel="noopener noreferrer" className={styles.button}>
                          Trade
                        </a>
                        <a href={pair.viewLink} target="_blank" rel="noopener noreferrer" className={`${styles.button} ml-2`}>
                          View
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
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

export default NewPairs;
