// netlify/functions/sheets-sync.js
const { google } = require('googleapis');

const SHEET_ID = "14s8og9ufXnpHzWCToM0pLfrOZ6w_02Ee84LUm3yFI98";
const TAB_NAME = "Form_Responses";

// Service account credentials from environment variables
const getAuth = () => {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
  
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
};

exports.handler = async (event, context) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };

  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    // GET - Read all transactions
    if (event.httpMethod === 'GET') {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `${TAB_NAME}!A:Z`,
      });

      const rows = response.data.values || [];
      
      if (rows.length === 0) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ transactions: [] }),
        };
      }

      // Parse rows into transaction objects
      const headerRow = rows[0];
      const transactions = rows.slice(1).map((row, idx) => {
        const txn = {};
        headerRow.forEach((header, colIdx) => {
          txn[header] = row[colIdx] || '';
        });
        
        // Add unique ID based on row number
        txn.id = idx + 2; // +2 because of header and 1-indexing
        
        // Determine transaction type
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
          txn.date = txn['Date of Transaction'];
          txn.index = txn['Index'];
          txn.currency = txn['Currency'];
        } else if (txn['Transaction Type'] === 'Sell') {
          txn.type = 'sell';
          txn.code = txn['Code'];
          txn.volume = txn['Volume'];
          txn.price = txn['Price'];
          txn.fee = txn['Fees'];
          txn.broker = txn['Broker'];
          txn.sellerName = txn['Buyers Name']; // Same column
          txn.date = txn['Date of Transaction'];
          txn.index = txn['Index'];
          txn.currency = txn['Currency'];
        }
        
        return txn;
      });

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ transactions }),
      };
    }

    // POST - Write new transaction
    if (event.httpMethod === 'POST') {
      const transaction = JSON.parse(event.body);
      
      // Map transaction to spreadsheet columns
      const row = [
        new Date().toISOString(), // Timestamp
        transaction.type === 'buy' ? 'Buy' : transaction.type === 'sell' ? 'Sell' : 'Cash Balance', // Transaction Type
        transaction.index || '', // Index
        transaction.code || 'Cash', // Code
        transaction.currency || 'AUD', // Currency
        transaction.price || '', // Price
        transaction.broker || '', // Broker
        transaction.volume || '1', // Volume
        transaction.fee || '0', // Fees
        transaction.buyerName || transaction.sellerName || '', // Buyers Name
        transaction.note || '', // Note
        transaction.type === 'deposit' ? transaction.amount : 
          transaction.type === 'buy' ? -(parseFloat(transaction.volume) * parseFloat(transaction.price) + parseFloat(transaction.fee)) :
          (parseFloat(transaction.volume) * parseFloat(transaction.price) - parseFloat(transaction.fee)), // Cashflow
        '', // Shares Remaining (calculated by sheet)
        transaction.date || new Date().toISOString().split('T')[0], // Date of Transaction
        '', // Current Stock (calculated by sheet)
        '', // Current Share Price (calculated by sheet)
        '', // Current_Position_Purchase_Price (calculated by sheet)
        '', // Current_Position_Current_Price (calculated by sheet)
        transaction.currency === 'USD' ? '1.42572' : '1.00000', // Currency Rate
        `${transaction.code}_${Date.now()}`, // Unique ID
      ];

      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: `${TAB_NAME}!A:T`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [row],
        },
      });

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, message: 'Transaction added' }),
      };
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };

  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Failed to sync with Google Sheets',
        details: error.message 
      }),
    };
  }
};
