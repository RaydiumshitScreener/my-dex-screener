import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import * as solanaWeb3 from '@solana/web3.js';
import axios from 'axios';
import styles from '../styles/Home.module.css';

const RAYDIUM_PUBLIC_KEY = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8';
const LIQUIDITY_API = '/mock-liquidity.json';
const TOKEN_API = 'https://api.raydium.io/v2/sdk/token/raydium.mainnet.json';

const NewPairs = () => {
  const [pairs, setPairs] = useState([]);
  const [rpcError, setRpcError] = useState('Using mock data (RPC disabled).');

  const isValidPublicKey = (key) => {
    try {
      new solanaWeb3.PublicKey(key);
      return true;
    } catch {
      return false;
    }
  };

  useEffect(() => {
    const RAYDIUM = new solanaWeb3.PublicKey(RAYDIUM_PUBLIC_KEY);

    const formatTimestamp = (timestamp) => {
      return new Date(timestamp * 1000).toLocaleString();
    };

    const getTokenMetadata = async (tokenMint) => {
      const mockTokens = {
        'So11111111111111111111111111111111111111112': { name: 'Wrapped SOL', symbol: 'SOL' },
        '7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1Y7ARj': { name: 'StarAtlas', symbol: 'ATLAS' },
      };
      const mintStr = tokenMint.toBase58();
      if (mockTokens[mintStr]) {
        console.log('Using mock token metadata:', mockTokens[mintStr]);
        return { ...mockTokens[mintStr], mint: mintStr };
      }
      try {
        const { data } = await axios.get(TOKEN_API, { timeout: 5000 });
        const token = [...(data.official || []), ...(data.unOfficial || [])].find((t) => t.mint === mintStr);
        return token ? { name: token.name, symbol: token.symbol, mint: mintStr } : { name: `Token_${mintStr.slice(0, 4)}`, symbol: 'TKN', mint: mintStr };
      } catch (error) {
        console.error('Token metadata fetch failed:', error);
        return { name: `Token_${mintStr.slice(0, 4)}`, symbol: 'TKN', mint: mintStr };
      }
    };

    const getPoolData = async (poolAddress) => {
      try {
        const { data } = await axios.get(LIQUIDITY_API, { timeout: 5000 });
        console.log('Mock liquidity data:', data);
        const pool = [...(data.official || []), ...(data.unOfficial || [])].find((p) => p.id === poolAddress);
        if (!pool) {
          throw new Error(`Pool ${poolAddress} not found in mock data`);
        }
        console.log('Found pool:', pool);
        return {
          liquidity: pool.liquidity.toLocaleString(),
          initialLiquidity: pool.liquidity.toLocaleString(),
          marketCap: pool.marketCap.toLocaleString(),
          txns: pool.txns.toString(),
          volume: pool.volume24h.toLocaleString(),
        };
      } catch (error) {
        console.error('Error fetching pool data:', error);
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
      const timestamp = transaction.meta?.blockTime || Math.floor(Date.now() / 1000);
      const instructions = transaction.transaction.message.instructions;
      console.log('Transaction instructions:', instructions);
      const initInstruction = instructions.find(
        (instr) => instr.programId.equals(RAYDIUM)
      );
      if (!initInstruction) {
        console.warn('No Raydium instruction found in transaction:', signature);
        return;
      }

      const tokenMint = initInstruction.accounts[4];
      const poolAddress = initInstruction.accounts[0].toBase58();
      if (!isValidPublicKey(tokenMint.toBase58()) || !isValidPublicKey(poolAddress)) {
        console.warn('Invalid tokenMint or poolAddress:', { tokenMint: tokenMint.toBase58(), poolAddress });
        return;
      }

      const tokenMetadata = await getTokenMetadata(tokenMint);
      const poolData = await getPoolData(poolAddress);

      const newPair = {
        id: signature,
        created: formatTimestamp(timestamp),
        token: `${tokenMetadata.name} (${tokenMetadata.symbol})`,
        tokenMint: tokenMetadata.mint,
        liquidity: poolData.liquidity,
        initialLiquidity: poolData.initialLiquidity,
        marketCap: poolData.marketCap,
        txns: poolData.txns,
        volume: poolData.volume,
        auditLink: `https://example.com/audit/${tokenMint.toBase58()}`,
        tradeLink: `https://raydium.io/swap/?inputMint=sol&outputMint=${tokenMint.toBase58()}`,
        viewLink: `https://solscan.io/token/${tokenMint.toBase58()}`,
      };

      setPairs((prev) => {
        if (prev.some((p) => p.id === newPair.id)) {
          console.log('Skipping duplicate pair:', newPair.id);
          return prev;
        }
        console.log('Adding pair:', newPair, 'Current pairs:', prev);
        return [newPair, ...prev].slice(0, 100);
      });
    };

    const fetchInitialPools = async () => {
      try {
        const { data } = await axios.get(LIQUIDITY_API, { timeout: 5000 });
        console.log('Liquidity API data:', data);
        if (!data || (!Array.isArray(data.official) && !Array.isArray(data.unOfficial))) {
          throw new Error('Invalid liquidity API response: missing official or unOfficial arrays');
        }
        const recentPools = [...(data.official || []), ...(data.unOfficial || [])]
          .filter((pool) => pool.id && isValidPublicKey(pool.id))
          .sort((a, b) => (b.createdTimestamp || 0) - (a.createdTimestamp || 0))
          .slice(0, 10);
        console.log('Filtered pools:', recentPools);
        if (recentPools.length === 0) {
          throw new Error('No valid pools found in mock data');
        }
        for (const pool of recentPools) {
          const mockTransaction = {
            transaction: {
              signatures: ['mock-' + pool.id],
              message: {
                instructions: [
                  {
                    programId: RAYDIUM,
                    data: 'initialize2',
                    accounts: [
                      new solanaWeb3.PublicKey(pool.id),
                      {},
                      {},
                      {},
                      new solanaWeb3.PublicKey(pool.baseMint || 'So11111111111111111111111111111111111111112'),
                    ],
                  },
                ],
              },
            },
            meta: { blockTime: pool.createdTimestamp / 1000 || Math.floor(Date.now() / 1000) },
          };
          await addPair(mockTransaction);
        }
      } catch (error) {
        console.error('Error fetching initial pools:', error.message);
      }
    };

    fetchInitialPools();

    return () => {};
  }, []);

  console.log('Rendering pairs:', pairs);

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
            <button className={styles.chainButton}>Solana</button>
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
          {rpcError && <p className={styles.error}>{rpcError}</p>}
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
                    <td>
                      <Link href={`/coin/${pair.tokenMint}`} className={styles.footerLink}>
                        {pair.token}
                      </Link>
                    </td>
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
