/**
 * WorkForce Attendance — Local Backend Server
 * Express.js REST API with JSON-file persistence.
 * Runs on your Mac and serves all devices on the same Wi-Fi network.
 */

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();
const PORT = 3001;

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

const appendLog = (actionType, user, oldValue, newValue, remarks, req) => {
  const logs = readJSON(FILES.auditLogs);
  logs.push({
    id: 'LOG' + Math.floor(100000 + Math.random() * 900000),
    actionType,
    user,
    timestamp: new Date().toISOString(),
    oldValue: oldValue ? String(oldValue) : null,
    newValue: newValue ? String(newValue) : null,
    ipAddress: req ? (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '0.0.0.0') : '0.0.0.0',
    deviceInfo: (req ? (req.headers['user-agent'] || 'Unknown') : 'Unknown').substring(0, 100),
    remarks,
  });
  writeJSON(FILES.auditLogs, logs);
};

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' })); // large payloads for base64 face images

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (_, res) => {
  res.json({ ok: true, ts: new Date().toISOString(), message: 'WorkForce backend is running' });
});

// ════════════════════════════════════════════════════════════════════
// EMPLOYEES
// ════════════════════════════════════════════════════════════════════

app.get('/api/employees', (_, res) => {
  res.json(readJSON(FILES.employees));
});

app.post('/api/employees', (req, res) => {
  const employees = readJSON(FILES.employees);
  const emp = req.body;

  if (employees.some(e => e.id === emp.id))
    return res.status(409).json({ success: false, error: 'Employee ID already exists' });
  if (employees.some(e => e.name.toLowerCase() === emp.name.toLowerCase()))
    return res.status(409).json({ success: false, error: `Employee name "${emp.name}" is already registered.` });
  if (emp.mobile && employees.some(e => e.mobile === emp.mobile))
    return res.status(409).json({ success: false, error: `Mobile number "${emp.mobile}" is already registered.` });

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

  employees.push(emp);
  writeJSON(FILES.employees, employees);
  appendLog('Employee Registration', 'System Admin', null,
    JSON.stringify({ id: emp.id, name: emp.name }),
    `Registered ${emp.name} (${emp.id}) in ${emp.department}.`, req);

  res.json({ success: true });
});

app.put('/api/employees/:id', (req, res) => {
  const employees = readJSON(FILES.employees);
  const idx = employees.findIndex(e => e.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, error: 'Employee not found' });

  const oldValue = JSON.stringify(employees[idx]);
  employees[idx] = { ...employees[idx], ...req.body };
  writeJSON(FILES.employees, employees);
  appendLog('Employee Profile Update', 'System Admin', oldValue,
    JSON.stringify(employees[idx]),
    `Updated profile for ${employees[idx].name} (${req.params.id}).`, req);

  res.json({ success: true });
});

app.delete('/api/employees/:id', (req, res) => {
  const employees = readJSON(FILES.employees);
  const idx = employees.findIndex(e => e.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, error: 'Employee not found' });

  const deleted = employees[idx];
  employees.splice(idx, 1);
  writeJSON(FILES.employees, employees);
  appendLog('Employee Removal', 'System Admin', JSON.stringify(deleted), null,
    `Deleted ${deleted.name} (${req.params.id}).`, req);

  res.json({ success: true });
});

// Add biometric sample
app.post('/api/employees/:id/samples', (req, res) => {
  const employees = readJSON(FILES.employees);
  const idx = employees.findIndex(e => e.id === req.params.id);
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

  appendLog('Enrollment Sample Added', 'System Admin', null,
    JSON.stringify({ id: req.params.id, sampleId: req.body.id }),
    `Added sample ${req.body.id} to ${emp.name}.`, req);

  res.json({ success: true, employee: emp });
});

// Delete biometric sample
app.delete('/api/employees/:id/samples/:sampleId', (req, res) => {
  const employees = readJSON(FILES.employees);
  const idx = employees.findIndex(e => e.id === req.params.id);
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

  appendLog('Enrollment Sample Removed', 'System Admin', null,
    JSON.stringify({ id: req.params.id, sampleId: req.params.sampleId }),
    `Removed sample from ${emp.name}.`, req);

  res.json({ success: true, employee: emp });
});

// ════════════════════════════════════════════════════════════════════
// ATTENDANCE
// ════════════════════════════════════════════════════════════════════

app.get('/api/attendance', (_, res) => {
  res.json(readJSON(FILES.attendance));
});

app.post('/api/attendance', (req, res) => {
  const attendance = readJSON(FILES.attendance);
  const record = req.body;
  const dateStr = new Date(record.checkInTime).toDateString();

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

  appendLog('Attendance Creation', 'System Engine', null,
    JSON.stringify({ id: record.id, employee: record.employeeName, time: record.checkInTime }),
    `Check-in for ${record.employeeName}. Confidence: ${record.confidence}%. GPS: ${record.attendanceStatus}.`, req);

  res.json({ success: true, record });
});

