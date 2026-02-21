// Technical Analysis Functions
function calculateRSI(prices, period = 14) {
  if (prices.length < period + 1) return null;
  
  let gains = 0, losses = 0;
  for (let i = prices.length - period; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }
  
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function calculateEMA(prices, period) {
  if (prices.length < period) return null;
  
  const k = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b) / period;
  
  for (let i = period; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }
  return ema;
}

function calculateMACD(prices) {
  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);
  if (!ema12 || !ema26) return null;
  
  const macd = ema12 - ema26;
  
  // Calculate signal line (9-day EMA of MACD)
  const macdLine = [];
  for (let i = 26; i < prices.length; i++) {
    const slice = prices.slice(0, i + 1);
    const e12 = calculateEMA(slice, 12);
    const e26 = calculateEMA(slice, 26);
    if (e12 && e26) macdLine.push(e12 - e26);
  }
  const signal = calculateEMA(macdLine, 9);
  
  return { macd, signal, histogram: signal ? macd - signal : 0 };
}

function fetchYahooData(ticker) {
  return new Promise(async (resolve, reject) => {
    const period1 = Math.floor(Date.now() / 1000) - (90 * 24 * 60 * 60); // 90 days ago
    const period2 = Math.floor(Date.now() / 1000);
    
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?period1=${period1}&period2=${period2}&interval=1d`;
    
    try {
      const response = await fetch(url);
      const json = await response.json();
      
      if (json.chart?.result?.[0]) {
        const result = json.chart.result[0];
        const quote = result.indicators.quote[0];
        resolve({
          ticker,
          timestamps: result.timestamp,
          close: quote.close.filter(v => v !== null),
          volume: quote.volume.filter(v => v !== null),
          high: quote.high.filter(v => v !== null),
          low: quote.low.filter(v => v !== null),
          currentPrice: quote.close.filter(v => v !== null).slice(-1)[0]
        });
      } else {
        reject(new Error(`No data for ${ticker}`));
      }
    } catch (error) {
      reject(error);
    }
  });
}

function analyzeStock(data) {
  const { ticker, close, volume, currentPrice } = data;
  
  if (close.length < 30) {
    return { ticker, error: 'Insufficient data', score: 0 };
  }
  
  // Calculate indicators
  const rsi = calculateRSI(close);
  const macd = calculateMACD(close);
  const ema20 = calculateEMA(close, Math.min(20, close.length - 5));
  const ema50 = calculateEMA(close, Math.min(50, close.length - 5));
  
  // Volume analysis
  const avgVolume = volume.slice(-20).reduce((a, b) => a + b) / 20;
  const currentVolume = volume[volume.length - 1];
  const volumeRatio = currentVolume / avgVolume;
  
  // Scoring system (0-100)
  let score = 0;
  
  // RSI Score (0-20 points): Sweet spot 50-65
  if (rsi) {
    if (rsi >= 50 && rsi <= 65) score += 20;
    else if (rsi >= 45 && rsi < 50) score += 15;
    else if (rsi > 65 && rsi <= 70) score += 15;
    else if (rsi >= 40 && rsi < 45) score += 10;
    else if (rsi > 70 && rsi <= 80) score += 10;
    else if (rsi < 40) score += 5; // Oversold - some value
  }
  
  // MACD Score (0-25 points)
  if (macd) {
    if (macd.histogram > 0) score += 25; // Bullish
    else if (macd.histogram > -0.5) score += 15; // Slightly bearish
    else score += 5; // Bearish
  }
  
  // EMA 20 Score (0-20 points)
  if (ema20) {
    if (currentPrice > ema20 * 1.02) score += 20; // Above by 2%+
    else if (currentPrice > ema20) score += 15; // Above
    else if (currentPrice > ema20 * 0.98) score += 10; // Close
    else score += 5; // Below
  }
  
  // EMA 50 Score (0-20 points)
  if (ema50) {
    if (currentPrice > ema50 * 1.05) score += 20; // Above by 5%+
    else if (currentPrice > ema50) score += 15; // Above
    else if (currentPrice > ema50 * 0.95) score += 10; // Close
    else score += 5; // Below
  }
  
  // Volume Score (0-15 points)
  if (volumeRatio > 1.5) score += 15; // High volume
  else if (volumeRatio > 1.2) score += 12;
  else if (volumeRatio > 1.0) score += 8;
  else score += 5; // Low volume
  
  // Trend Signal
  let trendSignal = 'neutral';
  let trendEmoji = '🟡';
  if (score >= 75) { trendSignal = 'strong'; trendEmoji = '🟢'; }
  else if (score >= 60) { trendSignal = 'moderate'; trendEmoji = '🟢'; }
  else if (score >= 45) { trendSignal = 'weak'; trendEmoji = '🟡'; }
  else { trendSignal = 'down'; trendEmoji = '🔴'; }
  
  // Price change
  const priceChange = close.length >= 2 
    ? ((close[close.length - 1] - close[close.length - 2]) / close[close.length - 2]) * 100
    : 0;
  
  // Recent prices for sparkline (last 30 days)
  const sparkline = close.slice(-30);
  
  return {
    ticker,
    score: Math.round(score),
    currentPrice: currentPrice.toFixed(2),
    priceChange: priceChange.toFixed(2),
    indicators: {
      rsi: rsi ? rsi.toFixed(1) : null,
      macd: macd ? {
        value: macd.macd.toFixed(2),
        signal: macd.signal.toFixed(2),
        histogram: macd.histogram.toFixed(2),
        bullish: macd.histogram > 0
      } : null,
      ema20: ema20 ? ema20.toFixed(2) : null,
      ema50: ema50 ? ema50.toFixed(2) : null,
      volumeRatio: volumeRatio.toFixed(2),
      aboveEma20: ema20 ? currentPrice > ema20 : false,
      aboveEma50: ema50 ? currentPrice > ema50 : false
    },
    trendSignal,
    trendEmoji,
    sparkline
  };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { tickers } = req.body;
    
    if (!tickers || !Array.isArray(tickers) || tickers.length === 0) {
      return res.status(400).json({ error: 'Please provide tickers array' });
    }

    // Fetch data with delays to avoid rate limiting
    const results = [];
    for (const ticker of tickers) {
      try {
        const data = await fetchYahooData(ticker);
        const analysis = analyzeStock(data);
        results.push(analysis);
        // Wait 1.5 seconds between requests to avoid rate limiting
        if (tickers.indexOf(ticker) < tickers.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
      } catch (err) {
        console.error(`Error fetching ${ticker}:`, err.message);
        results.push({ ticker, error: err.message, score: 0 });
        // Still wait even on error to avoid hammering the API
        if (tickers.indexOf(ticker) < tickers.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
      }
    }
    
    // Sort by score (highest first)
    const ranked = results
      .filter(r => !r.error)
      .sort((a, b) => b.score - a.score);

    const errors = results.filter(r => r.error);

    return res.status(200).json({
      success: true,
      scannedAt: new Date().toISOString(),
      ranked,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error('Scanner error:', error);
    return res.status(500).json({
      error: 'Failed to scan stocks',
      details: error.message
    });
  }
};
