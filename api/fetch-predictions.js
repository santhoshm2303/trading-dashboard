const { google } = require('googleapis');

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccount,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = '14s8og9ufXnpHzWCToM0pLfrOZ6w_02Ee84LUm3yFI98';

    // Get query parameter for ticker filter
    const ticker = event.queryStringParameters?.ticker;

    // Fetch Stock Predictions LookerStudio tab
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Stock Predictions LookerStudio!A:Z'  // Get all columns
    });

    const rows = response.data.values || [];
    if (rows.length === 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ predictions: [], headers: [] })
      };
    }

    const headers_row = rows[0];
    const dataRows = rows.slice(1);
    
    // Find column indices (looking for ODE columns)
    const getColumnIndex = (name) => {
      const idx = headers_row.findIndex(h => h && h.toLowerCase().includes(name.toLowerCase()));
      return idx;
    };

    const tickerIdx = getColumnIndex('ticker') >= 0 ? getColumnIndex('ticker') : 0;
    const dateIdx = getColumnIndex('date');
    const predHighIdx = getColumnIndex('pred') >= 0 ? headers_row.findIndex(h => h && h.toLowerCase().includes('pred') && h.toLowerCase().includes('high')) : -1;
    const predLowIdx = getColumnIndex('pred') >= 0 ? headers_row.findIndex(h => h && h.toLowerCase().includes('pred') && h.toLowerCase().includes('low')) : -1;
    const takeProfitIdx = getColumnIndex('take') >= 0 ? getColumnIndex('take') : -1;
    const stopLossIdx = getColumnIndex('stop') >= 0 ? getColumnIndex('stop') : -1;
    
    // ODE columns (overnight/extended hours)
    const openODEIdx = headers_row.findIndex(h => h && (h.includes('Open ODE') || h.includes('OpenODE')));
    const highODEIdx = headers_row.findIndex(h => h && (h.includes('High ODE') || h.includes('HighODE')));
    const lowODEIdx = headers_row.findIndex(h => h && (h.includes('Low ODE') || h.includes('LowODE')));
    const closeODEIdx = headers_row.findIndex(h => h && (h.includes('Close ODE') || h.includes('CloseODE')));

    // Parse and structure the data
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

    // Get unique tickers
    const uniqueTickers = [...new Set(dataRows.map(r => r[tickerIdx]).filter(Boolean))].sort();

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        predictions,
        tickers: uniqueTickers,
        columnHeaders: headers_row
      })
    };

  } catch (error) {
    console.error('Error fetching predictions:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to fetch predictions', details: error.message })
    };
  }
};
