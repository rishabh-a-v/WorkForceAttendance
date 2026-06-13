// Persistent database service using LocalStorage for zero-config deployment.
// Mimics a relational database schema (Employees, Attendance, Attendance Photos, Audit Logs).

const KEYS = {
  EMPLOYEES: 'wf_employees',
  ATTENDANCE: 'wf_attendance',
  PHOTOS: 'wf_attendance_photos',
  AUDIT_LOGS: 'wf_audit_logs',
  INITIALIZED: 'wf_db_initialized'
};

// High-quality SVG avatars for employees
const AVATARS = {
  EMP001: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none"><circle cx="50" cy="50" r="50" fill="%231e293b"/><path d="M50 82c16.5 0 30-10.5 30-22c0-1.5-1-4.5-3-5.5c-3-1.5-7-.5-10 .5c-5 1.5-12 1.5-17 0c-3-1-7-2-10-.5C37 56 36 59 36 60.5C36 71.5 49.5 82 50 82z" fill="%230c85e9"/><circle cx="50" cy="40" r="18" fill="%2338bdf8"/><path d="M50 25c6 0 10 4 10 9s-4 7-10 7s-10-2-10-7s4-9 10-9z" fill="%230284c7"/></svg>',
  EMP002: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none"><circle cx="50" cy="50" r="50" fill="%231e293b"/><path d="M50 82c16.5 0 30-10.5 30-22c0-1.5-1-4.5-3-5.5c-3-1.5-7-.5-10 .5c-5 1.5-12 1.5-17 0c-3-1-7-2-10-.5C37 56 36 59 36 60.5C36 71.5 49.5 82 50 82z" fill="%23ec4899"/><circle cx="50" cy="40" r="18" fill="%23f472b6"/><path d="M50 25c6 0 9 4 9 9s-3 7-9 7s-9-2-9-7s3-9 9-9z" fill="%23db2777"/></svg>',
  EMP003: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none"><circle cx="50" cy="50" r="50" fill="%231e293b"/><path d="M50 82c16.5 0 30-10.5 30-22c0-1.5-1-4.5-3-5.5c-3-1.5-7-.5-10 .5c-5 1.5-12 1.5-17 0c-3-1-7-2-10-.5C37 56 36 59 36 60.5C36 71.5 49.5 82 50 82z" fill="%2310b981"/><circle cx="50" cy="40" r="18" fill="%2334d399"/><path d="M50 25c6 0 10 4 10 9s-4 7-10 7s-10-2-10-7s4-9 10-9z" fill="%23059669"/></svg>',
  EMP004: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none"><circle cx="50" cy="50" r="50" fill="%231e293b"/><path d="M50 82c16.5 0 30-10.5 30-22c0-1.5-1-4.5-3-5.5c-3-1.5-7-.5-10 .5c-5 1.5-12 1.5-17 0c-3-1-7-2-10-.5C37 56 36 59 36 60.5C36 71.5 49.5 82 50 82z" fill="%23f59e0b"/><circle cx="50" cy="40" r="18" fill="%23fbbf24"/><path d="M50 25c6 0 9 4 9 9s-3 7-9 7s-9-2-9-7s3-9 9-9z" fill="%23d97706"/></svg>',
  EMP005: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none"><circle cx="50" cy="50" r="50" fill="%231e293b"/><path d="M50 82c16.5 0 30-10.5 30-22c0-1.5-1-4.5-3-5.5c-3-1.5-7-.5-10 .5c-5 1.5-12 1.5-17 0c-3-1-7-2-10-.5C37 56 36 59 36 60.5C36 71.5 49.5 82 50 82z" fill="%236366f1"/><circle cx="50" cy="40" r="18" fill="%23818cf8"/><path d="M50 25c6 0 10 4 10 9s-4 7-10 7s-10-2-10-7s4-9 10-9z" fill="%234f46e5"/></svg>',
  UNKNOWN: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none"><circle cx="50" cy="50" r="50" fill="%23334155"/><path d="M50 82c16.5 0 30-10.5 30-22c0-1.5-1-4.5-3-5.5c-3-1.5-7-.5-10 .5c-5 1.5-12 1.5-17 0c-3-1-7-2-10-.5C37 56 36 59 36 60.5C36 71.5 49.5 82 50 82z" fill="%2364748b"/><circle cx="50" cy="40" r="18" fill="%2394a3b8"/><path d="M47 28h6v12h-6zm0 16h6v6h-6z" fill="%230f172a"/></svg>'
};