app.put('/api/attendance/:id', (req, res) => {
  const attendance = readJSON(FILES.attendance);
  const idx = attendance.findIndex(a => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, error: 'Record not found' });

  const oldValue = JSON.stringify(attendance[idx]);
  attendance[idx] = { ...attendance[idx], ...req.body };
  writeJSON(FILES.attendance, attendance);

  appendLog('Attendance Edit', req.body.verifierName || 'System Admin', oldValue,
    JSON.stringify(attendance[idx]), `Edited attendance record ${req.params.id}.`, req);

  res.json({ success: true });
});

app.delete('/api/attendance/:id', (req, res) => {
  const attendance = readJSON(FILES.attendance);
  const idx = attendance.findIndex(a => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, error: 'Record not found' });

  const deleted = attendance[idx];
  attendance.splice(idx, 1);
  writeJSON(FILES.attendance, attendance);

  const photos = readJSON(FILES.photos);
  writeJSON(FILES.photos, photos.filter(p => p.attendanceId !== req.params.id));

  appendLog('Attendance Deletion', 'System Admin', JSON.stringify(deleted), null,
    `Deleted attendance record ${req.params.id}.`, req);

  res.json({ success: true });
});

// ════════════════════════════════════════════════════════════════════
// PHOTOS
// ════════════════════════════════════════════════════════════════════

app.get('/api/photos', (_, res) => {
  res.json(readJSON(FILES.photos));
});

app.post('/api/photos', (req, res) => {
  const photos = readJSON(FILES.photos);
  photos.push(req.body);
  writeJSON(FILES.photos, photos);
  res.json({ success: true });
});

// ════════════════════════════════════════════════════════════════════
// AUDIT LOGS
// ════════════════════════════════════════════════════════════════════

app.get('/api/audit-logs', (_, res) => {
  res.json(readJSON(FILES.auditLogs));
});

// ════════════════════════════════════════════════════════════════════
// AUTH & CONFIG
// ════════════════════════════════════════════════════════════════════

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  const config = readJSON(FILES.config);

  if (username.toLowerCase() === 'admin') {
    if (password === (config.adminPassword || 'admin123')) {
      appendLog('Security Authentication', 'System Admin', null, null, 'Admin authenticated.', req);
      return res.json({ success: true, role: 'admin', user: { name: 'Admin Supervisor', id: 'admin' } });
    }
    return res.status(401).json({ success: false, error: 'Invalid admin password.' });
  }

  const employees = readJSON(FILES.employees);
  const emp = employees.find(e =>
    e.id.toLowerCase() === username.toLowerCase() ||
    e.name.toLowerCase() === username.toLowerCase()
  );

  if (!emp) return res.status(404).json({ success: false, error: 'User profile not found.' });
  if (password !== (emp.password || '123456'))
    return res.status(401).json({ success: false, error: 'Incorrect credentials.' });

  appendLog('Security Authentication', emp.name, null, null, `${emp.name} authenticated.`, req);
  res.json({ success: true, role: emp.role || 'employee', user: emp });
});

app.put('/api/auth/password', (req, res) => {
  const { userId, currentPassword, newPassword, isAdmin } = req.body;
  const config = readJSON(FILES.config);

  if (isAdmin) {
    if (currentPassword !== (config.adminPassword || 'admin123'))
      return res.status(401).json({ success: false, error: 'Incorrect current password.' });
    config.adminPassword = newPassword;
    writeJSON(FILES.config, config);
    appendLog('Credentials Update', 'System Admin', null, null, 'Admin password updated.', req);
    return res.json({ success: true });
  }

  const employees = readJSON(FILES.employees);
  const idx = employees.findIndex(e => e.id === userId);
  if (idx === -1) return res.status(404).json({ success: false, error: 'Employee not found.' });

  const emp = employees[idx];
  if (currentPassword !== (emp.password || '123456'))
    return res.status(401).json({ success: false, error: 'Incorrect current password.' });

  emp.password = newPassword;
  employees[idx] = emp;
  writeJSON(FILES.employees, employees);

  appendLog('Credentials Update', emp.name, null, null, `${emp.name} updated password.`, req);
  res.json({ success: true, employee: emp });
});

app.get('/api/config/worksite', (_, res) => {
  const config = readJSON(FILES.config);
  res.json(config.worksite || defaultConfig.worksite);
});

app.put('/api/config/worksite', (req, res) => {
  const config = readJSON(FILES.config);
  config.worksite = { ...config.worksite, ...req.body };
  writeJSON(FILES.config, config);
  appendLog('GPS Validation', 'System Admin', null, JSON.stringify(req.body),
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
