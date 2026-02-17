const { google } = require('googleapis');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const transaction = req.body;

    const required = ['code', 'index', 'type', 'volume', 'price', 'fee', 'broker', 'buyersName'];
    for (const field of required) {
      if (!transaction[field] && transaction[field] !== 0) {
        return res.status(400).json({ error: `Missing required field: ${field}` });
      }
    }

    const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccount,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = '14s8og9ufXnpHzWCToM0pLfrOZ6w_02Ee84LUm3yFI98';

    const now = new Date();
    const timestamp = now.toLocaleString('en-AU', {
      timeZone: 'Australia/Perth',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false
    });

    if (transaction.type === 'buy') {
      const rowData = [
        timestamp,
        'Buy',
        transaction.index,
        transaction.code,
        transaction.index === 'ASX' ? 'AUD' : 'USD',
        transaction.price,
        transaction.broker,
        transaction.volume,
        transaction.fee,
        transaction.buyersName,
        transaction.notes || '',
        '', '', '',
        'Yes'
      ];

      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: 'Form_Responses!A:O',
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        resource: { values: [rowData] }
      });

      return res.status(200).json({ success: true, message: 'Buy transaction added successfully' });
    }

    if (transaction.type === 'sell') {
      const readResponse = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'Form_Responses!A:O'
      });

      const rows = readResponse.data.values || [];
      if (rows.length < 2) {
        return res.status(400).json({ error: 'No existing transactions found' });
      }

      const headerRow = rows[0];
      const dataRows = rows.slice(1);

      const typeIdx = headerRow.findIndex(h => h === 'Transaction Type');
      const codeIdx = headerRow.findIndex(h => h === 'Code');
      const volumeIdx = headerRow.findIndex(h => h === 'Volume');
      const activeIdx = 14; // Column O (0-indexed)

      const buyTransactions = [];
      dataRows.forEach((row, idx) => {
        if (row[codeIdx] === transaction.code &&
            row[typeIdx] === 'Buy' &&
            row[activeIdx] === 'Yes') {
          buyTransactions.push({
            rowIndex: idx + 2,
            volume: parseFloat(row[volumeIdx]) || 0
          });
        }
      });

      let remainingSellVolume = parseFloat(transaction.volume);
      const updatesToMake = [];

      for (const buy of buyTransactions) {
        if (remainingSellVolume <= 0) break;
        if (remainingSellVolume >= buy.volume) {
          updatesToMake.push({
            range: `Form_Responses!O${buy.rowIndex}`,
            values: [['No']]
          });
          remainingSellVolume -= buy.volume;
        } else {
          remainingSellVolume = 0;
        }
      }

      if (updatesToMake.length > 0) {
        await sheets.spreadsheets.values.batchUpdate({
          spreadsheetId,
          resource: { valueInputOption: 'USER_ENTERED', data: updatesToMake }
        });
      }

      const sellRowData = [
        timestamp, 'Sell', transaction.index, transaction.code,
        transaction.index === 'ASX' ? 'AUD' : 'USD',
        transaction.price, transaction.broker, transaction.volume,
        transaction.fee, transaction.buyersName, transaction.notes || '',
        '', '', '', ''
      ];

      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: 'Form_Responses!A:O',
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        resource: { values: [sellRowData] }
      });

      return res.status(200).json({
        success: true,
        message: `Sell added. ${updatesToMake.length} buy(s) marked as sold (FIFO).`
      });
    }

    return res.status(400).json({ error: 'Invalid transaction type' });

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: 'Failed to add transaction', details: error.message });
  }
};
