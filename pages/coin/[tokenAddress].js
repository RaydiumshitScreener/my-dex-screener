import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import styles from '../../styles/Home.module.css';

export default function CoinPage() {
  const router = useRouter();
  const { tokenAddress } = router.query;
  const [coinData, setCoinData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tokenAddress) return;

    async function fetchCoinData() {
      try {
        setLoading(true);
        // Mock data as fallback (replace with Birdeye API when you have a key)
        const mockData = {
          name: 'Unknown Token',
          symbol: 'TKN',
          price: 0,
          priceChange24h: 0,
          marketCap: 0,
          liquidity: 0,
          volume24h: 0,
          address: tokenAddress,
        };

        // Uncomment to use Birdeye API with a valid key
        /*
        const response = await fetch(
          `https://public-api.birdeye.so/defi/token_overview?address=${tokenAddress}`,
          {
            headers: {
              'X-API-KEY': 'YOUR_BIRDEYE_API_KEY', // Replace with your API key
            },
          }
        );
        const data = await response.json();
        const priceResponse = await fetch(
          `https://public-api.birdeye.so/defi/price?address=${tokenAddress}`,
          {
            headers: {
              'X-API-KEY': 'YOUR_BIRDEYE_API_KEY',
            },
          }
        );
        const priceData = await priceResponse.json();

        setCoinData({
          name: data.data?.name || 'Unknown',
          symbol: data.data?.symbol || 'N/A',
          price: priceData.data?.value || 0,
          priceChange24h: priceData.data?.priceChange?.['24h'] || 0,
          marketCap: priceData.data?.mc || 0,
          liquidity: data.data?.liquidity || 0,
          volume24h: data.data?.v24hUSD || 0,
          address: tokenAddress,
        });
        */
        setCoinData(mockData); // Use mock data for now
        setLoading(false);
      } catch (error) {
        console.error('Error fetching coin data:', error);
        setLoading(false);
      }
    }

    fetchCoinData();
  }, [tokenAddress]);

  const handleBuy = () => {
    router.push({
      pathname: '/',
      query: { selectedToken: coinData?.address, tokenName: coinData?.symbol },
    });
  };

  if (loading) return <div className={styles.container}><p>Loading...</p></div>;
  if (!coinData) return <div className={styles.container}><p>Coin not found</p></div>;

  return (
    <div className={styles.pageWrapper}>
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
          <h1>{coinData.name} ({coinData.symbol})</h1>
          <div className={styles.balanceInfo}>
            <p>Price: ${coinData.price.toFixed(6)}</p>
            <p>24h Change: <span className={coinData.priceChange24h >= 0 ? styles.priceChange : `${styles.priceChange} ${styles.negative}`}>{coinData.priceChange24h.toFixed(2)}%</span></p>
            <p>Market Cap: ${coinData.marketCap.toLocaleString()}</p>
            <p>Liquidity: ${coinData.liquidity.toLocaleString()}</p>
            <p>24h Volume: ${coinData.volume24h.toLocaleString()}</p>
          </div>
          <button className={styles.button} onClick={handleBuy}>
            Buy {coinData.symbol}
          </button>
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
}
