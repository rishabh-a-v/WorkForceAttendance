const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const HEADERS = {
  Employees: [
    'id', 'name', 'designation', 'department', 'mobile', 'joinDate', 'status', 'role', 'password', 'registeredPhotos', 'biometrics'
  ],
  Attendance: [
    'id', 'employeeId', 'employeeName', 'checkInTime', 'checkOutTime', 'latitude', 'longitude', 'confidence', 'qualityScore', 'livenessScore', 'similarityScore', 'verificationStatus', 'attendanceStatus', 'originalPhotoUrl', 'croppedFaceUrl'
  ],
  AuditLogs: [
    'id', 'actionType', 'user', 'timestamp', 'oldValue', 'newValue', 'ipAddress', 'deviceInfo', 'remarks'
  ]
};

let sheetsClient = null;
let spreadsheetId = null;
let isConfigured = false;
let sheetIds = {}; // sheetName -> sheetId

async function initGoogleSheets() {
  try {
    spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
    if (!spreadsheetId) {
      console.log('[Google Sheets] GOOGLE_SPREADSHEET_ID is missing. Running in local JSON fallback mode.');
      isConfigured = false;
      return false;
    }

    let auth = null;
    const scopes = [
      'https://www.googleapis.com/auth/spreadsheets'
    ];
    
    // Check 1: Env variables (ideal for hosting providers like Render)
    if (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
      const privateKey = process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n');
      auth = new google.auth.JWT(
        process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        null,
        privateKey,
        scopes
      );
    } else {
      // Check 2: local key credentials file
      const credentialsPath = path.join(__dirname, 'google-credentials.json');
      const fallbackPath = path.join(__dirname, 'credentials.json');
      let finalPath = null;
      
      if (fs.existsSync(credentialsPath)) {
        finalPath = credentialsPath;
      } else if (fs.existsSync(fallbackPath)) {
        finalPath = fallbackPath;
      }

      if (finalPath) {
        auth = new google.auth.GoogleAuth({
          keyFile: finalPath,
          scopes: scopes,
        });
      }
    }

    if (!auth) {
      console.log('[Google Sheets] Google auth credentials are not set. Running in local JSON fallback mode.');
      isConfigured = false;
      return false;
    }

    sheetsClient = google.sheets({ version: 'v4', auth });
    
    await initializeWorksheets();
    isConfigured = true;
    console.log('[Google Sheets] Connection established successfully.');
    return true;
  } catch (error) {
    console.error('[Google Sheets] Connection failed:', error.message);
    isConfigured = false;
    return false;
  }
}

async function initializeWorksheets() {
  const meta = await sheetsClient.spreadsheets.get({ spreadsheetId });
  const existingSheets = meta.data.sheets || [];
  
  // Cache sheet IDs
  sheetIds = {};
  existingSheets.forEach(s => {
    sheetIds[s.properties.title] = s.properties.sheetId;
  });

  for (const [title, headers] of Object.entries(HEADERS)) {
    if (sheetIds[title] === undefined) {
      // Create worksheet
      const res = await sheetsClient.spreadsheets.batchUpdate({
        spreadsheetId,
        resource: {
          requests: [{
            addSheet: {
              properties: { title }
            }
          }]
        }
      });
      const newSheetId = res.data.replies[0].addSheet.properties.sheetId;
      sheetIds[title] = newSheetId;
      
      // Write header row
      await sheetsClient.spreadsheets.values.update({
        spreadsheetId,
        range: `${title}!A1`,
        valueInputOption: 'RAW',
        resource: { values: [headers] }
      });
      console.log(`[Google Sheets] Created worksheet "${title}" with headers.`);
    } else {
      // Worksheet already exists, let's verify headers and append missing ones (e.g. photo columns)
      const res = await sheetsClient.spreadsheets.values.get({
        spreadsheetId,
        range: `${title}!1:1`
      });
      const currentHeaders = res.data.values ? res.data.values[0] : [];
      
      if (currentHeaders.length < headers.length) {
        // Update header row to ensure columns match new specification (non-destructive)
        await sheetsClient.spreadsheets.values.update({
          spreadsheetId,
          range: `${title}!A1`,
          valueInputOption: 'RAW',
          resource: { values: [headers] }
        });
        console.log(`[Google Sheets] Updated worksheet "${title}" headers.`);
      }
    }
  }
}

