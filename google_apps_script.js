// Google Apps Script Backend for WorkForce Attendance
// Deploy this as a Web App: Execute as "Me", Access: "Anyone".
const SPREADSHEET_ID = '1tBWz2uM_KDa09n0pOTMri99nfEjhwLpDJWGuGddFtt8'; // Paste your Google Spreadsheet ID here (found in your Google Sheet URL)
const DRIVE_FOLDER_ID = ''; // Paste your Google Drive Folder ID here to save photos to a specific folder, or leave empty to auto-create

const HEADERS = {
  Employees: ['id', 'name', 'designation', 'department', 'mobile', 'joinDate', 'status', 'role', 'password', 'registeredPhotos', 'biometrics'],
  Attendance: ['id', 'employeeId', 'employeeName', 'checkInTime', 'checkOutTime', 'latitude', 'longitude', 'confidence', 'qualityScore', 'livenessScore', 'similarityScore', 'verificationStatus', 'attendanceStatus', 'originalPhotoUrl', 'croppedFaceUrl', 'checkOutLatitude', 'checkOutLongitude'],
  AuditLogs: ['id', 'actionType', 'user', 'timestamp', 'oldValue', 'newValue', 'ipAddress', 'deviceInfo', 'remarks'],
  Config: ['key', 'value']
};

function setup() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  initSheets(ss);
  
  // Explicitly reference DriveApp here to force Google's OAuth permission prompt
  DriveApp.getRootFolder();
  
  Logger.log("Setup completed. All required sheets created successfully.");
}

