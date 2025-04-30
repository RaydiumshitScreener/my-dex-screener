import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import Script from 'next/script';
import { useState } from 'react';
import styles from '../../styles/Home.module.css';

const TokenPage = () => {
  const router = useRouter();
  const { tokenAddress } = router.query;
  const [amount, setAmount] = useState('');
  const [walletConnected, setWalletConnected] = useState(false);
  const [swapStatus, setSwapStatus] = useState('');

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

  const connectWallet = async () => {
    try {
      const { solana } = window;
      if (solana && solana.isPhantom) {
        await solana.connect();
        setWalletConnected(true);
        setSwapStatus('Wallet connected');
      } else {
        setSwapStatus('Phantom wallet not found. Please install Phantom.');
      }
    } catch (error) {
      console.error('Wallet connection failed:', error);
      setSwapStatus('Failed to connect wallet');
    }
  };

  const handleSwap = async (e) => {
    e.preventDefault();
    if (!walletConnected) {
      setSwapStatus('Please connect wallet first');
      return;
    }
    if (!amount || isNaN(amount) || amount <= 0) {
      setSwapStatus('Enter a valid amount');
      return;
    }

    try {
      setSwapStatus(`Mock swap: ${amount} SOL for ${token.symbol}`);
      console.log('Swap details:', {
        tokenMint: tokenAddress,
        amount: amount,
        commissionWallet: 'FohW4KYMUv2VpwaB3H4SMZcew32mAL9cpDbqqexskmPu',
        commissionRate: 0.005,
      });
    } catch (error) {
      console.error('Swap failed:', error);
      setSwapStatus('Swap failed. Try again.');
    }
  };

  return (
    <div className={styles.pageWrapper}>
      <Head>
        <title>{token.name} - Bitlyx Sol</title>
        <meta name="description" content={`Details for ${token.name} on Raydium DEX`} />
      </Head>
      <Script
        src="https://s3.tradingview.com/tv.js"
        strategy="afterInteractive"
        onLoad={() => {
          new TradingView.widget({
            container_id: 'tradingview_chart',
            width: '100%',
            height: '100%',
            symbol: token.symbol === 'SOL' ? 'SOLUSD' : 'ATLASUSD',
            interval: 'D',
            timezone: 'Etc/UTC',
            theme: 'dark',
            style: '1',
            locale: 'en',
            toolbar_bg: '#f1f3f6',
            enable_publishing: false,
            allow_symbol_change: false,
            studies: ['MACD@tv-basicstudies'],
            show_popup_button: true,
            popup_width: '1000',
            popup_height: '650',
          });
        }}
      />
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
          <button
            className={styles.connectButton}
            onClick={connectWallet}
            disabled={walletConnected}
          >
            {walletConnected ? 'Wallet Connected' : 'Connect Wallet'}
          </button>
        </div>
      </header>
      <main className={styles.container}>
        <div className={styles.swapBox}>
          <h1>{token.name} ({token.symbol})</h1>
          <div id="tradingview_chart" style={{ height: '400px', marginBottom: '20px' }}></div>
          <p>Price: ${token.price.toFixed(6)}</p>
          <p>24h Change: {token.change24h.toFixed(2)}%</p>
          <p>Market Cap: ${token.marketCap.toLocaleString()}</p>
          <p>Liquidity: ${token.liquidity.toLocaleString()}</p>
          <p>24h Volume: ${token.volume.toLocaleString()}</p>
          <div className={styles.swapForm}>
            <h2>Trade {token.symbol}</h2>
            <form onSubmit={handleSwap}>
              <label>
                Amount (SOL):
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Enter SOL amount"
                  className={styles.input}
                  step="0.01"
                  min="0"
                />
              </label>
              <button type="submit" className={styles.button} disabled={!walletConnected}>
                Swap for {token.symbol}
              </button>
            </form>
            {swapStatus && <p className={styles.status}>{swapStatus}</p>}
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

export default TokenPage;
