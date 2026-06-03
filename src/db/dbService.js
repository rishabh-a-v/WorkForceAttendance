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

// Get items helper
const get = (key) => JSON.parse(localStorage.getItem(key)) || [];
const set = (key, data) => localStorage.setItem(key, JSON.stringify(data));

// Base DB Service
export const dbService = {
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
      employee.avatar = AVATARS[employee.id] || AVATARS.EMP001;
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
    // 1. Check admin credentials
    if (username.toLowerCase() === 'admin') {
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
    const emp = employees.find(e => e.id.toLowerCase() === username.toLowerCase() || e.name.toLowerCase() === username.toLowerCase());
    
    if (!emp) {
      return { success: false, error: 'User profile not found in system directory.' };
    }

    if (password === (emp.password || '123456')) {
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
      const storedPwd = emp.password || '123456';
      if (currentPassword !== storedPwd) {
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

    if (localStorage.getItem(KEYS.INITIALIZED)) return;
    
    // Initialize admin default password
    if (!localStorage.getItem('wf_supervisor_password')) {
      localStorage.setItem('wf_supervisor_password', 'admin123');
    }

    // Initialize clean empty tables for manual enrollment
    set(KEYS.EMPLOYEES, []);
    set(KEYS.ATTENDANCE, []);
    set(KEYS.PHOTOS, []);

    // Create a clean system audit log for database initialization
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
};