// Core action handler — shared by both doGet and doPost
function processAction(payload) {
  const action = payload.action;
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let result = null;

  switch (action) {
    case 'getEmployees':
      result = readSheet(ss.getSheetByName('Employees'), HEADERS.Employees);
      break;
    case 'saveEmployee':
      if (payload.registeredPhotos && Array.isArray(payload.registeredPhotos)) {
        payload.registeredPhotos = payload.registeredPhotos.map((photo, index) => {
          if (typeof photo === 'string' && photo.startsWith('data:image')) {
            const filename = 'emp_' + (payload.id || 'new') + '_photo_' + index + '.jpg';
            return saveBase64ImageToDrive(photo, filename);
          }
          return photo;
        });
      }
      result = saveRow(ss.getSheetByName('Employees'), HEADERS.Employees, payload);
      break;
    case 'updateEmployee':
      if (payload.registeredPhotos && Array.isArray(payload.registeredPhotos)) {
        payload.registeredPhotos = payload.registeredPhotos.map((photo, index) => {
          if (typeof photo === 'string' && photo.startsWith('data:image')) {
            const filename = 'emp_' + (payload.id || 'new') + '_photo_' + index + '.jpg';
            return saveBase64ImageToDrive(photo, filename);
          }
          return photo;
        });
      }
      result = updateRow(ss.getSheetByName('Employees'), HEADERS.Employees, payload.id, payload);
      break;
    case 'deleteEmployee':
      result = deleteRow(ss.getSheetByName('Employees'), payload.id);
      break;
    case 'getAttendance':
      result = readSheet(ss.getSheetByName('Attendance'), HEADERS.Attendance);
      break;
    case 'saveAttendance':
      result = saveRow(ss.getSheetByName('Attendance'), HEADERS.Attendance, payload);
      break;
    case 'updateAttendance':
      result = updateRow(ss.getSheetByName('Attendance'), HEADERS.Attendance, payload.id, payload);
      break;
    case 'deleteAttendance':
      result = deleteRow(ss.getSheetByName('Attendance'), payload.id);
      break;
    case 'savePhotos':
      if (payload.originalPhoto && typeof payload.originalPhoto === 'string' && payload.originalPhoto.startsWith('data:image')) {
        const filename = 'att_' + (payload.attendanceId || 'raw') + '_original_' + Date.now() + '.jpg';
        payload.originalPhoto = saveBase64ImageToDrive(payload.originalPhoto, filename);
      }
      if (payload.croppedFace && typeof payload.croppedFace === 'string' && payload.croppedFace.startsWith('data:image')) {
        const filename = 'att_' + (payload.attendanceId || 'raw') + '_crop_' + Date.now() + '.jpg';
        payload.croppedFace = saveBase64ImageToDrive(payload.croppedFace, filename);
      }
      result = saveRow(ss.getSheetByName('Photos') || createPhotosSheet(ss), ['id', 'attendanceId', 'originalPhoto', 'croppedFace', 'timestamp'], payload);
      
      // Also link the generated Drive URLs back to the matching row in the Attendance sheet
      const attSheet = ss.getSheetByName('Attendance');
      if (attSheet && payload.attendanceId) {
        updateRow(attSheet, HEADERS.Attendance, payload.attendanceId, {
          originalPhotoUrl: payload.originalPhoto,
          croppedFaceUrl: payload.croppedFace
        });
      }
      break;
    case 'getPhotos':
      result = readSheet(ss.getSheetByName('Photos') || createPhotosSheet(ss), ['id', 'attendanceId', 'originalPhoto', 'croppedFace', 'timestamp']);
      break;
    case 'getAuditLogs':
      result = readSheet(ss.getSheetByName('AuditLogs'), HEADERS.AuditLogs);
      break;
    case 'saveAuditLog':
      result = saveRow(ss.getSheetByName('AuditLogs'), HEADERS.AuditLogs, payload);
      break;
    case 'getWorksite':
      result = getConfig(ss, 'worksite', { latitude: 12.9716, longitude: 77.5946, radiusMeters: 250 });
      break;
    case 'updateWorksite':
      result = setConfig(ss, 'worksite', payload);
      break;
    case 'login':
      result = handleLogin(ss, payload.username, payload.password);
      break;
    case 'changePassword':
      result = handleChangePassword(ss, payload);
      break;
    default:
      throw new Error('Unknown action: ' + action);
  }

  return ContentService.createTextOutput(JSON.stringify(result || { success: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

// PRIMARY entry point — all frontend calls use GET to bypass the broken POST redirect chain.
// Usage: ?action=login&data={"username":"admin","password":"admin123"}
function doGet(e) {
  try {
    const action = (e.parameter || {}).action;

    // If no action parameter, return a health-check response
    if (!action) {
      const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
      return ContentService.createTextOutput(JSON.stringify({ ok: true, message: "Apps Script Web App is running.", spreadsheetName: ss.getName() }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Parse optional data parameter (JSON-encoded payload)
    let payload = {};
    if (e.parameter.data) {
      payload = JSON.parse(e.parameter.data);
    }
    payload.action = action;

    return processAction(payload);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: error.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Fallback POST handler — kept for compatibility but POST redirects may fail on Google's infra
function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    return processAction(payload);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: error.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function initSheets(ss) {
  for (const [name, headers] of Object.entries(HEADERS)) {
    let sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
      sheet.appendRow(headers);
    } else {
      // Dynamic migration: check if any new headers are missing and append them to the end
      const lastCol = sheet.getLastColumn();
      if (lastCol > 0) {
        const existingHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
        const missing = headers.filter(h => !existingHeaders.includes(h));
        if (missing.length > 0) {
          sheet.getRange(1, lastCol + 1, 1, missing.length).setValues([missing]);
        }
      }
    }
  }

  // Ensure default Admin profile exists in the Employees sheet
  const empSheet = ss.getSheetByName('Employees');
  const lastRow = empSheet.getLastRow();
  let adminExists = false;
  if (lastRow >= 2) {
    const ids = empSheet.getRange(2, 1, lastRow - 1, 1).getValues();
    adminExists = ids.some(r => String(r[0]).trim().toLowerCase() === 'admin');
  }

  if (!adminExists) {
    const adminPassword = String(getConfig(ss, 'adminPassword', 'admin123'));
    const adminRow = {
      id: 'admin',
      name: 'Admin Supervisor',
      designation: 'System Admin',
      department: 'Management',
      mobile: '—',
      role: 'admin',
      password: adminPassword,
      registeredPhotos: [],
      biometrics: { vector: new Array(512).fill(0) }
    };
    saveRow(empSheet, HEADERS.Employees, adminRow);
    Logger.log("Created default Admin row in Employees sheet.");
  }
}

function createPhotosSheet(ss) {
  let sheet = ss.getSheetByName('Photos');
  if (!sheet) {
    sheet = ss.insertSheet('Photos');
    sheet.appendRow(['id', 'attendanceId', 'originalPhoto', 'croppedFace', 'timestamp']);
  }
  return sheet;
}

function readSheet(sheet, headers) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const range = sheet.getRange(2, 1, lastRow - 1, headers.length);
  const values = range.getValues();
  
  return values.map(row => {
    const obj = {};
    headers.forEach((h, idx) => {
      let val = row[idx];
      if (val === "" || val === undefined) {
        val = null;
      } else if (typeof val === 'string' && (val.startsWith('{') || val.startsWith('['))) {
        try {
          val = JSON.parse(val);
        } catch (e) {
          // Keep string
        }
      }
      obj[h] = val;
    });
    return obj;
  });
}

function saveRow(sheet, headers, data) {
  const row = headers.map(h => {
    let val = data[h];
    if (typeof val === 'object' && val !== null) {
      return JSON.stringify(val);
    }
    return val !== undefined && val !== null ? val : "";
  });
  sheet.appendRow(row);
  return { success: true };
}

function updateRow(sheet, headers, id, updatedFields) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: false, error: 'Empty sheet' };
  
  const values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  const rowIndex = values.findIndex(r => String(r[0]).trim().toLowerCase() === String(id).trim().toLowerCase());
  if (rowIndex === -1) return { success: false, error: 'ID not found' };
  
  const sheetRow = rowIndex + 2;
  const currentValues = sheet.getRange(sheetRow, 1, 1, headers.length).getValues()[0];
  
  const obj = {};
  headers.forEach((h, idx) => {
    let val = currentValues[idx];
    if (typeof val === 'string' && (val.startsWith('{') || val.startsWith('['))) {
      try { val = JSON.parse(val); } catch(e) {}
    }
    obj[h] = val;
  });
  
  const finalObj = { ...obj, ...updatedFields };
  const newRowValues = headers.map(h => {
    let val = finalObj[h];
    if (typeof val === 'object' && val !== null) {
      return JSON.stringify(val);
    }
    return val !== undefined && val !== null ? val : "";
  });
  
  sheet.getRange(sheetRow, 1, 1, headers.length).setValues([newRowValues]);
  return { success: true };
}

function deleteRow(sheet, id) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: false };
  const values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  const rowIndex = values.findIndex(r => String(r[0]).trim().toLowerCase() === String(id).trim().toLowerCase());
  if (rowIndex === -1) return { success: false };
  sheet.deleteRow(rowIndex + 2);
  return { success: true };
}

function getConfig(ss, key, defaultVal) {
  const sheet = ss.getSheetByName('Config');
  const lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    const values = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
    const row = values.find(r => r[0] === key);
    if (row && row[1]) {
      try { return JSON.parse(row[1]); } catch(e) { return row[1]; }
    }
  }
  return defaultVal;
}

function setConfig(ss, key, value) {
  const sheet = ss.getSheetByName('Config');
  const lastRow = sheet.getLastRow();
  const strVal = typeof value === 'object' ? JSON.stringify(value) : String(value);
  
  if (lastRow >= 2) {
    const values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    const rowIndex = values.findIndex(r => r[0] === key);
    if (rowIndex !== -1) {
      sheet.getRange(rowIndex + 2, 2).setValue(strVal);
      return { success: true };
    }
  }
  sheet.appendRow([key, strVal]);
  return { success: true };
}

function handleLogin(ss, username, password) {
  const cleanUsername = String(username || '').trim().toLowerCase();
  
  if (cleanUsername === 'admin') {
    const adminPassword = String(getConfig(ss, 'adminPassword', 'admin123'));
    if (String(password) === adminPassword) {
      const employees = readSheet(ss.getSheetByName('Employees'), HEADERS.Employees);
      const emp = employees.find(e => String(e.id).trim().toLowerCase() === 'admin');
      if (emp) {
        return { success: true, role: 'admin', user: emp };
      }
      return { success: true, role: 'admin', user: { name: 'Admin Supervisor', id: 'admin', role: 'admin' } };
    }

    const employees = readSheet(ss.getSheetByName('Employees'), HEADERS.Employees);
    const emp = employees.find(e => String(e.id).trim().toLowerCase() === 'admin');
    if (emp && String(password) === String(emp.password || 'admin123')) {
      return { success: true, role: 'admin', user: emp };
    }

    return { success: false, error: 'Invalid admin password.' };
  }
  
  const employees = readSheet(ss.getSheetByName('Employees'), HEADERS.Employees);
  const emp = employees.find(e => {
    const sheetId = String(e.id || '').trim().toLowerCase();
    const sheetName = String(e.name || '').trim().toLowerCase();
    return sheetId === cleanUsername || sheetName === cleanUsername;
  });
  if (!emp) return { success: false, error: 'User profile not found.' };
  if (String(password) !== String(emp.password || '123456')) return { success: false, error: 'Incorrect credentials.' };
  
  return { success: true, role: emp.role || 'employee', user: emp };
}

function handleChangePassword(ss, payload) {
  const { userId, currentPassword, newPassword, isAdmin } = payload;
  if (isAdmin) {
    const adminPassword = String(getConfig(ss, 'adminPassword', 'admin123'));
    if (String(currentPassword) !== adminPassword) return { success: false, error: 'Incorrect current password.' };
    setConfig(ss, 'adminPassword', newPassword);
    
    // Also update Admin row in Employees sheet if present
    const sheet = ss.getSheetByName('Employees');
    updateRow(sheet, HEADERS.Employees, 'admin', { password: newPassword });
    return { success: true };
  }
  
  const sheet = ss.getSheetByName('Employees');
  const employees = readSheet(sheet, HEADERS.Employees);
  const cleanUserId = String(userId || '').trim().toLowerCase();
  const emp = employees.find(e => String(e.id).trim().toLowerCase() === cleanUserId);
  if (!emp) return { success: false, error: 'Employee not found.' };
  if (String(currentPassword) !== String(emp.password || '123456')) return { success: false, error: 'Incorrect current password.' };
  
  updateRow(sheet, HEADERS.Employees, emp.id, { password: newPassword });
  return { success: true, employee: { ...emp, password: newPassword } };
}

// Helper: Save Base64 image payload to Google Drive folder and return direct hosting link
function saveBase64ImageToDrive(base64Data, filename) {
  if (!base64Data || typeof base64Data !== 'string' || !base64Data.includes('base64,')) {
    return base64Data; // Already a URL or not base64
  }
  try {
    const parts = base64Data.split('base64,');
    const contentType = parts[0].split(':')[1].split(';')[0];
    const rawData = Utilities.base64Decode(parts[1]);
    const blob = Utilities.newBlob(rawData, contentType, filename);
    
    let folder = null;
    
    // 1. Try to open specified folder by constant ID
    if (typeof DRIVE_FOLDER_ID !== 'undefined' && DRIVE_FOLDER_ID) {
      try {
        folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
      } catch (err) {
        Logger.log("Could not find folder by ID: " + err.message + ". Falling back to search by name.");
      }
    }
    
    // 2. Fallback to name search or creation
    if (!folder) {
      const folderName = "WorkForce Attendance Photos";
      const folders = DriveApp.getFoldersByName(folderName);
      if (folders.hasNext()) {
        folder = folders.next();
      } else {
        folder = DriveApp.createFolder(folderName);
      }
    }
    
    // 3. Create the file & set sharing permission so it can be rendered as an img element
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    // 4. Return standard clickable sharing link
    return 'https://drive.google.com/file/d/' + file.getId() + '/view?usp=drivesdk';
  } catch (error) {
    Logger.log("Failed to save image to Drive: " + error.message);
    try {
      const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
      const auditSheet = ss.getSheetByName('AuditLogs');
      if (auditSheet) {
        saveRow(auditSheet, HEADERS.AuditLogs, {
          id: 'ERR' + Math.floor(100000 + Math.random() * 900000),
          actionType: 'Drive Upload Error',
          user: 'System Engine',
          timestamp: new Date().toISOString(),
          remarks: 'Failed to save base64 to Drive. Filename: ' + filename + '. Error: ' + error.message
        });
      }
    } catch (logErr) {
      // Ignore logging error
    }
    return base64Data; // Return base64 payload as fallback on failure
  }
}
