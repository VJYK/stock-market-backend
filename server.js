const WebSocket = require('ws');
const axios = require('axios');

const PORT = 8080;
const FINNHUB_API_KEY = 'd78k68hr01qp0fl5grhgd78k68hr01qp0fl5gri0';

// Stock symbols
const STOCKS = [
  { symbol: 'AAPL', name: 'Apple' },
  { symbol: 'GOOGL', name: 'Alphabet ' },
  { symbol: 'MSFT', name: 'Microsoft' },
  { symbol: 'TSLA', name: 'Tesla' },
];

// Axios instance (clean + reusable)
const api = axios.create({
  baseURL: 'https://finnhub.io/api/v1',
  timeout: 5000,
});


// Mock data (fallback)

const mockData = {
  AAPL: { c: 189.5, h: 191.2, l: 188.0, h52: 199.6, l52: 124.17, name: 'Apple' },
  GOOGL: { c: 141.8, h: 143.5, l: 140.1, h52: 153.78, l52: 102.21, name: 'Alphabet' },
  MSFT: { c: 378.9, h: 381.0, l: 376.4, h52: 420.82, l52: 309.45, name: 'Microsoft' },
  TSLA: { c: 248.5, h: 252.0, l: 245.0, h52: 299.29, l52: 138.8, name: 'Tesla' },
};


// API Calls using Axios
async function fetchQuote(symbol) {
  const res = await api.get('/quote', {
    params: { symbol, token: FINNHUB_API_KEY },
  });
  return res.data;
}

async function fetchProfile(symbol) {
  const res = await api.get('/stock/profile2', {
    params: { symbol, token: FINNHUB_API_KEY },
  });
  return res.data;
}

// Build payload
async function buildPayload(stock, useMock) {
  try {
    if (useMock) {
      const m = mockData[stock.symbol];

      const change = (Math.random() - 0.48) * 1.5;
      m.c = parseFloat((m.c + change).toFixed(2));
      m.h = Math.max(m.h, m.c);
      m.l = Math.min(m.l, m.c);

      return {
        symbol: stock.symbol,
        name: m.name,
        currentPrice: m.c,
        dailyHigh: m.h,
        dailyLow: m.l,
        weekHigh52: m.h52,
        weekLow52: m.l52,
        timestamp: Date.now(),
      };
    }
    
    const [quote, profile] = await Promise.all([
      fetchQuote(stock.symbol),
      fetchProfile(stock.symbol),
    ]);

    return {
      symbol: stock.symbol,
      name: profile.name || stock.name,
      currentPrice: quote.c,
      dailyHigh: quote.h,
      dailyLow: quote.l,
      weekHigh52: quote['52WeekHigh'] ?? null,
      weekLow52: quote['52WeekLow'] ?? null,
      timestamp: Date.now(),
    };

  } catch (err) {
    console.error(`Error for ${stock.symbol}:`, err.message);

    const m = mockData[stock.symbol];
    return {
      symbol: stock.symbol,
      name: m.name,
      currentPrice: m.c,
      dailyHigh: m.h,
      dailyLow: m.l,
      weekHigh52: m.h52,
      weekLow52: m.l52,
      timestamp: Date.now(),
    };
  }
}

// WebSocket Server
const wss = new WebSocket.Server({ port: PORT });
const useMock = !FINNHUB_API_KEY || FINNHUB_API_KEY === 'd78k68hr01qp0fl5grhgd78k68hr01qp0fl5gri0';

wss.on('connection', (ws) => {
  console.log('Client connected');

  let intervalId;

  const sendPrices = async () => {
    if (ws.readyState !== WebSocket.OPEN) return;

    try {
      const payloads = await Promise.all(
        STOCKS.map((stock) => buildPayload(stock, useMock))
      );

      ws.send(
        JSON.stringify({
          type: 'PRICE_UPDATE',
          data: payloads,
        })
      );
    } catch (err) {
      console.error('Broadcast error:', err.message);
    }
  };

  // Send immediately
  sendPrices();

  // Send every 5 seconds
  intervalId = setInterval(sendPrices, 5000);

  ws.on('close', () => {
    console.log('Client disconnected');
    clearInterval(intervalId);
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err.message);
    clearInterval(intervalId);
  });
});