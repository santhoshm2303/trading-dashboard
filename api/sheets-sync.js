const { google } = require('googleapis');

const SHEET_ID = "14s8og9ufXnpHzWCToM0pLfrOZ6w_02Ee84LUm3yFI98";
const TAB_NAME = "Form_Responses";

const getAuth = () => {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${TAB_NAME}!A:Z`,
    });

    const rows = response.data.values || [];

    if (rows.length === 0) {
      return res.status(200).json({ transactions: [] });
    }

    const headerRow = rows[0];
    const transactions = rows.slice(1).map((row, idx) => {
      const txn = {};
      headerRow.forEach((header, colIdx) => {
        txn[header] = row[colIdx] || '';
      });

      txn.id = idx + 2;

      if (txn['Transaction Type'] === 'Cash Balance' || txn['Transaction Type'] === 'Cash In') {
        txn.type = 'deposit';
        txn.amount = txn['Cashflow'];
      } else if (txn['Transaction Type'] === 'Buy') {
        txn.type = 'buy';
        txn.code = txn['Code'];
        txn.volume = txn['Volume'];
        txn.price = txn['Price'];
        txn.fee = txn['Fees'];
        txn.broker = txn['Broker'];
        txn.buyerName = txn['Buyers Name'];
        txn.date = txn['Timestamp'];
        txn.index = txn['Index'];
        txn.currency = txn['Currency'];
      } else if (txn['Transaction Type'] === 'Sell') {
        txn.type = 'sell';
        txn.code = txn['Code'];
        txn.volume = txn['Volume'];
        txn.price = txn['Price'];
        txn.fee = txn['Fees'];
        txn.broker = txn['Broker'];
        txn.sellerName = txn['Buyers Name'];
        txn.date = txn['Timestamp'];
        txn.index = txn['Index'];
        txn.currency = txn['Currency'];
      }

      return txn;
    });

    return res.status(200).json({ transactions });

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({
      error: 'Failed to sync with Google Sheets',
      details: error.message
    });
  }
};
