/**
 * apiService.js
 * HTTP client that mirrors every dbService method, calling the local backend instead
 * of reading/writing localStorage. The frontend imports THIS instead of dbService when
 * VITE_API_URL is set.
 */

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const api = async (method, path, body) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return res.json();
};

// ─── Worksite (loaded once, then cached) ─────────────────────────────────────
let _worksite = null;

const getWorksite = async () => {
  if (!_worksite) {
    _worksite = await api('GET', '/api/config/worksite');
  }
  return _worksite;
};

// Export a reactive WORKSITE object (populated on first use)
export const WORKSITE = {
  LATITUDE: 12.9716,
  LONGITUDE: 77.5946,
  RADIUS_METERS: 250,
};

// Hydrate WORKSITE on module load
api('GET', '/api/config/worksite').then(ws => {
  if (ws && ws.latitude) {
    WORKSITE.LATITUDE = ws.latitude;
    WORKSITE.LONGITUDE = ws.longitude;
    WORKSITE.RADIUS_METERS = ws.radiusMeters;
  }
}).catch(() => {});

export const updateWorksiteCoords = async (lat, lon) => {
  const ws = await api('PUT', '/api/config/worksite', {
    latitude: parseFloat(lat),
    longitude: parseFloat(lon),
    radiusMeters: WORKSITE.RADIUS_METERS,
  });
  if (ws && ws.worksite) {
    WORKSITE.LATITUDE = ws.worksite.latitude;
    WORKSITE.LONGITUDE = ws.worksite.longitude;
  }
};

// ─── dbService API mirror ─────────────────────────────────────────────────────
export const dbService = {
  // --- Employees ---
  getEmployees: async () => api('GET', '/api/employees'),

  saveEmployee: async (employee) => api('POST', '/api/employees', employee),

  updateEmployee: async (employeeId, updatedFields) =>
    api('PUT', `/api/employees/${employeeId}`, updatedFields),

  deleteEmployee: async (employeeId) =>
    api('DELETE', `/api/employees/${employeeId}`),

  addEmployeeSample: async (employeeId, sample) =>
    api('POST', `/api/employees/${employeeId}/samples`, sample),

  deleteEmployeeSample: async (employeeId, sampleId) =>
    api('DELETE', `/api/employees/${employeeId}/samples/${sampleId}`),

  // --- Attendance ---
  getAttendance: async () => api('GET', '/api/attendance'),

  saveAttendance: async (record) => api('POST', '/api/attendance', record),

  updateAttendance: async (recordId, updatedFields) =>
    api('PUT', `/api/attendance/${recordId}`, updatedFields),

  deleteAttendance: async (recordId) =>
    api('DELETE', `/api/attendance/${recordId}`),

  // --- Photos ---
  getPhotos: async () => api('GET', '/api/photos'),

  savePhotos: async (photoRecord) => api('POST', '/api/photos', photoRecord),

  // --- Audit Logs ---
  getAuditLogs: async () => api('GET', '/api/audit-logs'),

  logAction: async (actionType, user, oldValue, newValue, remarks) => {
    // Fire-and-forget; audit logs are also written server-side per action
    api('POST', '/api/audit-logs', { actionType, user, oldValue, newValue, remarks }).catch(() => {});
  },

  // --- Auth ---
  authenticate: async (username, password) =>
    api('POST', '/api/auth/login', { username, password }),

  changePassword: async (userId, currentPassword, newPassword, isAdmin) =>
    api('PUT', '/api/auth/password', { userId, currentPassword, newPassword, isAdmin }),

  // No-op initialize (server handles init)
  initialize: () => {},
};