// Worksite Central Coordinates (Simulated Warehouse Center)
const getStoredWorksite = () => {
  const stored = localStorage.getItem('wf_worksite_coords');
  if (stored) return JSON.parse(stored);
  return {
    LATITUDE: 12.9716,
    LONGITUDE: 77.5946,
    RADIUS_METERS: 250 // Permitted geofence boundary radius
  };
};

export const WORKSITE = getStoredWorksite();

export const updateWorksiteCoords = (lat, lon) => {
  WORKSITE.LATITUDE = parseFloat(lat);
  WORKSITE.LONGITUDE = parseFloat(lon);
  localStorage.setItem('wf_worksite_coords', JSON.stringify(WORKSITE));
  
  dbService.logAction(
    'GPS Validation',
    'System Admin',
    null,
    JSON.stringify({ lat, lon }),
    `Recalibrated worksite geofence perimeter coordinates to match supervisor location: ${lat}, ${lon}.`
  );
};

// ─── Backend Sync Layer ───────────────────────────────────────────────────────
// When VITE_API_URL is set the app syncs all reads/writes to the local backend
// server. localStorage is still used as the immediate cache so all existing
// synchronous calls continue to work without any changes elsewhere.

const API_BASE = import.meta.env.VITE_API_URL === 'disabled'
  ? ''
  : (import.meta.env.VITE_API_URL || (typeof window !== 'undefined' ? window.location.origin : ''));

const apiCall = async (method, path, body) => {
  if (!API_BASE || API_BASE === 'disabled') return null;
  try {
    const isAppsScript = API_BASE.includes('script.google.com');

    if (isAppsScript) {
      let action = '';
      if (path === '/api/employees' && method === 'GET') {
        action = 'getEmployees';
      } else if (path === '/api/employees' && method === 'POST') {
        action = 'saveEmployee';
      } else if (path.startsWith('/api/employees/') && path.endsWith('/samples') && method === 'POST') {
        const empId = path.split('/')[3];
        const employees = JSON.parse(localStorage.getItem('wf_employees') || '[]');
        const emp = employees.find(e => e.id === empId);
        if (emp) {
          action = 'updateEmployee';
          body = {
            id: empId,
            biometrics: emp.biometrics,
            registeredPhotos: emp.registeredPhotos
          };
        }
      } else if (path.startsWith('/api/employees/') && path.includes('/samples/') && method === 'DELETE') {
        const empId = path.split('/')[3];
        const employees = JSON.parse(localStorage.getItem('wf_employees') || '[]');
        const emp = employees.find(e => e.id === empId);
        if (emp) {
          action = 'updateEmployee';
          body = {
            id: empId,
            biometrics: emp.biometrics,
            registeredPhotos: emp.registeredPhotos
          };
        }
      } else if (path.startsWith('/api/employees/') && method === 'PUT') {
        action = 'updateEmployee';
        body = { ...body, id: path.split('/').pop() };
      } else if (path.startsWith('/api/employees/') && method === 'DELETE') {
        action = 'deleteEmployee';
        body = { id: path.split('/').pop() };
      } else if (path === '/api/attendance' && method === 'GET') {
        action = 'getAttendance';
      } else if (path === '/api/attendance' && method === 'POST') {
        action = 'saveAttendance';
      } else if (path.startsWith('/api/attendance/') && method === 'PUT') {
        action = 'updateAttendance';
        body = { ...body, id: path.split('/').pop() };
      } else if (path.startsWith('/api/attendance/') && method === 'DELETE') {
        action = 'deleteAttendance';
        body = { id: path.split('/').pop() };
      } else if (path === '/api/photos' && method === 'GET') {
        action = 'getPhotos';
      } else if (path === '/api/photos' && method === 'POST') {
        action = 'savePhotos';
      } else if (path === '/api/audit-logs' && method === 'GET') {
        action = 'getAuditLogs';
      } else if (path === '/api/audit-logs' && method === 'POST') {
        action = 'saveAuditLog';
      } else if (path === '/api/config/worksite' && method === 'GET') {
        action = 'getWorksite';
      } else if (path === '/api/config/worksite' && method === 'PUT') {
        action = 'updateWorksite';
      } else if (path === '/api/auth/login' && method === 'POST') {
        action = 'login';
      } else if (path === '/api/auth/password' && method === 'PUT') {
        action = 'changePassword';
      }

      if (!action) return null;

      const url = `${API_BASE}?action=${encodeURIComponent(action)}&data=${encodeURIComponent(JSON.stringify(body || {}))}&_t=${Date.now()}`;
      const res = await fetch(url, {
        method: 'GET'
      });
      return res.ok ? res.json() : null;
    }

    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return res.ok ? res.json() : null;
  } catch (e) {
    console.warn('[WorkForce] API call failed:', e);
    return null;
  }
};

