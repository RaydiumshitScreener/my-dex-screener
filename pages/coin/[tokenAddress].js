import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import styles from '../../styles/Home.module.css';

const TokenPage = () => {
  const router = useRouter();
  const { tokenAddress } = router.query;

  const mockTokens = {
    'So11111111111111111111111111111111111111112': {
      name: 'Wrapped SOL',
      symbol: 'SOL',
      price: 0.1,
      marketCap: 5000000,
      liquidity: 1000000,
      volume: 200000,
      change24h: 5.0,
    },
    '7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1Y7ARj': {
      name: 'StarAtlas',
      symbol: 'ATLAS',
      price: 0.05,
      marketCap: 3000000,
      liquidity: 750000,
      volume: 150000,
      change24h: 3.0,
    },
  };

  const token = mockTokens[tokenAddress] || {
    name: 'Unknown Token',
    symbol: 'TKN',
    price: 0,
    marketCap: 0,
    liquidity: 0,
    volume: 0,
    change24h: 0,
  };

  return (
    <div className={styles.pageWrapper}>
      <Head>
        <title>{token.name} - Bitlyx Sol</title>
        <meta name="description" content={`Details for ${token.name} on Raydium DEX`} />
      </Head>
      <header className={styles.header}>
        <div className={styles.logo}>Bitlyx Sol</div>
        <nav className={styles.nav}>
          <Link href="/" className={styles.navLink}>Swap</Link>
          <Link href="/new-pairs" className={styles.navLink}>New Pairs</Link>
          <Link href="#" className={styles.navLink}>Limit</Link>
          <Link href="#" className={styles.navLink}>DCA</Link>
          <Link href="#" className={styles.navLink}>Bridge</Link>
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
          <h1>{token.name} ({token.symbol})</h1>
          <p>Price: ${token.price.toFixed(6)}</p>
          <p>24h Change: {token.change24h.toFixed(2)}%</p>
          <p>Market Cap: ${token.marketCap.toLocaleString()}</p>
          <p>Liquidity: ${token.liquidity.toLocaleString()}</p>
          <p>24h Volume: ${token.volume.toLocaleString()}</p>
          <button className={styles.button}>Buy {token.symbol}</button>
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

export default TokenPage;