async function readSheetData(sheetName) {
  if (!isConfigured) return [];
  const headers = HEADERS[sheetName];
  try {
    const res = await sheetsClient.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A2:Z`
    });
    const rows = res.data.values || [];
    return rows.map(row => {
      const obj = {};
      headers.forEach((header, index) => {
        let val = row[index] !== undefined ? row[index] : null;
        if (val !== null && val !== "") {
          if (header === 'registeredPhotos' || header === 'biometrics' || header === 'samples') {
            try {
              val = JSON.parse(val);
            } catch {
              // Keep original string if parsing failed
            }
          } else if (
            header === 'latitude' || 
            header === 'longitude' || 
            header === 'confidence' || 
            header === 'qualityScore' || 
            header === 'livenessScore' || 
            header === 'similarityScore'
          ) {
            val = Number(val);
          }
        } else if (val === "") {
          val = null;
        }
        obj[header] = val;
      });
      return obj;
    });
  } catch (error) {
    console.error(`[Google Sheets] Error reading from ${sheetName}:`, error.message);
    return [];
  }
}

async function appendRow(sheetName, data) {
  if (!isConfigured) return false;
  const headers = HEADERS[sheetName];
  try {
    const rowValues = headers.map(header => {
      const val = data[header];
      if (typeof val === 'object' && val !== null) {
        return JSON.stringify(val);
      }
      return val !== undefined && val !== null ? val : "";
    });

    await sheetsClient.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A:A`,
      valueInputOption: 'RAW',
      resource: { values: [rowValues] }
    });
    return true;
  } catch (error) {
    console.error(`[Google Sheets] Error appending row to ${sheetName}:`, error.message);
    return false;
  }
}

async function updateRow(sheetName, id, updatedFields) {
  if (!isConfigured) return false;
  const headers = HEADERS[sheetName];
  try {
    const res = await sheetsClient.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A2:Z`
    });
    const rows = res.data.values || [];
    const rowIndex = rows.findIndex(row => row[0] && row[0].toString().trim().toLowerCase() === id.toString().trim().toLowerCase());
    if (rowIndex === -1) {
      console.warn(`[Google Sheets] Update rejected: ID ${id} not found in ${sheetName}`);
      return false;
    }

    const matchedRow = rows[rowIndex];
    const sheetRowNumber = rowIndex + 2;

    const recordObj = {};
    headers.forEach((header, index) => {
      let val = matchedRow[index] !== undefined ? matchedRow[index] : "";
      if (val && (header === 'registeredPhotos' || header === 'biometrics' || header === 'samples')) {
        try {
          val = JSON.parse(val);
        } catch {
          // ignore
        }
      }
      recordObj[header] = val;
    });

    const finalRecord = { ...recordObj, ...updatedFields };

    const finalValues = headers.map(header => {
      const val = finalRecord[header];
      if (typeof val === 'object' && val !== null) {
        return JSON.stringify(val);
      }
      return val !== undefined && val !== null ? val : "";
    });

    await sheetsClient.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A${sheetRowNumber}:${sheetRowNumber}`,
      valueInputOption: 'RAW',
      resource: { values: [finalValues] }
    });
    return true;
  } catch (error) {
    console.error(`[Google Sheets] Error updating row in ${sheetName}:`, error.message);
    return false;
  }
}

async function deleteRow(sheetName, id) {
  if (!isConfigured) return false;
  try {
    const res = await sheetsClient.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A2:A`
    });
    const rows = res.data.values || [];
    const rowIndex = rows.findIndex(row => row[0] && row[0].toString().trim().toLowerCase() === id.toString().trim().toLowerCase());
    if (rowIndex === -1) return false;

    const sheetId = sheetIds[sheetName];
    const targetRowIndex = rowIndex + 1; // 0-based spreadsheet index where row 2 is index 1

    await sheetsClient.spreadsheets.batchUpdate({
      spreadsheetId,
      resource: {
        requests: [{
          deleteDimension: {
            range: {
              sheetId,
              dimension: 'ROWS',
              startIndex: targetRowIndex,
              endIndex: targetRowIndex + 1
            }
          }
        }]
      }
    });
    return true;
  } catch (error) {
    console.error(`[Google Sheets] Error deleting row from ${sheetName}:`, error.message);
    return false;
  }
}

module.exports = {
  initGoogleSheets,
  isConfigured: () => isConfigured,
  getEmployees: () => readSheetData('Employees'),
  saveEmployee: (emp) => appendRow('Employees', emp),
  updateEmployee: (id, fields) => updateRow('Employees', id, fields),
  deleteEmployee: (id) => deleteRow('Employees', id),
  getAttendance: () => readSheetData('Attendance'),
  saveAttendance: (rec) => appendRow('Attendance', rec),
  updateAttendance: (id, fields) => updateRow('Attendance', id, fields),
  deleteAttendance: (id) => deleteRow('Attendance', id),
  getAuditLogs: () => readSheetData('AuditLogs'),
  saveAuditLog: (log) => appendRow('AuditLogs', log)
};
