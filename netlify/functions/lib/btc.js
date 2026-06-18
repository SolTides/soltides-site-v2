async function fetchBtcUsd() {
  const sources = [
    { name: "Coinbase", url: "https://api.coinbase.com/v2/prices/BTC-USD/spot", parse: d => Number(d?.data?.amount) },
    { name: "Binance US", url: "https://api.binance.us/api/v3/ticker/price?symbol=BTCUSDT", parse: d => Number(d?.price) },
    { name: "Kraken", url: "https://api.kraken.com/0/public/Ticker?pair=XBTUSD", parse: d => Number(d?.result?.XXBTZUSD?.c?.[0]) }
  ];
  for (const s of sources) {
    try {
      const res = await fetch(s.url, { cache: "no-store" });
      const data = await res.json();
      const price = s.parse(data);
      if (Number.isFinite(price) && price > 0) return price;
    } catch (e) {
      console.warn("BTC source failed", s.name, e.message);
    }
  }
  throw new Error("BTC rate unavailable. Please try again in a minute.");
}

module.exports = { fetchBtcUsd };
