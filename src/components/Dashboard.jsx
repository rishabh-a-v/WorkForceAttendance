import { useState, useEffect } from 'react';
import { 
  Users, 
  Clock, 
  MapPin, 
  ShieldAlert, 
  Search, 
  Download, 
  TrendingUp, 
  AlertCircle,
  Calendar,
  CheckCircle,
  Check,
  Pencil
} from 'lucide-react';
import { dbService } from '../db/dbService';

export default function Dashboard() {
  const [employees, setEmployees] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState('All');
  const [selectedStatus, setSelectedStatus] = useState('All');
  const [selectedLocation, setSelectedLocation] = useState('All');

  // Edit log state variables
  const [editingRecord, setEditingRecord] = useState(null);
  const [editEmployeeId, setEditEmployeeId] = useState('');
  const [editCheckInTime, setEditCheckInTime] = useState('');
  const [editCheckOutTime, setEditCheckOutTime] = useState('');
  const [editConfidence, setEditConfidence] = useState(100);
  const [editQualityScore, setEditQualityScore] = useState(95);
  const [editLivenessScore, setEditLivenessScore] = useState(98);
  const [editSimilarityScore, setEditSimilarityScore] = useState(100);
  const [editLocationStatus, setEditLocationStatus] = useState('Valid Location');
  const [editVerificationStatus, setEditVerificationStatus] = useState('Approved');
  const [editNotes, setEditNotes] = useState('');
  const [editIsActiveShift, setEditIsActiveShift] = useState(false);

  const handleOpenEdit = (record) => {
    setEditingRecord(record);
    setEditEmployeeId(record.employeeId);
    
    const checkInDate = new Date(record.checkInTime);
    const offset = checkInDate.getTimezoneOffset();
    const localCheckIn = new Date(checkInDate.getTime() - offset * 60 * 1000).toISOString().slice(0, 16);
    setEditCheckInTime(localCheckIn);
    
    if (record.checkOutTime) {
      const checkOutDate = new Date(record.checkOutTime);
      const localCheckOut = new Date(checkOutDate.getTime() - offset * 60 * 1000).toISOString().slice(0, 16);
      setEditCheckOutTime(localCheckOut);
      setEditIsActiveShift(false);
    } else {
      setEditCheckOutTime('');
      setEditIsActiveShift(true);
    }
    
    setEditConfidence(record.confidence);
    setEditQualityScore(record.qualityScore !== undefined ? record.qualityScore : 95);
    setEditLivenessScore(record.livenessScore !== undefined ? record.livenessScore : 98);
    setEditSimilarityScore(record.similarityScore !== undefined ? record.similarityScore : record.confidence);
    setEditLocationStatus(record.attendanceStatus);
    setEditVerificationStatus(record.verificationStatus);
    setEditNotes(record.verificationNotes || '');
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingRecord) return;
    
    const targetEmp = employees.find(emp => emp.id === editEmployeeId);
    const employeeName = targetEmp ? targetEmp.name : (editEmployeeId === 'UNKNOWN' ? 'Unknown Face' : editingRecord.employeeName);
    
    // Prevent duplicate logs for the same employee on the same date
    if (editEmployeeId !== 'UNKNOWN' && editVerificationStatus !== 'Rejected') {
      const today = new Date(editCheckInTime).toDateString();
      const allLogs = await dbService.getAttendance();
      const duplicate = allLogs.some(a => 
        a.employeeId === editEmployeeId && 
        new Date(a.checkInTime).toDateString() === today && 
        a.id !== editingRecord.id
      );
      if (duplicate) {
        alert(`Save rejected: Employee ${employeeName} already has an attendance log on this date.`);
        return;
      }
    }

    const updatedFields = {
      employeeId: editEmployeeId,
      employeeName,
      checkInTime: new Date(editCheckInTime).toISOString(),
      checkOutTime: editIsActiveShift ? null : new Date(editCheckOutTime).toISOString(),
      confidence: parseInt(editConfidence, 10),
      qualityScore: parseInt(editQualityScore, 10),
      livenessScore: parseInt(editLivenessScore, 10),
      similarityScore: parseInt(editSimilarityScore, 10),
      attendanceStatus: editLocationStatus,
      verificationStatus: editVerificationStatus,
      verificationNotes: editNotes,
      verifierName: 'System Admin'
    };
    
    if (editVerificationStatus === 'Rejected') {
      if (confirm('Setting verification status to "Rejected" will delete this attendance record from the database. Proceed?')) {
        await dbService.deleteAttendance(editingRecord.id);
      } else {
        return;
      }
    } else {
      await dbService.updateAttendance(editingRecord.id, updatedFields);
    }
    
    setEditingRecord(null);
    setAttendance(await dbService.getAttendance());
  };

  const handleDeleteRecord = async (recordId) => {
    if (confirm(`Are you sure you want to delete attendance record ${recordId}? This action is irreversible.`)) {
      await dbService.deleteAttendance(recordId);
      setEditingRecord(null);
      setAttendance(await dbService.getAttendance());
    }
  };

  useEffect(() => {
    const load = async () => {
      await dbService.syncFromServer();
      setEmployees(dbService.getEmployees());
      setAttendance(dbService.getAttendance());
    };
    load();

    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  // Filter computations
  const departments = ['All', ...new Set(employees.map(e => e.department))];
  
  const filteredAttendance = attendance.filter(record => {
    const emp = employees.find(e => e.id === record.employeeId) || {};
    const matchesSearch = 
      record.employeeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      record.employeeId.toLowerCase().includes(searchTerm.toLowerCase());
      
    const matchesDept = selectedDept === 'All' || emp.department === selectedDept;
    
    const matchesStatus = 
      selectedStatus === 'All' || 
      record.verificationStatus === selectedStatus;
      
    const matchesLocation = 
      selectedLocation === 'All' || 
      record.attendanceStatus === selectedLocation ||
      (selectedLocation === 'GPS Captured' && record.attendanceStatus?.startsWith('GPS Captured'));

    return matchesSearch && matchesDept && matchesStatus && matchesLocation;
  });

  // Calculate high-level stats
  const totalStaff = employees.length;
  const presentToday = attendance.filter(a => {
    const today = new Date().toDateString();
    return new Date(a.checkInTime).toDateString() === today && a.employeeId !== 'UNKNOWN' && a.verificationStatus === 'Approved';
  }).length;
  
  const pendingReviews = attendance.filter(a => a.verificationStatus === 'Verification Required').length;
  
  const attendanceRate = totalStaff > 0 ? Math.round((presentToday / totalStaff) * 100) : 0;

  // Custom SVG Chart calculations
  const deptCounts = employees.reduce((acc, emp) => {
    acc[emp.department] = (acc[emp.department] || 0) + 1;
    return acc;
  }, {});

  const totalEmployees = Object.values(deptCounts).reduce((a, b) => a + b, 0);

  // Simulated CSV Download
  const handleCSVDownload = () => {
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Attendance ID,Employee ID,Employee Name,Check-In Time,Check-Out Time,Confidence,Quality,Liveness,Similarity,Location Status,Check-In Latitude,Check-In Longitude,Check-Out Latitude,Check-Out Longitude,Verification Status\n";
    
    filteredAttendance.forEach(a => {
      const q = a.qualityScore !== undefined ? `${a.qualityScore}%` : 'N/A';
      const l = a.livenessScore !== undefined ? `${a.livenessScore}%` : 'N/A';
      const s = a.similarityScore !== undefined ? `${a.similarityScore}%` : 'N/A';
      const checkInLat = a.checkInLatitude || a.latitude || '';
      const checkInLon = a.checkInLongitude || a.longitude || '';
      const checkOutLat = a.checkOutLatitude || '';
      const checkOutLon = a.checkOutLongitude || '';
      csvContent += `${a.id},${a.employeeId},${a.employeeName},${a.checkInTime},${a.checkOutTime || 'Active'},${a.confidence}%,${q},${l},${s},${a.attendanceStatus},${checkInLat},${checkInLon},${checkOutLat},${checkOutLon},${a.verificationStatus}\n`;
    });
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Workforce_Attendance_Report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-4 md:space-y-6">
      {/* Title Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-display font-extrabold text-white tracking-tight">
            Verification Dashboard
          </h2>
          <p className="text-xs text-dark-400 mt-1">
            Real-time visual monitoring of shift attendance, geolocations, and face credentials.
          </p>
        </div>
        <div className="flex items-center space-x-2 text-xs bg-dark-900 border border-dark-800 rounded-xl px-4 py-2 text-dark-300">
          <Calendar className="h-4 w-4 text-brand-400" />
          <span className="font-medium">{new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
        <div className="glass-card p-3.5 sm:p-5 rounded-2xl border border-dark-800 flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-[10px] uppercase font-bold tracking-wider text-dark-400">Total Workforce</p>
            <h3 className="text-2xl font-display font-extrabold text-white">{totalStaff}</h3>
            <p className="text-[9px] text-brand-400 flex items-center">
              <TrendingUp className="h-3 w-3 mr-0.5" /> Active in shift registry
            </p>
          </div>
          <div className="p-3 bg-brand-500/10 rounded-xl border border-brand-500/20 glow-blue text-brand-400">
            <Users className="h-6 w-6" />
          </div>
        </div>

        <div className="glass-card p-3.5 sm:p-5 rounded-2xl border border-dark-800 flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-[10px] uppercase font-bold tracking-wider text-dark-400">Present Today</p>
            <h3 className="text-2xl font-display font-extrabold text-emerald-400">{presentToday}</h3>
            <p className="text-[9px] text-emerald-500">● {attendanceRate}% Attendance Rate</p>
          </div>
          <div className="p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/20 glow-green text-emerald-400">
            <CheckCircle className="h-6 w-6" />
          </div>
        </div>

        <div className="glass-card p-3.5 sm:p-5 rounded-2xl border border-dark-800 flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-[10px] uppercase font-bold tracking-wider text-dark-400">Pending Approvals</p>
            <h3 className="text-2xl font-display font-extrabold text-rose-400">{pendingReviews}</h3>
            <p className="text-[9px] text-rose-500">⚠️ Flagged for supervisor review</p>
          </div>
          <div className="p-3 bg-rose-500/10 rounded-xl border border-rose-500/20 glow-red text-rose-400">
            <ShieldAlert className="h-6 w-6" />
          </div>
        </div>
      </div>

      {/* Interactive Analytics Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* SVG Circular Indicator Chart */}
        <div className="glass-card p-6 rounded-2xl border border-dark-800 flex flex-col justify-between items-center text-center">
          <h4 className="w-full text-left font-display font-bold text-xs uppercase tracking-wider text-dark-300">
            Shift Presence Rate
          </h4>
          
          <div className="relative my-4 flex items-center justify-center">
            {/* SVG Circle */}
            <svg className="w-36 h-36 transform -rotate-90">
              <circle
                cx="72"
                cy="72"
                r="60"
                stroke="rgba(255,255,255,0.03)"
                strokeWidth="12"
                fill="transparent"
              />
              <circle
                cx="72"
                cy="72"
                r="60"
                stroke="url(#blue-gradient)"
                strokeWidth="12"
                fill="transparent"
                strokeDasharray={377}
                strokeDashoffset={377 - (377 * Math.min(attendanceRate || 1, 100)) / 100}
                strokeLinecap="round"
                className="transition-all duration-1000 ease-out"
              />
              <defs>
                <linearGradient id="blue-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#38bdf8" />
                  <stop offset="100%" stopColor="#0c85e9" />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute flex flex-col items-center">
              <span className="text-3xl font-display font-extrabold text-white leading-none">{attendanceRate}%</span>
              <span className="text-[9px] uppercase font-bold text-dark-400 mt-1 tracking-wider">Present</span>
            </div>
          </div>

          <div className="w-full grid grid-cols-2 gap-2 text-xs">
            <div className="bg-dark-900/30 p-2.5 rounded-xl border border-dark-800/40">
              <p className="text-[10px] text-dark-500">Expected Shift</p>
              <p className="text-sm font-extrabold text-white mt-0.5">{totalStaff} Workers</p>
            </div>
            <div className="bg-dark-900/30 p-2.5 rounded-xl border border-dark-800/40">
              <p className="text-[10px] text-dark-500">Verified On-Site</p>
              <p className="text-sm font-extrabold text-emerald-400 mt-0.5">{presentToday} Workers</p>
            </div>
          </div>
        </div>

        {/* SVG Department Distribution Bar Chart */}
        <div className="glass-card p-6 rounded-2xl border border-dark-800 flex flex-col justify-between">
          <h4 className="font-display font-bold text-xs uppercase tracking-wider text-dark-300 mb-4">
            Department Allocation
          </h4>
          <div className="flex-1 flex flex-col justify-center space-y-4">
            {Object.keys(deptCounts).map((dept) => {
              const count = deptCounts[dept];
              const pct = totalEmployees > 0 ? Math.round((count / totalEmployees) * 100) : 0;
              return (
                <div key={dept} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-dark-200">{dept}</span>
                    <span className="font-bold text-white">{count} ({pct}%)</span>
                  </div>
                  <div className="w-full bg-dark-900 h-2.5 rounded-full overflow-hidden border border-dark-800/60">
                    <div 
                      style={{ width: `${pct}%` }} 
                      className="bg-gradient-to-r from-brand-500 to-brand-400 h-full rounded-full transition-all duration-1000 ease-out glow-blue"
                    ></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Real-time Ticker Feed */}
        <div className="glass-card p-6 rounded-2xl border border-dark-800 flex flex-col justify-between">
          <h4 className="font-display font-bold text-xs uppercase tracking-wider text-dark-300 mb-3 flex items-center justify-between">
            <span>Live Activity Ticker</span>
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
          </h4>
          <div className="flex-1 overflow-y-auto max-h-48 space-y-2.5 pr-1">
            {attendance.slice(-4).reverse().map((a) => (
              <div 
                key={a.id} 
                className="bg-dark-900/30 p-2.5 rounded-xl border border-dark-800/40 flex items-center justify-between hover:border-dark-700/60 transition duration-150"
              >
                <div className="flex items-center space-x-2.5 min-w-0">
                  <div className={`p-1.5 rounded-lg border text-xs leading-none ${
                    a.verificationStatus === 'Approved'
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                      : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                  }`}>
                    {a.verificationStatus === 'Approved' ? <Check className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-white truncate">{a.employeeName}</p>
                    <p className="text-[10px] text-dark-400 mt-0.5 truncate">
                      {new Date(a.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {a.id}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold text-brand-400">{a.confidence}%</p>
                  <p className="text-[9px] text-dark-500 uppercase font-bold tracking-wider mt-0.5">Confidence</p>
                </div>
              </div>
            ))}
            {attendance.length === 0 && (
              <p className="text-xs text-dark-500 text-center py-8">No clock-ins recorded today.</p>
            )}
          </div>
        </div>
      </div>

      {/* Main Attendance Logs Grid */}
      <div className="glass-panel p-6 rounded-2xl border border-dark-800/60 flex flex-col space-y-4">
        {/* Filter Toolbar */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
          <div className="flex items-center space-x-2">
            <h4 className="font-display font-extrabold text-sm text-white">Attendance Log Trail</h4>
            <span className="px-2 py-0.5 bg-dark-900 border border-dark-800 rounded-lg text-[10px] font-bold text-dark-400">
              {filteredAttendance.length} records
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-row items-center gap-3 w-full lg:w-auto">
            {/* Search Input */}
            <div className="relative col-span-1 sm:col-span-2 lg:flex-1 lg:min-w-[200px]">
              <Search className="absolute left-3.5 top-3 h-4 w-4 text-dark-500" />
              <input
                type="text"
                placeholder="Search Employee, ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-dark-950/60 border border-dark-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-dark-100 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/20"
              />
            </div>

            {/* Department Filter */}
            <select
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="bg-dark-950 border border-dark-800 rounded-xl px-3 py-2.5 text-xs text-dark-300 focus:outline-none focus:border-brand-500 w-full"
            >
              <option value="All">All Departments</option>
              {departments.filter(d => d !== 'All').map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>

            {/* Verification Status Filter */}
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="bg-dark-950 border border-dark-800 rounded-xl px-3 py-2.5 text-xs text-dark-300 focus:outline-none focus:border-brand-500 w-full"
            >
              <option value="All">All Verifications</option>
              <option value="Approved">Approved</option>
              <option value="Verification Required">Verification Required</option>
              <option value="Rejected">Rejected</option>
            </select>

            {/* GPS Status Filter */}
            <select
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
              className="bg-dark-950 border border-dark-800 rounded-xl px-3 py-2.5 text-xs text-dark-300 focus:outline-none focus:border-brand-500 w-full"
            >
              <option value="All">All Geolocations</option>
              <option value="GPS Captured">GPS Captured</option>
              <option value="Valid Location">Valid Location (Old)</option>
              <option value="Invalid Location">Invalid Location (Old)</option>
              <option value="GPS Unavailable">GPS Unavailable</option>
            </select>

            {/* Download Button */}
            <button
              onClick={handleCSVDownload}
              className="p-2.5 bg-brand-600 hover:bg-brand-500 text-white rounded-xl transition duration-150 shadow-md flex items-center justify-center glow-blue w-full lg:w-auto text-xs font-bold"
              title="Export filtered records to CSV"
            >
              <Download className="h-4 w-4 mr-1.5 lg:mr-0" />
              <span className="lg:hidden">Export CSV Report</span>
            </button>
          </div>
        </div>

        {/* Logs Table */}
        <div className="overflow-x-auto max-h-96 rounded-xl border border-dark-900/60 bg-dark-950/20">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="bg-dark-950/80 sticky top-0 border-b border-dark-900/80 text-dark-400 font-semibold">
              <tr>
                <th className="p-4 whitespace-nowrap">Record ID</th>
                <th className="p-4 whitespace-nowrap">Employee</th>
                <th className="p-4 whitespace-nowrap">Check-In Time</th>
                <th className="p-4 whitespace-nowrap">Check-Out Time</th>
                <th className="p-4 whitespace-nowrap">Accuracy</th>
                <th className="p-4 whitespace-nowrap">Quality</th>
                <th className="p-4 whitespace-nowrap">Liveness</th>
                <th className="p-4 whitespace-nowrap">Similarity</th>
                <th className="p-4 whitespace-nowrap">GPS Verification</th>
                <th className="p-4 whitespace-nowrap">Status</th>
                <th className="p-4 text-right whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-900/40 text-dark-200">
              {[...filteredAttendance]
                .sort((a, b) => new Date(b.checkInTime) - new Date(a.checkInTime))
                .map((record) => {
                  const checkInDate = new Date(record.checkInTime);
                const checkOutDate = record.checkOutTime ? new Date(record.checkOutTime) : null;
                
                return (
                  <tr key={record.id} className="hover:bg-dark-900/20 transition duration-100">
                    <td className="p-4 font-mono font-bold text-dark-400 whitespace-nowrap">{record.id}</td>
                    <td className="p-4">
                      <div className="flex items-center space-x-2.5">
                        <div className="relative flex-shrink-0">
                          <div className="w-8 h-8 rounded-full border border-dark-800 overflow-hidden bg-dark-900 flex items-center justify-center font-display font-extrabold text-xs text-brand-400">
                            {record.employeeId === 'UNKNOWN' ? '?' : record.employeeName.charAt(0)}
                          </div>
                        </div>
                        <div>
                          <p className="font-bold text-white leading-tight">{record.employeeName}</p>
                          <p className="text-[10px] text-dark-500 font-medium mt-0.5">ID: {record.employeeId}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 font-medium whitespace-nowrap">
                      {checkInDate.toLocaleDateString()} • {checkInDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </td>
                    <td className="p-4 font-medium text-dark-400 whitespace-nowrap">
                      {checkOutDate 
                        ? `${checkOutDate.toLocaleDateString()} • ${checkOutDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` 
                        : <span className="text-[10px] bg-brand-500/10 border border-brand-500/20 text-brand-400 px-2 py-0.5 rounded-full font-bold">Active Shift</span>
                      }
                    </td>
                    <td className="p-4 whitespace-nowrap">
                      <div className="flex items-center space-x-1.5">
                        <span className={`font-bold ${
                          record.confidence >= 80 
                            ? 'text-emerald-400' 
                            : record.confidence >= 65 
                              ? 'text-amber-400' 
                              : 'text-rose-400'
                        }`}>{record.confidence}%</span>
                        <div className="w-12 bg-dark-900 h-1.5 rounded-full overflow-hidden border border-dark-800">
                          <div 
                            style={{ width: `${record.confidence}%` }} 
                            className={`h-full rounded-full ${
                              record.confidence >= 80 
                                ? 'bg-emerald-500 glow-green' 
                                : record.confidence >= 65 
                                  ? 'bg-amber-500 glow-yellow' 
                                  : 'bg-rose-500 glow-red'
                            }`}
                          ></div>
                        </div>
                      </div>
                    </td>
                    <td className={`p-4 font-bold ${record.qualityScore >= 80 ? 'text-emerald-400' : 'text-amber-500'} whitespace-nowrap`}>
                      {record.qualityScore !== undefined ? `${record.qualityScore}%` : 'N/A'}
                    </td>
                    <td className={`p-4 font-bold ${record.livenessScore >= 75 ? 'text-emerald-400' : 'text-amber-500'} whitespace-nowrap`}>
                      {record.livenessScore !== undefined ? `${record.livenessScore}%` : 'N/A'}
                    </td>
                    <td className={`p-4 font-bold ${record.similarityScore >= 80 ? 'text-emerald-400' : 'text-amber-500'} whitespace-nowrap`}>
                      {record.similarityScore !== undefined ? `${record.similarityScore}%` : 'N/A'}
                    </td>
                    <td className="p-4 whitespace-nowrap">
                      <div className="flex flex-col space-y-1">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border w-max ${
                          record.attendanceStatus === 'Valid Location' || record.attendanceStatus?.startsWith('GPS Captured')
                            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                            : record.attendanceStatus === 'Invalid Location'
                              ? 'bg-rose-500/10 border-rose-500/20 text-rose-400 animate-pulse'
                              : 'bg-dark-900 border-dark-800 text-dark-400'
                        }`} title={record.latitude ? `Lat: ${record.latitude}, Lon: ${record.longitude}` : 'No GPS Data'}>
                          <MapPin className="h-3 w-3 mr-1" />
                          {record.attendanceStatus}
                        </span>
                        {(record.checkInLatitude || record.latitude) && (
                          <span className="text-[9px] text-dark-500 font-mono tracking-tighter" title="Clock-In Location">
                            In: {record.checkInLatitude || record.latitude}, {record.checkInLongitude || record.longitude}
                          </span>
                        )}
                        {record.checkOutLatitude && (
                          <span className="text-[9px] text-dark-500 font-mono tracking-tighter" title="Clock-Out Location">
                            Out: {record.checkOutLatitude}, {record.checkOutLongitude}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                        record.verificationStatus === 'Approved'
                          ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                          : record.verificationStatus === 'Verification Required'
                            ? 'bg-rose-500/10 border-rose-500/20 text-rose-400 animate-pulse'
                            : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                      }`}>
                        {record.verificationStatus}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <button
                        onClick={() => handleOpenEdit(record)}
                        className="p-1.5 bg-dark-900 hover:bg-dark-800 border border-dark-800 rounded-lg text-brand-400 hover:text-brand-300 transition inline-flex items-center justify-center"
                        title="Edit attendance log"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filteredAttendance.length === 0 && (
                <tr>
                  <td colSpan="11" className="text-center py-10 text-dark-500">
                    No matching attendance logs found. Try altering your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sleek Admin Edit Modal */}
      {editingRecord && (
        <div className="fixed inset-0 bg-dark-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-panel w-full max-w-lg rounded-2xl border border-dark-800/80 p-6 space-y-4 animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-dark-900 pb-3">
              <h3 className="text-sm font-display font-extrabold text-white flex items-center space-x-2">
                <Pencil className="h-4.5 w-4.5 text-brand-400" />
                <span>Admin Attendance Log Editor</span>
              </h3>
              <span className="text-[10px] font-mono bg-dark-900 border border-dark-850 px-2 py-0.5 rounded text-dark-400 font-bold">
                {editingRecord.id}
              </span>
            </div>
            
            <form onSubmit={handleSaveEdit} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-4">
                {/* Employee Selector */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-dark-400 uppercase">Employee Profile</label>
                  <select
                    value={editEmployeeId}
                    onChange={(e) => setEditEmployeeId(e.target.value)}
                    className="w-full bg-dark-950 border border-dark-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-brand-500"
                  >
                    <option value="UNKNOWN">Unknown Face</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.name} ({emp.id})</option>
                    ))}
                  </select>
                </div>
                
                {/* Accuracy Confidence */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-dark-400 uppercase">Confidence Score (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={editConfidence}
                    onChange={(e) => setEditConfidence(e.target.value)}
                    className="w-full bg-dark-950 border border-dark-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-500"
                    required
                  />
                </div>
              </div>

              {/* Advanced Biometrics Telemetry Edit Fields */}
              <div className="grid grid-cols-3 gap-4">
                {/* Quality Score */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-dark-400 uppercase">Quality Score (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={editQualityScore}
                    onChange={(e) => setEditQualityScore(e.target.value)}
                    className="w-full bg-dark-950 border border-dark-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-500"
                    required
                  />
                </div>
                
                {/* Liveness Score */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-dark-400 uppercase">Liveness Score (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={editLivenessScore}
                    onChange={(e) => setEditLivenessScore(e.target.value)}
                    className="w-full bg-dark-950 border border-dark-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-500"
                    required
                  />
                </div>

                {/* Similarity Score */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-dark-400 uppercase">Similarity Score (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={editSimilarityScore}
                    onChange={(e) => setEditSimilarityScore(e.target.value)}
                    className="w-full bg-dark-950 border border-dark-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-500"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Check-In time */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-dark-400 uppercase">Check-In Time</label>
                  <input
                    type="datetime-local"
                    value={editCheckInTime}
                    onChange={(e) => setEditCheckInTime(e.target.value)}
                    className="w-full bg-dark-950 border border-dark-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-500"
                    required
                  />
                </div>
                
                {/* Check-Out time */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] font-bold text-dark-400 uppercase">Check-Out Time</label>
                    <label className="flex items-center space-x-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editIsActiveShift}
                        onChange={(e) => setEditIsActiveShift(e.target.checked)}
                        className="rounded border-dark-800 bg-dark-950 text-brand-600 focus:ring-0 focus:ring-offset-0 h-3 w-3"
                      />
                      <span className="text-[9px] text-brand-400 font-bold">Active Shift</span>
                    </label>
                  </div>
                  <input
                    type="datetime-local"
                    value={editCheckOutTime}
                    onChange={(e) => setEditCheckOutTime(e.target.value)}
                    disabled={editIsActiveShift}
                    className="w-full bg-dark-950 border border-dark-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-500 disabled:opacity-30 disabled:cursor-not-allowed"
                    required={!editIsActiveShift}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* GPS Location Status */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-dark-400 uppercase">Perimeter Verification</label>
                  <select
                    value={editLocationStatus}
                    onChange={(e) => setEditLocationStatus(e.target.value)}
                    className="w-full bg-dark-950 border border-dark-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-brand-500"
                  >
                    <option value="Valid Location">Valid Location</option>
                    <option value="Invalid Location">Invalid Location</option>
                    <option value="GPS Unavailable">GPS Unavailable</option>
                  </select>
                </div>
                
                {/* Approval Status */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-dark-400 uppercase">Approval Status</label>
                  <select
                    value={editVerificationStatus}
                    onChange={(e) => setEditVerificationStatus(e.target.value)}
                    className="w-full bg-dark-950 border border-dark-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-brand-500"
                  >
                    <option value="Approved">Approved</option>
                    <option value="Verification Required">Verification Required</option>
                    <option value="Rejected">Rejected (Will Delete Log)</option>
                  </select>
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-dark-400 uppercase">Audit Override Notes</label>
                <textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Provide brief justification for this administrative edit log change..."
                  className="w-full bg-dark-950 border border-dark-800 rounded-xl px-3 py-2 text-xs text-white h-16 resize-none focus:outline-none focus:border-brand-500"
                />
              </div>

              {/* Actions Footer */}
              <div className="flex items-center justify-between border-t border-dark-900 pt-4 mt-2">
                <button
                  type="button"
                  onClick={() => handleDeleteRecord(editingRecord.id)}
                  className="px-4 py-2 bg-rose-600/10 hover:bg-rose-600/20 border border-rose-500/20 text-rose-400 rounded-xl font-bold transition duration-150"
                >
                  Delete Record
                </button>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => setEditingRecord(null)}
                    className="px-4 py-2 bg-dark-900 hover:bg-dark-800 border border-dark-800 text-dark-300 rounded-xl font-bold transition duration-150"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-xl font-bold transition duration-150 glow-blue"
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
