const { google } = require('googleapis');

exports.handler = async (event) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const transaction = JSON.parse(event.body);
    
    // Validate required fields
    const required = ['code', 'index', 'type', 'volume', 'price', 'fee', 'broker', 'buyersName'];
    for (const field of required) {
      if (!transaction[field] && transaction[field] !== 0) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: `Missing required field: ${field}` })
        };
      }
    }

    // Auth with service account
    const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccount,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = '14s8og9ufXnpHzWCToM0pLfrOZ6w_02Ee84LUm3yFI98';

    // Get current timestamp
    const now = new Date();
    const timestamp = now.toLocaleString('en-AU', { 
      timeZone: 'Australia/Perth',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });

    // If this is a BUY, just add with Column O = "Yes"
    if (transaction.type === 'buy') {
      const rowData = [
        timestamp,                                        // A: Timestamp
        'Buy',                                            // B: Transaction Type
        transaction.index,                                // C: Index
        transaction.code,                                 // D: Code
        transaction.index === 'ASX' ? 'AUD' : 'USD',     // E: Currency
        transaction.price,                                // F: Price
        transaction.broker,                               // G: Broker
        transaction.volume,                               // H: Volume
        transaction.fee,                                  // I: Fees
        transaction.buyersName,                           // J: Buyers Name
        transaction.notes || '',                          // K: Note
        '',                                               // L: (empty)
        '',                                               // M: (empty)
        '',                                               // N: (empty)
        'Yes'                                             // O: Active (Yes for buy)
      ];

      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: 'Form_Responses!A:O',
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        resource: { values: [rowData] }
      });

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, message: 'Buy transaction added successfully' })
      };
    }

    // If this is a SELL, we need to apply FIFO logic
    if (transaction.type === 'sell') {
      // First, read all existing transactions for this stock
      const readResponse = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'Form_Responses!A:O'
      });

      const rows = readResponse.data.values || [];
      if (rows.length < 2) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'No existing transactions found' })
        };
      }

      const headerRow = rows[0];
      const dataRows = rows.slice(1);

      // Find column indices
      const typeIdx = headerRow.findIndex(h => h === 'Transaction Type');
      const codeIdx = headerRow.findIndex(h => h === 'Code');
      const volumeIdx = headerRow.findIndex(h => h === 'Volume');
      const activeIdx = headerRow.findIndex(h => h.includes('O') || h === 'Active') || 14; // Column O is index 14

      // Get all BUY transactions for this stock that are still active (Column O = "Yes")
      const buyTransactions = [];
      dataRows.forEach((row, idx) => {
        if (row[codeIdx] === transaction.code && 
            row[typeIdx] === 'Buy' && 
            (row[activeIdx] === 'Yes' || row[activeIdx] === '')) {
          buyTransactions.push({
            rowIndex: idx + 2, // +2 because of header and 0-indexing
            volume: parseFloat(row[volumeIdx]) || 0,
            activeStatus: row[activeIdx]
          });
        }
      });

      if (buyTransactions.length === 0) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'No active buy transactions found for this stock (FIFO)' })
        };
      }

      // Apply FIFO: Mark buys as "No" until we've covered the sell volume
      let remainingSellVolume = parseFloat(transaction.volume);
      const updatesToMake = [];

      for (const buy of buyTransactions) {
        if (remainingSellVolume <= 0) break;

        if (remainingSellVolume >= buy.volume) {
          // This entire buy is sold
          updatesToMake.push({
            range: `Form_Responses!O${buy.rowIndex}`,
            values: [['No']]
          });
          remainingSellVolume -= buy.volume;
        } else {
          // Only part of this buy is sold - we don't mark it as No
          // (You'd need to split the transaction, but for simplicity we'll leave it as Yes)
          remainingSellVolume = 0;
        }
      }

      // Apply all updates
      if (updatesToMake.length > 0) {
        await sheets.spreadsheets.values.batchUpdate({
          spreadsheetId,
          resource: {
            valueInputOption: 'USER_ENTERED',
            data: updatesToMake
          }
        });
      }

      // Now add the SELL transaction (Column O is blank or "N/A" for sells)
      const sellRowData = [
        timestamp,                                        // A: Timestamp
        'Sell',                                           // B: Transaction Type
        transaction.index,                                // C: Index
        transaction.code,                                 // D: Code
        transaction.index === 'ASX' ? 'AUD' : 'USD',     // E: Currency
        transaction.price,                                // F: Price
        transaction.broker,                               // G: Broker
        transaction.volume,                               // H: Volume
        transaction.fee,                                  // I: Fees
        transaction.buyersName,                           // J: Buyers Name
        transaction.notes || '',                          // K: Note
        '',                                               // L: (empty)
        '',                                               // M: (empty)
        '',                                               // N: (empty)
        ''                                                // O: Active (blank for sell)
      ];

      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: 'Form_Responses!A:O',
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        resource: { values: [sellRowData] }
      });

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: `Sell transaction added. ${updatesToMake.length} buy transaction(s) marked as sold (FIFO).`
        })
      };
    }

    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Invalid transaction type' })
    };

  } catch (error) {
    console.error('Error adding transaction:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to add transaction',
        details: error.message
      })
    };
  }
};
