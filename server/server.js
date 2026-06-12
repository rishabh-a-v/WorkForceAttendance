/**
 * WorkForce Attendance — Local Backend Server
 * Express.js REST API with Google Sheets API and JSON-file persistence.
 * Runs on your Mac and serves all devices on the same Wi-Fi network.
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const os = require('os');
const googleSheets = require('./googleSheets');

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Paths ────────────────────────────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, 'data');
const FILES = {
  employees:  path.join(DATA_DIR, 'employees.json'),
  attendance: path.join(DATA_DIR, 'attendance.json'),
  photos:     path.join(DATA_DIR, 'photos.json'),
  auditLogs:  path.join(DATA_DIR, 'audit_logs.json'),
  config:     path.join(DATA_DIR, 'config.json'),
};

// ─── Bootstrap data directory ─────────────────────────────────────────────────
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const defaultConfig = {
  adminPassword: 'admin123',
  worksite: { latitude: 12.9716, longitude: 77.5946, radiusMeters: 250 }
};

const defaults = {
  employees:  [],
  attendance: [],
  photos:     [],
  auditLogs:  [{
    id: 'LOG0001',
    actionType: 'Database Initialization',
    user: 'System Engine',
    timestamp: new Date().toISOString(),
    oldValue: null,
    newValue: 'Backend Server Started',
    ipAddress: '127.0.0.1',
    deviceInfo: 'Node.js Backend',
    remarks: 'WorkForce backend server initialized successfully.'
  }],
  config: defaultConfig,
};

Object.entries(FILES).forEach(([key, filePath]) => {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaults[key], null, 2));
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
const readJSON  = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const writeJSON = (filePath, data) => fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

const appendLog = async (actionType, user, oldValue, newValue, remarks, req) => {
  const logObj = {
    id: 'LOG' + Math.floor(100000 + Math.random() * 900000),
    actionType,
    user,
    timestamp: new Date().toISOString(),
    oldValue: oldValue ? String(oldValue) : null,
    newValue: newValue ? String(newValue) : null,
    ipAddress: req ? (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '0.0.0.0') : '0.0.0.0',
    deviceInfo: (req ? (req.headers['user-agent'] || 'Unknown') : 'Unknown').substring(0, 100),
    remarks,
  };

  if (googleSheets.isConfigured()) {
    await googleSheets.saveAuditLog(logObj);
  }

  // Keep a local copy/backup as well
  const logs = readJSON(FILES.auditLogs);
  logs.push(logObj);
  writeJSON(FILES.auditLogs, logs);
};

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' })); // large payloads for base64 face images

// Initialize Google Sheets (attempts authentication, falls back gracefully)
googleSheets.initGoogleSheets();

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (_, res) => {
  res.json({ 
    ok: true, 
    ts: new Date().toISOString(), 
    message: 'WorkForce backend is running',
    googleSheets: googleSheets.isConfigured() ? 'Active' : 'Fallback JSON Mode'
  });
});

// ════════════════════════════════════════════════════════════════════
// EMPLOYEES
// ════════════════════════════════════════════════════════════════════

app.get('/api/employees', async (_, res) => {
  if (googleSheets.isConfigured()) {
    const emps = await googleSheets.getEmployees();
    return res.json(emps);
  }
  res.json(readJSON(FILES.employees));
});

app.post('/api/employees', async (req, res) => {
  const emp = req.body;
  if (!emp.password) emp.password = '123456';
  
  if (!emp.samples) {
    emp.samples = (emp.registeredPhotos || [emp.avatar]).map((img, idx) => ({
      id: `SAMP_${emp.id}_${idx + 1}`,
      vector: emp.biometrics ? emp.biometrics.vector : new Array(512).fill(0),
      avatar: img,
      quality: { blur: 15, brightness: 120, contrast: 45, eyeVisible: true, headYaw: 1, headPitch: 1, isPartial: false, passed: true },
      registeredAt: new Date().toISOString(),
    }));
  }

  if (googleSheets.isConfigured()) {
    const employees = await googleSheets.getEmployees();
    if (employees.some(e => e.id === emp.id))
      return res.status(409).json({ success: false, error: 'Employee ID already exists' });
    if (employees.some(e => e.name.toLowerCase() === emp.name.toLowerCase()))
      return res.status(409).json({ success: false, error: `Employee name "${emp.name}" is already registered.` });
    if (emp.mobile && employees.some(e => e.mobile === emp.mobile))
      return res.status(409).json({ success: false, error: `Mobile number "${emp.mobile}" is already registered.` });

    await googleSheets.saveEmployee(emp);
    await appendLog('Employee Registration', 'System Admin', null,
      JSON.stringify({ id: emp.id, name: emp.name }),
      `Registered ${emp.name} (${emp.id}) in ${emp.department}.`, req);

    return res.json({ success: true });
  }

  // Fallback JSON mode
  const employees = readJSON(FILES.employees);
  if (employees.some(e => e.id === emp.id))
    return res.status(409).json({ success: false, error: 'Employee ID already exists' });
  if (employees.some(e => e.name.toLowerCase() === emp.name.toLowerCase()))
    return res.status(409).json({ success: false, error: `Employee name "${emp.name}" is already registered.` });
  if (emp.mobile && employees.some(e => e.mobile === emp.mobile))
    return res.status(409).json({ success: false, error: `Mobile number "${emp.mobile}" is already registered.` });

  employees.push(emp);
  writeJSON(FILES.employees, employees);
  await appendLog('Employee Registration', 'System Admin', null,
    JSON.stringify({ id: emp.id, name: emp.name }),
    `Registered ${emp.name} (${emp.id}) in ${emp.department}.`, req);

  res.json({ success: true });
});

app.put('/api/employees/:id', async (req, res) => {
  // Protect password from being overwritten with empty value
  if (req.body.password === undefined || req.body.password === null || (typeof req.body.password === 'string' && !req.body.password.trim())) {
    delete req.body.password;
  }

  if (googleSheets.isConfigured()) {
    const employees = await googleSheets.getEmployees();
    const emp = employees.find(e => e.id && e.id.toString().trim().toLowerCase() === req.params.id.toString().trim().toLowerCase());
    if (!emp) return res.status(404).json({ success: false, error: 'Employee not found' });

    const oldValue = JSON.stringify(emp);
    const updated = { ...emp, ...req.body };
    
    await googleSheets.updateEmployee(req.params.id, req.body);
    await appendLog('Employee Profile Update', 'System Admin', oldValue,
      JSON.stringify(updated),
      `Updated profile for ${updated.name} (${req.params.id}).`, req);

    return res.json({ success: true });
  }

  // Fallback JSON mode
  const employees = readJSON(FILES.employees);
  const idx = employees.findIndex(e => e.id && e.id.toString().trim().toLowerCase() === req.params.id.toString().trim().toLowerCase());
  if (idx === -1) return res.status(404).json({ success: false, error: 'Employee not found' });

  const oldValue = JSON.stringify(employees[idx]);
  employees[idx] = { ...employees[idx], ...req.body };
  writeJSON(FILES.employees, employees);
  await appendLog('Employee Profile Update', 'System Admin', oldValue,
    JSON.stringify(employees[idx]),
    `Updated profile for ${employees[idx].name} (${req.params.id}).`, req);

  res.json({ success: true });
});

app.delete('/api/employees/:id', async (req, res) => {
  if (googleSheets.isConfigured()) {
    const employees = await googleSheets.getEmployees();
    const deleted = employees.find(e => e.id && e.id.toString().trim().toLowerCase() === req.params.id.toString().trim().toLowerCase());
    if (!deleted) return res.status(404).json({ success: false, error: 'Employee not found' });

    await googleSheets.deleteEmployee(req.params.id);
    await appendLog('Employee Removal', 'System Admin', JSON.stringify(deleted), null,
      `Deleted ${deleted.name} (${req.params.id}).`, req);

    return res.json({ success: true });
  }

  // Fallback JSON mode
  const employees = readJSON(FILES.employees);
  const idx = employees.findIndex(e => e.id && e.id.toString().trim().toLowerCase() === req.params.id.toString().trim().toLowerCase());
  if (idx === -1) return res.status(404).json({ success: false, error: 'Employee not found' });

  const deleted = employees[idx];
  employees.splice(idx, 1);
  writeJSON(FILES.employees, employees);
  await appendLog('Employee Removal', 'System Admin', JSON.stringify(deleted), null,
    `Deleted ${deleted.name} (${req.params.id}).`, req);

  res.json({ success: true });
});

// Add biometric sample
app.post('/api/employees/:id/samples', async (req, res) => {
  if (googleSheets.isConfigured()) {
    const employees = await googleSheets.getEmployees();
    const emp = employees.find(e => e.id && e.id.toString().trim().toLowerCase() === req.params.id.toString().trim().toLowerCase());
    if (!emp) return res.status(404).json({ success: false, error: 'Employee not found' });

    if (!emp.samples) emp.samples = [];
    emp.samples.push(req.body);

    const vectors = emp.samples.map(s => s.vector).filter(Boolean);
    if (vectors.length > 0) {
      const centroid = new Array(512).fill(0);
      vectors.forEach(v => { for (let i = 0; i < 512; i++) centroid[i] += (v[i] || 0); });
      for (let i = 0; i < 512; i++) centroid[i] /= vectors.length;
      if (!emp.biometrics) emp.biometrics = {};
      emp.biometrics.vector = centroid;
    }

    emp.registeredPhotos = emp.samples.map(s => s.avatar);
    
    await googleSheets.updateEmployee(req.params.id, {
      samples: emp.samples,
      biometrics: emp.biometrics,
      registeredPhotos: emp.registeredPhotos
    });

    await appendLog('Enrollment Sample Added', 'System Admin', null,
      JSON.stringify({ id: req.params.id, sampleId: req.body.id }),
      `Added sample ${req.body.id} to ${emp.name}.`, req);

    return res.json({ success: true, employee: emp });
  }

  // Fallback JSON mode
  const employees = readJSON(FILES.employees);
  const idx = employees.findIndex(e => e.id && e.id.toString().trim().toLowerCase() === req.params.id.toString().trim().toLowerCase());
  if (idx === -1) return res.status(404).json({ success: false, error: 'Employee not found' });

  const emp = employees[idx];
  if (!emp.samples) emp.samples = [];
  emp.samples.push(req.body);

  const vectors = emp.samples.map(s => s.vector).filter(Boolean);
  if (vectors.length > 0) {
    const centroid = new Array(512).fill(0);
    vectors.forEach(v => { for (let i = 0; i < 512; i++) centroid[i] += (v[i] || 0); });
    for (let i = 0; i < 512; i++) centroid[i] /= vectors.length;
    if (!emp.biometrics) emp.biometrics = {};
    emp.biometrics.vector = centroid;
  }

  emp.registeredPhotos = emp.samples.map(s => s.avatar);
  employees[idx] = emp;
  writeJSON(FILES.employees, employees);

  await appendLog('Enrollment Sample Added', 'System Admin', null,
    JSON.stringify({ id: req.params.id, sampleId: req.body.id }),
    `Added sample ${req.body.id} to ${emp.name}.`, req);

  res.json({ success: true, employee: emp });
});

// Delete biometric sample
app.delete('/api/employees/:id/samples/:sampleId', async (req, res) => {
  if (googleSheets.isConfigured()) {
    const employees = await googleSheets.getEmployees();
    const emp = employees.find(e => e.id && e.id.toString().trim().toLowerCase() === req.params.id.toString().trim().toLowerCase());
    if (!emp) return res.status(404).json({ success: false, error: 'Employee not found' });

    if (!emp.samples || emp.samples.length <= 1)
      return res.status(400).json({ success: false, error: 'Cannot delete the last biometric sample.' });

    emp.samples = emp.samples.filter(s => s.id !== req.params.sampleId);

    const vectors = emp.samples.map(s => s.vector).filter(Boolean);
    if (vectors.length > 0) {
      const centroid = new Array(512).fill(0);
      vectors.forEach(v => { for (let i = 0; i < 512; i++) centroid[i] += (v[i] || 0); });
      for (let i = 0; i < 512; i++) centroid[i] /= vectors.length;
      if (!emp.biometrics) emp.biometrics = {};
      emp.biometrics.vector = centroid;
    }

    emp.registeredPhotos = emp.samples.map(s => s.avatar);
    emp.avatar = emp.registeredPhotos[0];

    await googleSheets.updateEmployee(req.params.id, {
      samples: emp.samples,
      biometrics: emp.biometrics,
      registeredPhotos: emp.registeredPhotos,
      avatar: emp.avatar
    });

    await appendLog('Enrollment Sample Removed', 'System Admin', null,
      JSON.stringify({ id: req.params.id, sampleId: req.params.sampleId }),
      `Removed sample from ${emp.name}.`, req);

    return res.json({ success: true, employee: emp });
  }

  // Fallback JSON mode
  const employees = readJSON(FILES.employees);
  const idx = employees.findIndex(e => e.id && e.id.toString().trim().toLowerCase() === req.params.id.toString().trim().toLowerCase());
  if (idx === -1) return res.status(404).json({ success: false, error: 'Employee not found' });

  const emp = employees[idx];
  if (!emp.samples || emp.samples.length <= 1)
    return res.status(400).json({ success: false, error: 'Cannot delete the last biometric sample.' });

  emp.samples = emp.samples.filter(s => s.id !== req.params.sampleId);

  const vectors = emp.samples.map(s => s.vector).filter(Boolean);
  if (vectors.length > 0) {
    const centroid = new Array(512).fill(0);
    vectors.forEach(v => { for (let i = 0; i < 512; i++) centroid[i] += (v[i] || 0); });
    for (let i = 0; i < 512; i++) centroid[i] /= vectors.length;
    if (!emp.biometrics) emp.biometrics = {};
    emp.biometrics.vector = centroid;
  }

  emp.registeredPhotos = emp.samples.map(s => s.avatar);
  emp.avatar = emp.registeredPhotos[0];
  employees[idx] = emp;
  writeJSON(FILES.employees, employees);

  await appendLog('Enrollment Sample Removed', 'System Admin', null,
    JSON.stringify({ id: req.params.id, sampleId: req.params.sampleId }),
    `Removed sample from ${emp.name}.`, req);

  res.json({ success: true, employee: emp });
});

// ════════════════════════════════════════════════════════════════════
// ATTENDANCE
// ════════════════════════════════════════════════════════════════════

app.get('/api/attendance', async (_, res) => {
  if (googleSheets.isConfigured()) {
    const atts = await googleSheets.getAttendance();
    return res.json(atts);
  }
  res.json(readJSON(FILES.attendance));
});

app.post('/api/attendance', async (req, res) => {
  const record = req.body;
  const dateStr = new Date(record.checkInTime).toDateString();

  if (googleSheets.isConfigured()) {
    const attendance = await googleSheets.getAttendance();
    const duplicate = attendance.some(a =>
      a.employeeId === record.employeeId &&
      a.employeeId !== 'UNKNOWN' &&
      new Date(a.checkInTime).toDateString() === dateStr
    );
    if (duplicate)
      return res.status(409).json({ success: false, error: 'Employee has already checked in today.' });

    if (record.qualityScore === undefined)    record.qualityScore = 95;
    if (record.livenessScore === undefined)   record.livenessScore = 98;
    if (record.similarityScore === undefined) record.similarityScore = record.confidence || 90;

    await googleSheets.saveAttendance(record);
    await appendLog('Attendance Creation', 'System Engine', null,
      JSON.stringify({ id: record.id, employee: record.employeeName, time: record.checkInTime }),
      `Check-in for ${record.employeeName}. Confidence: ${record.confidence}%. GPS: ${record.attendanceStatus}.`, req);

    return res.json({ success: true, record });
  }

  // Fallback JSON mode
  const attendance = readJSON(FILES.attendance);
  const duplicate = attendance.some(a =>
    a.employeeId === record.employeeId &&
    a.employeeId !== 'UNKNOWN' &&
    new Date(a.checkInTime).toDateString() === dateStr
  );
  if (duplicate)
    return res.status(409).json({ success: false, error: 'Employee has already checked in today.' });

  if (record.qualityScore === undefined)    record.qualityScore = 95;
  if (record.livenessScore === undefined)   record.livenessScore = 98;
  if (record.similarityScore === undefined) record.similarityScore = record.confidence || 90;

  attendance.push(record);
  writeJSON(FILES.attendance, attendance);

  await appendLog('Attendance Creation', 'System Engine', null,
    JSON.stringify({ id: record.id, employee: record.employeeName, time: record.checkInTime }),
    `Check-in for ${record.employeeName}. Confidence: ${record.confidence}%. GPS: ${record.attendanceStatus}.`, req);

  res.json({ success: true, record });
});

app.put('/api/attendance/:id', async (req, res) => {
  if (googleSheets.isConfigured()) {
    const attendance = await googleSheets.getAttendance();
    const record = attendance.find(a => a.id === req.params.id);
    if (!record) return res.status(404).json({ success: false, error: 'Record not found' });

    const oldValue = JSON.stringify(record);
    const updated = { ...record, ...req.body };
    
    await googleSheets.updateAttendance(req.params.id, req.body);
    await appendLog('Attendance Edit', req.body.verifierName || 'System Admin', oldValue,
      JSON.stringify(updated), `Edited attendance record ${req.params.id}.`, req);

    return res.json({ success: true });
  }

  // Fallback JSON mode
  const attendance = readJSON(FILES.attendance);
  const idx = attendance.findIndex(a => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, error: 'Record not found' });

  const oldValue = JSON.stringify(attendance[idx]);
  attendance[idx] = { ...attendance[idx], ...req.body };
  writeJSON(FILES.attendance, attendance);

  await appendLog('Attendance Edit', req.body.verifierName || 'System Admin', oldValue,
    JSON.stringify(attendance[idx]), `Edited attendance record ${req.params.id}.`, req);

  res.json({ success: true });
});

app.delete('/api/attendance/:id', async (req, res) => {
  if (googleSheets.isConfigured()) {
    const attendance = await googleSheets.getAttendance();
    const deleted = attendance.find(a => a.id === req.params.id);
    if (!deleted) return res.status(404).json({ success: false, error: 'Record not found' });

    await googleSheets.deleteAttendance(req.params.id);
    
    // Clean up photos locally
    const photos = readJSON(FILES.photos);
    writeJSON(FILES.photos, photos.filter(p => p.attendanceId !== req.params.id));

    await appendLog('Attendance Deletion', 'System Admin', JSON.stringify(deleted), null,
      `Deleted attendance record ${req.params.id}.`, req);

    return res.json({ success: true });
  }

  // Fallback JSON mode
  const attendance = readJSON(FILES.attendance);
  const idx = attendance.findIndex(a => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, error: 'Record not found' });

  const deleted = attendance[idx];
  attendance.splice(idx, 1);
  writeJSON(FILES.attendance, attendance);

  const photos = readJSON(FILES.photos);
  writeJSON(FILES.photos, photos.filter(p => p.attendanceId !== req.params.id));

  await appendLog('Attendance Deletion', 'System Admin', JSON.stringify(deleted), null,
    `Deleted attendance record ${req.params.id}.`, req);

  res.json({ success: true });
});

// ════════════════════════════════════════════════════════════════════
// PHOTOS (Stored strictly locally on server to avoid Sheets cell limit crash)
// ════════════════════════════════════════════════════════════════════

app.get('/api/photos', (_, res) => {
  res.json(readJSON(FILES.photos));
});

app.post('/api/photos', async (req, res) => {
  const photoData = req.body;
  
  if (googleSheets.isConfigured()) {
    try {
      // Directly write the compressed base64 images to Google Sheets
      await googleSheets.updateAttendance(photoData.attendanceId, {
        originalPhotoUrl: photoData.originalPhoto || "",
        croppedFaceUrl: photoData.croppedFace || ""
      });
    } catch (error) {
      console.error('[Google Sheets] Error writing photo base64 strings to Sheets:', error.message);
    }
  }

  // Always keep a local copy/cache
  const photos = readJSON(FILES.photos);
  photos.push(photoData);
  writeJSON(FILES.photos, photos);
  res.json({ success: true });
});

// ════════════════════════════════════════════════════════════════════
// AUDIT LOGS
// ════════════════════════════════════════════════════════════════════

app.get('/api/audit-logs', async (_, res) => {
  if (googleSheets.isConfigured()) {
    const logs = await googleSheets.getAuditLogs();
    return res.json(logs);
  }
  res.json(readJSON(FILES.auditLogs));
});

// ════════════════════════════════════════════════════════════════════
// AUTH & CONFIG
// ════════════════════════════════════════════════════════════════════

app.post('/api/auth/login', async (req, res) => {
  const cleanUsername = (req.body.username || '').toString().trim().toLowerCase();
  const { password } = req.body;
  const config = readJSON(FILES.config);

  if (cleanUsername === 'admin') {
    if (password === (config.adminPassword || 'admin123')) {
      await appendLog('Security Authentication', 'System Admin', null, null, 'Admin authenticated.', req);
      return res.json({ success: true, role: 'admin', user: { name: 'Admin Supervisor', id: 'admin' } });
    }
    return res.status(401).json({ success: false, error: 'Invalid admin password.' });
  }

  const employees = googleSheets.isConfigured() 
    ? await googleSheets.getEmployees() 
    : readJSON(FILES.employees);

  const emp = employees.find(e => {
    const sheetId = (e.id || '').toString().trim().toLowerCase();
    const sheetName = (e.name || '').toString().trim().toLowerCase();
    return sheetId === cleanUsername || sheetName === cleanUsername;
  });

  if (!emp) return res.status(404).json({ success: false, error: 'User profile not found.' });
  if (password !== (emp.password || '123456'))
    return res.status(401).json({ success: false, error: 'Incorrect credentials.' });

  await appendLog('Security Authentication', emp.name, null, null, `${emp.name} authenticated.`, req);
  res.json({ success: true, role: emp.role || 'employee', user: emp });
});

app.put('/api/auth/password', async (req, res) => {
  const { userId, currentPassword, newPassword, isAdmin } = req.body;
  const config = readJSON(FILES.config);

  if (isAdmin) {
    if (currentPassword !== (config.adminPassword || 'admin123'))
      return res.status(401).json({ success: false, error: 'Incorrect current password.' });
    config.adminPassword = newPassword;
    writeJSON(FILES.config, config);
    await appendLog('Credentials Update', 'System Admin', null, null, 'Admin password updated.', req);
    return res.json({ success: true });
  }

  const targetId = (userId || '').toString().trim().toLowerCase();

  if (googleSheets.isConfigured()) {
    const employees = await googleSheets.getEmployees();
    const emp = employees.find(e => e.id && e.id.toString().trim().toLowerCase() === targetId);
    if (!emp) return res.status(404).json({ success: false, error: 'Employee not found.' });
    if (currentPassword !== (emp.password || '123456'))
      return res.status(401).json({ success: false, error: 'Incorrect current password.' });

    await googleSheets.updateEmployee(emp.id, { password: newPassword });
    await appendLog('Credentials Update', emp.name, null, null, `${emp.name} updated password.`, req);
    return res.json({ success: true, employee: { ...emp, password: newPassword } });
  }

  // Fallback JSON mode
  const employees = readJSON(FILES.employees);
  const idx = employees.findIndex(e => e.id && e.id.toString().trim().toLowerCase() === targetId);
  if (idx === -1) return res.status(404).json({ success: false, error: 'Employee not found.' });

  const emp = employees[idx];
  if (currentPassword !== (emp.password || '123456'))
    return res.status(401).json({ success: false, error: 'Incorrect current password.' });

  emp.password = newPassword;
  employees[idx] = emp;
  writeJSON(FILES.employees, employees);

  await appendLog('Credentials Update', emp.name, null, null, `${emp.name} updated password.`, req);
  res.json({ success: true, employee: emp });
});

app.get('/api/config/worksite', (_, res) => {
  const config = readJSON(FILES.config);
  res.json(config.worksite || defaultConfig.worksite);
});

app.put('/api/config/worksite', async (req, res) => {
  const config = readJSON(FILES.config);
  config.worksite = { ...config.worksite, ...req.body };
  writeJSON(FILES.config, config);
  await appendLog('GPS Validation', 'System Admin', null, JSON.stringify(req.body),
    `Recalibrated geofence to ${req.body.latitude}, ${req.body.longitude}.`, req);
  res.json({ success: true, worksite: config.worksite });
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  const interfaces = os.networkInterfaces();
  let localIp = 'localhost';
  Object.values(interfaces).forEach(iface => {
    iface.forEach(addr => {
      if (addr.family === 'IPv4' && !addr.internal) localIp = addr.address;
    });
  });

  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║      WorkForce Attendance — Backend Server           ║');
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log(`║  Local:    http://localhost:${PORT}                    ║`);
  console.log(`║  Network:  http://${localIp}:${PORT}                  ║`);
  console.log('║                                                      ║');
  console.log('║  Set VITE_API_URL in .env to the Network URL above   ║');
  console.log('║  so mobile devices on the same Wi-Fi can connect.    ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');
});
