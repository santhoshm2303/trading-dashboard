const { google } = require('googleapis');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccount,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = '14s8og9ufXnpHzWCToM0pLfrOZ6w_02Ee84LUm3yFI98';

    const ticker = req.query?.ticker;

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Stock Predictions LookerStudio!A:Z'
    });

    const rows = response.data.values || [];
    if (rows.length === 0) {
      return res.status(200).json({ predictions: [], tickers: [], columnHeaders: [] });
    }

    const headers_row = rows[0];
    const dataRows = rows.slice(1);

    const getIdx = (name) => headers_row.findIndex(h => h && h.toLowerCase().includes(name.toLowerCase()));

    const tickerIdx = getIdx('ticker') >= 0 ? getIdx('ticker') : 0;
    const dateIdx = getIdx('date');
    const predHighIdx = headers_row.findIndex(h => h && h.toLowerCase().includes('pred') && h.toLowerCase().includes('high'));
    const predLowIdx = headers_row.findIndex(h => h && h.toLowerCase().includes('pred') && h.toLowerCase().includes('low'));
    const takeProfitIdx = getIdx('take');
    const stopLossIdx = getIdx('stop');
    const openODEIdx = headers_row.findIndex(h => h && (h.includes('Open ODE') || h.includes('OpenODE')));
    const highODEIdx = headers_row.findIndex(h => h && (h.includes('High ODE') || h.includes('HighODE')));
    const lowODEIdx = headers_row.findIndex(h => h && (h.includes('Low ODE') || h.includes('LowODE')));
    const closeODEIdx = headers_row.findIndex(h => h && (h.includes('Close ODE') || h.includes('CloseODE')));

    const predictions = dataRows
      .map(row => {
        const tickerVal = row[tickerIdx] || '';
        if (!tickerVal) return null;
        if (ticker && tickerVal.toUpperCase() !== ticker.toUpperCase()) return null;
        return {
          ticker: tickerVal,
          date: row[dateIdx] || '',
          predHigh: predHighIdx >= 0 ? parseFloat(row[predHighIdx]) || null : null,
          predLow: predLowIdx >= 0 ? parseFloat(row[predLowIdx]) || null : null,
          takeProfit: takeProfitIdx >= 0 ? parseFloat(row[takeProfitIdx]) || null : null,
          stopLoss: stopLossIdx >= 0 ? parseFloat(row[stopLossIdx]) || null : null,
          openODE: openODEIdx >= 0 ? parseFloat(row[openODEIdx]) || null : null,
          highODE: highODEIdx >= 0 ? parseFloat(row[highODEIdx]) || null : null,
          lowODE: lowODEIdx >= 0 ? parseFloat(row[lowODEIdx]) || null : null,
          closeODE: closeODEIdx >= 0 ? parseFloat(row[closeODEIdx]) || null : null
        };
      })
      .filter(p => p !== null)
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    const uniqueTickers = [...new Set(dataRows.map(r => r[tickerIdx]).filter(Boolean))].sort();

    return res.status(200).json({
      predictions,
      tickers: uniqueTickers,
      columnHeaders: headers_row
    });

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: 'Failed to fetch predictions', details: error.message });
  }
};