// Pull all server data into localStorage (called on initialize)
const syncFromServer = async () => {
  if (!API_BASE) return;
  try {
    const [employees, attendance, photos, auditLogs, worksite] = await Promise.all([
      apiCall('GET', '/api/employees'),
      apiCall('GET', '/api/attendance'),
      apiCall('GET', '/api/photos'),
      apiCall('GET', '/api/audit-logs'),
      apiCall('GET', '/api/config/worksite'),
    ]);
    if (employees) {
      const processedEmployees = employees.map(emp => {
        if (!emp.avatar) {
          emp.avatar = (emp.registeredPhotos && emp.registeredPhotos.length > 0) ? emp.registeredPhotos[0] : AVATARS.UNKNOWN;
        }
        if (!emp.samples) {
          emp.samples = (emp.registeredPhotos || [emp.avatar || AVATARS.UNKNOWN]).map((img, idx) => ({
            id: `SAMP_${emp.id}_${idx + 1}`,
            vector: emp.biometrics?.vector || new Array(512).fill(0),
            avatar: img,
            quality: { blur: 15.0, brightness: 120, contrast: 45, eyeVisible: true, headYaw: 1.0, headPitch: 1.0, isPartial: false, passed: true },
            registeredAt: new Date().toISOString()
          }));
        }
        return emp;
      });
      localStorage.setItem('wf_employees', JSON.stringify(processedEmployees));
    }
    if (attendance) localStorage.setItem('wf_attendance',           JSON.stringify(attendance));
    if (photos)     localStorage.setItem('wf_attendance_photos',    JSON.stringify(photos));
    if (auditLogs)  localStorage.setItem('wf_audit_logs',           JSON.stringify(auditLogs));
    if (worksite && worksite.latitude) {
      const ws = { LATITUDE: worksite.latitude, LONGITUDE: worksite.longitude, RADIUS_METERS: worksite.radiusMeters };
      localStorage.setItem('wf_worksite_coords', JSON.stringify(ws));
      WORKSITE.LATITUDE = ws.LATITUDE;
      WORKSITE.LONGITUDE = ws.LONGITUDE;
      WORKSITE.RADIUS_METERS = ws.RADIUS_METERS;
    }
    console.log('[WorkForce] ✓ Synced from backend:', API_BASE);
  } catch (e) {
    console.warn('[WorkForce] Backend sync failed — using localStorage fallback:', e);
  }
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
// Get items helper
const get = (key) => JSON.parse(localStorage.getItem(key)) || [];
const set = (key, data) => localStorage.setItem(key, JSON.stringify(data));

// Base DB Service
export const dbService = {
  syncFromServer: () => syncFromServer(),

  // --- Employees ---
  getEmployees: () => get(KEYS.EMPLOYEES),
  
  saveEmployee: (employee) => {
    const employees = get(KEYS.EMPLOYEES);
    const exists = employees.some(e => e.id === employee.id);
    if (exists) return { success: false, error: 'Employee ID already exists' };

    const nameExists = employees.some(e => e.name.toLowerCase() === employee.name.toLowerCase());
    if (nameExists) return { success: false, error: `Employee name "${employee.name}" is already registered in the system.` };

    const mobileExists = employees.some(e => e.mobile === employee.mobile);
    if (mobileExists) return { success: false, error: `Mobile number "${employee.mobile}" is already registered to another profile.` };
    
    // Ensure default password is set
    if (!employee.password) {
      employee.password = '123456';
    }

    // Set custom avatar if none provided
    if (!employee.avatar) {
      employee.avatar = AVATARS.UNKNOWN;
    }

    // Initialize multi-sample arrays if not present
    if (!employee.samples) {
      employee.samples = (employee.registeredPhotos || [employee.avatar]).map((img, idx) => ({
        id: `SAMP_${employee.id}_${idx + 1}`,
        vector: employee.biometrics?.vector || new Array(512).fill(0),
        avatar: img,
        quality: { blur: 15.0, brightness: 120, contrast: 45, eyeVisible: true, headYaw: 1.0, headPitch: 1.0, isPartial: false, passed: true },
        registeredAt: new Date().toISOString()
      }));
    }
    
    employees.push(employee);
    set(KEYS.EMPLOYEES, employees);
    
    dbService.logAction(
      'Employee Registration',
      'System Admin',
      null,
      JSON.stringify({ id: employee.id, name: employee.name }),
      `Registered employee ${employee.name} (${employee.id}) in ${employee.department} department.`
    );
    
    return { success: true };
  },

  addEmployeeSample: (employeeId, sample) => {
    const employees = get(KEYS.EMPLOYEES);
    const idx = employees.findIndex(e => e.id === employeeId);
    if (idx === -1) return { success: false, error: 'Employee not found' };
    
    const emp = employees[idx];
    if (!emp.samples) emp.samples = [];
    emp.samples.push(sample);
    
    // Recalculate average biometrics vector
    const vectors = emp.samples.map(s => s.vector);
    const centroidVector = new Array(512).fill(0);
    vectors.forEach(v => {
      for (let i = 0; i < 512; i++) {
        centroidVector[i] += v[i];
      }
    });
    for (let i = 0; i < 512; i++) {
      centroidVector[i] /= vectors.length;
    }
    if (!emp.biometrics) emp.biometrics = {};
    emp.biometrics.vector = centroidVector;
    
    emp.registeredPhotos = emp.samples.map(s => s.avatar);
    
    employees[idx] = emp;
    set(KEYS.EMPLOYEES, employees);
    
    dbService.logAction(
      'Enrollment Sample Added',
      'System Admin',
      null,
      JSON.stringify({ id: employeeId, sampleId: sample.id }),
      `Added new facial biometric sample ${sample.id} to employee ${emp.name} profile.`
    );
    
    return { success: true, employee: emp };
  },
  
  deleteEmployeeSample: (employeeId, sampleId) => {
    const employees = get(KEYS.EMPLOYEES);
    const idx = employees.findIndex(e => e.id === employeeId);
    if (idx === -1) return { success: false, error: 'Employee not found' };
    
    const emp = employees[idx];
    if (!emp.samples || emp.samples.length <= 1) {
      return { success: false, error: 'Cannot delete sample. Employees must have at least 1 biometric sample enrolled.' };
    }
    
    emp.samples = emp.samples.filter(s => s.id !== sampleId);
    
    // Recalculate average vector
    const vectors = emp.samples.map(s => s.vector);
    const centroidVector = new Array(512).fill(0);
    vectors.forEach(v => {
      for (let i = 0; i < 512; i++) {
        centroidVector[i] += v[i];
      }
    });
    for (let i = 0; i < 512; i++) {
      centroidVector[i] /= vectors.length;
    }
    if (!emp.biometrics) emp.biometrics = {};
    emp.biometrics.vector = centroidVector;
    
    emp.registeredPhotos = emp.samples.map(s => s.avatar);
    emp.avatar = emp.registeredPhotos[0];
    
    employees[idx] = emp;
    set(KEYS.EMPLOYEES, employees);
    
    dbService.logAction(
      'Enrollment Sample Removed',
      'System Admin',
      null,
      JSON.stringify({ id: employeeId, sampleId }),
      `Removed facial biometric sample ${sampleId} from employee ${emp.name} profile.`
    );
    
    return { success: true, employee: emp };
  },

  updateEmployee: (employeeId, updatedFields) => {
    const employees = get(KEYS.EMPLOYEES);
    const idx = employees.findIndex(e => e.id === employeeId);
    if (idx === -1) return { success: false, error: 'Employee not found' };
    
    const oldValue = JSON.stringify(employees[idx]);
    employees[idx] = { ...employees[idx], ...updatedFields };
    set(KEYS.EMPLOYEES, employees);
    
    dbService.logAction(
      'Employee Profile Update',
      'System Admin',
      oldValue,
      JSON.stringify(employees[idx]),
      `Updated employee fields for ${employees[idx].name} (${employeeId}).`
    );
    
    return { success: true };
  },

  deleteEmployee: (employeeId) => {
    const employees = get(KEYS.EMPLOYEES);
    const idx = employees.findIndex(e => e.id === employeeId);
    if (idx === -1) return { success: false, error: 'Employee not found' };
    
    const deleted = employees[idx];
    employees.splice(idx, 1);
    set(KEYS.EMPLOYEES, employees);
    
    dbService.logAction(
      'Employee Removal',
      'System Admin',
      JSON.stringify(deleted),
      null,
      `De-registered and deleted employee profile ${deleted.name} (${employeeId}).`
    );
    
    return { success: true };
  },

  // --- Attendance ---
  getAttendance: () => get(KEYS.ATTENDANCE),
  
  saveAttendance: (record) => {
    const attendance = get(KEYS.ATTENDANCE);
    const dateStr = new Date(record.checkInTime).toDateString();
    
    // Strictly prevent duplicate check-ins on the same calendar date
    const duplicate = attendance.some(a => 
      a.employeeId === record.employeeId && 
      new Date(a.checkInTime).toDateString() === dateStr
    );
    
    if (duplicate && record.employeeId !== 'UNKNOWN') {
      return { success: false, error: 'Employee has already checked in today.' };
    }
    
    // Set default telemetry scores if missing (e.g. legacy mocks)
    if (record.qualityScore === undefined) record.qualityScore = 95;
    if (record.livenessScore === undefined) record.livenessScore = 98;
    if (record.similarityScore === undefined) record.similarityScore = record.confidence || 90;
    
    attendance.push(record);
    set(KEYS.ATTENDANCE, attendance);
    
    dbService.logAction(
      'Attendance Creation',
      'System Engine',
      null,
      JSON.stringify({ id: record.id, employee: record.employeeName, time: record.checkInTime, lat: record.latitude, lon: record.longitude }),
      `Recorded check-in for ${record.employeeName}. Quality: ${record.qualityScore}%. Liveness: ${record.livenessScore}%. Confidence: ${record.confidence}%. Location Status: ${record.attendanceStatus}. Coords: ${record.latitude || 'N/A'}, ${record.longitude || 'N/A'}`
    );
    
    return { success: true, record };
  },

  updateAttendance: (recordId, updatedFields) => {
    const attendance = get(KEYS.ATTENDANCE);
    const idx = attendance.findIndex(a => a.id === recordId);
    if (idx === -1) return { success: false, error: 'Attendance record not found' };
    
    const oldValue = JSON.stringify(attendance[idx]);
    attendance[idx] = { ...attendance[idx], ...updatedFields };
    set(KEYS.ATTENDANCE, attendance);
    
    // If supervisor verified, log it!
    if (updatedFields.verificationStatus === 'Approved') {
      dbService.logAction(
        'Manual Verification',
        updatedFields.verifierName || 'Supervisor',
        oldValue,
        JSON.stringify(attendance[idx]),
        `Approved attendance logs for record ${recordId}. Assigned Employee ID: ${attendance[idx].employeeId}. Notes: ${updatedFields.verificationNotes || 'None'}`
      );
    } else if (updatedFields.verificationStatus === 'Rejected') {
      dbService.logAction(
        'Manual Rejection',
        updatedFields.verifierName || 'Supervisor',
        oldValue,
        null,
        `Rejected attendance logs for record ${recordId}. Employee ID: ${attendance[idx].employeeId}.`
      );
    } else {
      // General admin edits
      dbService.logAction(
        'Attendance Edit',
        updatedFields.verifierName || 'System Admin',
        oldValue,
        JSON.stringify(attendance[idx]),
        `Administrative edit of attendance record ${recordId}.`
      );
    }
    
    return { success: true };
  },

  deleteAttendance: (recordId) => {
    const attendance = get(KEYS.ATTENDANCE);
    const idx = attendance.findIndex(a => a.id === recordId);
    if (idx === -1) return { success: false, error: 'Attendance record not found' };
    
    const deleted = attendance[idx];
    attendance.splice(idx, 1);
    set(KEYS.ATTENDANCE, attendance);
    
    // Clean up associated photos if any
    const photos = get(KEYS.PHOTOS);
    const updatedPhotos = photos.filter(p => p.attendanceId !== recordId);
    set(KEYS.PHOTOS, updatedPhotos);
    
    dbService.logAction(
      'Attendance Deletion',
      'System Admin',
      JSON.stringify(deleted),
      null,
      `Deleted attendance record ${recordId} for employee ${deleted.employeeName} (${deleted.employeeId}).`
    );
    
    return { success: true };
  },

  // --- Photos ---
  getPhotos: () => get(KEYS.PHOTOS),
  
  savePhotos: (photoRecord) => {
    const photos = get(KEYS.PHOTOS);
    photos.push(photoRecord);
    set(KEYS.PHOTOS, photos);
    
    dbService.logAction(
      'Photo Upload',
      'System Engine',
      null,
      `Photo ID: ${photoRecord.id}, Attendance ID: ${photoRecord.attendanceId}`,
      `Uploaded and linked photographic evidence for attendance record ${photoRecord.attendanceId}.`
    );
  },

  // --- Audit Logs ---
  getAuditLogs: () => get(KEYS.AUDIT_LOGS),
  
  logAction: (actionType, user, oldValue, newValue, remarks) => {
    const logs = get(KEYS.AUDIT_LOGS);
    const log = {
      id: 'LOG' + Math.floor(100000 + Math.random() * 900000),
      actionType,
      user,
      timestamp: new Date().toISOString(),
      oldValue: oldValue ? String(oldValue) : null,
      newValue: newValue ? String(newValue) : null,
      ipAddress: '192.168.1.' + Math.floor(10 + Math.random() * 89),
      deviceInfo: navigator.userAgent.substring(0, 100),
      remarks
    };
    logs.push(log);
    set(KEYS.AUDIT_LOGS, logs);
  },

  // --- Auth & Credentials ---
  authenticate: (username, password) => {
    const cleanUsername = (username || '').toString().trim().toLowerCase();
    
    // 1. Check admin credentials
    if (cleanUsername === 'admin') {
      const superPwd = localStorage.getItem('wf_supervisor_password') || 'admin123';
      if (password === superPwd) {
        dbService.logAction(
          'Security Authentication',
          'System Admin',
          null,
          null,
          'Admin authenticated successfully.'
        );
        return { success: true, role: 'admin', user: { name: 'Admin Supervisor', id: 'admin' } };
      } else {
        return { success: false, error: 'Invalid admin password.' };
      }
    }

    // 2. Check employee credentials
    const employees = get(KEYS.EMPLOYEES);
    const emp = employees.find(e => {
      const sheetId = (e.id || '').toString().trim().toLowerCase();
      const sheetName = (e.name || '').toString().trim().toLowerCase();
      return sheetId === cleanUsername || sheetName === cleanUsername;
    });
    
    if (!emp) {
      return { success: false, error: 'User profile not found in system directory.' };
    }

    if (String(password) === String(emp.password || '123456')) {
      dbService.logAction(
        'Security Authentication',
        emp.name,
        null,
        null,
        `Employee ${emp.name} (${emp.id}) authenticated successfully.`
      );
      // Return the employee's own role (employee or supervisor)
      return { success: true, role: emp.role || 'employee', user: emp };
    }

    return { success: false, error: 'Incorrect credentials password.' };
  },

  changePassword: (userId, currentPassword, newPassword, isAdmin) => {
    if (isAdmin) {
      const superPwd = localStorage.getItem('wf_supervisor_password') || 'admin123';
      if (currentPassword !== superPwd) {
        return { success: false, error: 'Incorrect current password.' };
      }
      localStorage.setItem('wf_supervisor_password', newPassword);
      dbService.logAction(
        'Credentials Update',
        'System Admin',
        null,
        null,
        'Supervisor password updated successfully.'
      );
      return { success: true };
    } else {
      const employees = get(KEYS.EMPLOYEES);
      const idx = employees.findIndex(e => e.id === userId);
      if (idx === -1) return { success: false, error: 'Employee not found.' };

      const emp = employees[idx];
      const storedPwd = String(emp.password || '123456');
      if (String(currentPassword) !== storedPwd) {
        return { success: false, error: 'Incorrect current password.' };
      }

      emp.password = newPassword;
      employees[idx] = emp;
      set(KEYS.EMPLOYEES, employees);

      dbService.logAction(
        'Credentials Update',
        emp.name,
        null,
        null,
        `Employee ${emp.name} password updated successfully.`
      );
      return { success: true, employee: emp };
    }
  },

  // --- DB Initialization ---
  initialize: () => {
    // Force a fresh start clear if not already wiped
    if (!localStorage.getItem('wf_fresh_start_wipe_v5_arcface')) {
      localStorage.clear();
      localStorage.setItem('wf_fresh_start_wipe_v5_arcface', 'true');
    }

    if (!localStorage.getItem(KEYS.INITIALIZED)) {
      // Initialize admin default password
      if (!localStorage.getItem('wf_supervisor_password')) {
        localStorage.setItem('wf_supervisor_password', 'admin123');
      }
      // Initialize clean empty tables for manual enrollment
      set(KEYS.EMPLOYEES, []);
      set(KEYS.ATTENDANCE, []);
      set(KEYS.PHOTOS, []);

      const initialLogs = [
        {
          id: 'LOG0001',
          actionType: 'Database Initialization',
          user: 'System Engine',
          timestamp: new Date().toISOString(),
          oldValue: null,
          newValue: 'Clean Tables Created',
          ipAddress: '127.0.0.1',
          deviceInfo: 'Local Database Manager',
          remarks: 'Initialized clean, empty database tables. Ready for secure workforce registration.'
        }
      ];
      set(KEYS.AUDIT_LOGS, initialLogs);
      localStorage.setItem(KEYS.INITIALIZED, 'true');
    }

    // Always pull fresh data from backend on startup (background, non-blocking)
    syncFromServer();
  }
};

// ─── Background write mirrors ─────────────────────────────────────────────────
// After every localStorage write we also push to the backend so all devices
// share the same data. Failures are silent — localStorage remains the source of
// truth for the current session.

const _orig = { ...dbService };

dbService.saveEmployee = (employee) => {
  const result = _orig.saveEmployee(employee);
  if (result.success) apiCall('POST', '/api/employees', employee);
  return result;
};

dbService.updateEmployee = async (employeeId, updatedFields) => {
  if (API_BASE && API_BASE !== 'disabled') {
    const apiResult = await apiCall('PUT', `/api/employees/${employeeId}`, updatedFields);
    if (!apiResult || !apiResult.success) {
      return { success: false, error: apiResult?.error || 'Failed to update employee on the backend.' };
    }
  }
  return _orig.updateEmployee(employeeId, updatedFields);
};

dbService.deleteEmployee = (employeeId) => {
  const result = _orig.deleteEmployee(employeeId);
  if (result.success) apiCall('DELETE', `/api/employees/${employeeId}`);
  return result;
};

dbService.addEmployeeSample = (employeeId, sample) => {
  const result = _orig.addEmployeeSample(employeeId, sample);
  if (result.success) apiCall('POST', `/api/employees/${employeeId}/samples`, sample);
  return result;
};

dbService.deleteEmployeeSample = (employeeId, sampleId) => {
  const result = _orig.deleteEmployeeSample(employeeId, sampleId);
  if (result.success) apiCall('DELETE', `/api/employees/${employeeId}/samples/${sampleId}`);
  return result;
};

dbService.saveAttendance = (record) => {
  const result = _orig.saveAttendance(record);
  if (result.success) apiCall('POST', '/api/attendance', record);
  return result;
};

dbService.updateAttendance = (recordId, updatedFields) => {
  const result = _orig.updateAttendance(recordId, updatedFields);
  if (result.success) apiCall('PUT', `/api/attendance/${recordId}`, updatedFields);
  return result;
};

dbService.deleteAttendance = (recordId) => {
  const result = _orig.deleteAttendance(recordId);
  if (result.success) apiCall('DELETE', `/api/attendance/${recordId}`);
  return result;
};

const compressImageBase64 = (base64Str, maxChars = 48000) => {
  return new Promise((resolve) => {
    if (!base64Str || base64Str.length <= maxChars || !base64Str.startsWith('data:image')) {
      return resolve(base64Str);
    }

    const img = new Image();
    img.onload = () => {
      let width = img.width;
      let height = img.height;
      let quality = 0.8;
      
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      const attemptCompress = () => {
        canvas.width = width;
        canvas.height = height;
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        const result = canvas.toDataURL('image/jpeg', quality);
        
        if (result.length <= maxChars || (width < 60 && quality < 0.15)) {
          resolve(result);
        } else {
          width = Math.round(width * 0.90);
          height = Math.round(height * 0.90);
          quality = Math.max(0.1, quality - 0.1);
          attemptCompress();
        }
      };

      attemptCompress();
    };
    img.onerror = () => resolve(base64Str);
    img.src = base64Str;
  });
};

dbService.savePhotos = async (photoRecord) => {
  // Save original high quality photos locally first
  _orig.savePhotos(photoRecord);
  
  // Compress photos and send to backend
  try {
    const [compressedOriginal, compressedCropped] = await Promise.all([
      compressImageBase64(photoRecord.originalPhoto, 48000),
      compressImageBase64(photoRecord.croppedFace, 48000)
    ]);
    
    const recordToPost = {
      ...photoRecord,
      originalPhoto: compressedOriginal,
      croppedFace: compressedCropped
    };
    
    apiCall('POST', '/api/photos', recordToPost);
  } catch (error) {
    console.error('[dbService] Image compression failed, posting original:', error);
    apiCall('POST', '/api/photos', photoRecord);
  }
};

dbService.authenticate = (username, password) => {
  // Auth always goes to backend first when available, falls back to localStorage
  if (API_BASE) {
    return apiCall('POST', '/api/auth/login', { username, password })
      .then(res => res || _orig.authenticate(username, password));
  }
  return Promise.resolve(_orig.authenticate(username, password));
};

dbService.changePassword = (userId, currentPassword, newPassword, isAdmin) => {
  const result = _orig.changePassword(userId, currentPassword, newPassword, isAdmin);
  if (result.success) {
    apiCall('PUT', '/api/auth/password', { userId, currentPassword, newPassword, isAdmin });
  }
  return result;
};

dbService.logAction = (actionType, user, oldValue, newValue, remarks) => {
  const logs = get(KEYS.AUDIT_LOGS);
  const log = {
    id: 'LOG' + Math.floor(100000 + Math.random() * 900000),
    actionType,
    user,
    timestamp: new Date().toISOString(),
    oldValue: oldValue ? String(oldValue) : null,
    newValue: newValue ? String(newValue) : null,
    ipAddress: '192.168.1.' + Math.floor(10 + Math.random() * 89),
    deviceInfo: typeof navigator !== 'undefined' ? navigator.userAgent.substring(0, 100) : 'System Engine',
    remarks
  };
  logs.push(log);
  set(KEYS.AUDIT_LOGS, logs);
  apiCall('POST', '/api/audit-logs', log);
};


