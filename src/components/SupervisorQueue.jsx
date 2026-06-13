import { useState, useEffect } from 'react';
import { 
  ShieldAlert, 
  Search, 
  ShieldCheck, 
  ShieldX, 
  Download,
  AlertCircle
} from 'lucide-react';
import { dbService } from '../db/dbService';
import { compareBiometrics, generateBiometrics, recognizeFace } from '../utils/faceEngine';

export default function SupervisorQueue({ onActionTriggered }) {
  const [queueItems, setQueueItems] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [photos, setPhotos] = useState([]);
  
  // Selected Queue record details
  const [selectedRecord, setSelectedRecord] = useState(null);
  
  // Form Resolve fields
  const [selectedEmpId, setSelectedEmpId] = useState('');
  const [searchEmpQuery, setSearchEmpQuery] = useState('');
  const [verifierName, setVerifierName] = useState('Admin Supervisor');
  const [complianceNotes, setComplianceNotes] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  
  // Biometric comparison state
  const [activeComparison, setActiveComparison] = useState(null);

  async function loadDatabase() {
    await dbService.syncFromServer();
    const allAttendance = dbService.getAttendance();
    const reqReviews = allAttendance.filter(a => a.verificationStatus === 'Verification Required');
    setQueueItems(reqReviews);
    setEmployees(dbService.getEmployees());
    setPhotos(dbService.getPhotos());
    
    if (reqReviews.length > 0) {
      handleSelectRecord(reqReviews[0], allAttendance);
    } else {
      setSelectedRecord(null);
    }
  }

  useEffect(() => {
    Promise.resolve().then(() => {
      loadDatabase();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let active = true;
    if (selectedRecord && selectedEmpId) {
      const selectedEmp = employees.find(e => e.id === selectedEmpId);
      const recordPhoto = photos.find(p => p.attendanceId === selectedRecord.id);
      
      if (selectedEmp && recordPhoto && recordPhoto.croppedFace) {
        const img = new Image();
        img.onload = async () => {
          if (!active) return;
          const canvas = document.createElement('canvas');
          canvas.width = img.width || 120;
          canvas.height = img.height || 120;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          
          const recognition = await recognizeFace(canvas, [selectedEmp]);
          if (active) {
            setActiveComparison(recognition.report);
          }
        };
        img.src = recordPhoto.croppedFace;
      } else if (selectedEmp && selectedEmp.biometrics) {
        // Fallback to name-based generator if photo evidence is missing (e.g. legacy logs)
        const capturedBio = generateBiometrics(selectedRecord.employeeName, selectedRecord.employeeId === 'UNKNOWN');
        if (selectedRecord.employeeId === 'UNKNOWN' || selectedRecord.employeeId !== selectedEmpId) {
          capturedBio.pupilDistance = selectedEmp.biometrics.pupilDistance + 3.4;
          capturedBio.faceAspect = selectedEmp.biometrics.faceAspect - 0.08;
        }
        const report = compareBiometrics(selectedEmp.biometrics, capturedBio);
        Promise.resolve().then(() => {
          if (active) setActiveComparison(report);
        });
      } else {
        Promise.resolve().then(() => {
          if (active) setActiveComparison(null);
        });
      }
    } else {
      Promise.resolve().then(() => {
        if (active) setActiveComparison(null);
      });
    }
    return () => {
      active = false;
    };
  }, [selectedRecord, selectedEmpId, employees, photos]);



  function handleSelectRecord(record) {
    setSelectedRecord(record);
    setSelectedEmpId(record.employeeId !== 'UNKNOWN' ? record.employeeId : '');
    setSearchEmpQuery(record.employeeId !== 'UNKNOWN' ? record.employeeName : '');
    setComplianceNotes('');
  }

  const handleDropdownSelect = (emp) => {
    setSelectedEmpId(emp.id);
    setSearchEmpQuery(emp.name);
    setShowDropdown(false);
  };

  const handleResolve = (isApproved) => {
    if (!selectedRecord) return;
    
    if (!selectedEmpId && isApproved) {
      alert('You must assign a registered employee before approving attendance.');
      return;
    }

    if (isApproved) {
      const matchedEmp = employees.find(e => e.id === selectedEmpId);
      const resolvedName = matchedEmp ? matchedEmp.name : selectedRecord.employeeName;
      const resolvedId = matchedEmp ? matchedEmp.id : selectedRecord.employeeId;

      // Prevent duplicate logs for the same employee on the same date
      const today = new Date(selectedRecord.checkInTime).toDateString();
      const allLogs = dbService.getAttendance();
      const duplicate = allLogs.some(a => 
        a.employeeId === resolvedId && 
        new Date(a.checkInTime).toDateString() === today && 
        a.id !== selectedRecord.id
      );
      if (duplicate) {
        alert(`Approval rejected: ${resolvedName} already has an attendance log on this date.`);
        return;
      }

      const updatedData = {
        employeeId: resolvedId,
        employeeName: resolvedName,
        verificationStatus: 'Approved',
        verifierName,
        verificationNotes: complianceNotes,
        attendanceStatus: selectedRecord.attendanceStatus === 'GPS Unavailable' ? 'GPS Unavailable' : selectedRecord.attendanceStatus
      };

      // Update Attendance Relational logs
      dbService.updateAttendance(selectedRecord.id, updatedData);
    } else {
      // Rejection deletes the record so it is not logged in the attendance system
      dbService.deleteAttendance(selectedRecord.id);
    }

    // Refresh database queue states
    loadDatabase();
    
    // Notify parent app shell to update count badges
    if (onActionTriggered) {
      onActionTriggered();
    }
  };

  // Filter employees for lookup autocomplete dropdown
  const filteredEmployees = employees.filter(emp => 
    emp.name.toLowerCase().includes(searchEmpQuery.toLowerCase()) ||
    emp.id.toLowerCase().includes(searchEmpQuery.toLowerCase())
  );

  // Link photos to active records
  const getLinkedPhotos = (recordId) => {
    const ph = photos.find(p => p.attendanceId === recordId);
    return ph || { originalPhoto: '', croppedFace: '' };
  };

  const currentPhotos = selectedRecord ? getLinkedPhotos(selectedRecord.id) : null;

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 flex flex-col space-y-4 md:space-y-6">
      {/* Title Header */}
      <div>
        <h2 className="text-2xl font-display font-extrabold text-white tracking-tight flex items-center space-x-2">
          <ShieldAlert className="h-6.5 w-6.5 text-rose-500 animate-pulse" />
          <span>Supervisor Verification Queue</span>
        </h2>
        <p className="text-xs text-dark-400 mt-1">
          Review timecard check-ins flagged with low-confidence matching logs or geofencing violations.
        </p>
      </div>

      {queueItems.length === 0 ? (
        <div className="glass-panel p-12 rounded-3xl border border-dark-800 text-center flex flex-col items-center justify-center space-y-3.5 my-auto max-w-xl mx-auto">
          <ShieldCheck className="h-16 w-16 text-emerald-400 glow-green" />
          <h3 className="font-display font-extrabold text-lg text-white">Inbox Cleared!</h3>
          <p className="text-xs text-dark-400 leading-relaxed max-w-sm">
            All facial recognition marks and geofence locations have been verified or resolved. No pending items require supervisor review.
          </p>
        </div>
      ) : (
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8 overflow-visible lg:overflow-hidden min-h-[480px]">
          {/* Left Column: Triage List */}
          <div className="glass-panel p-4 rounded-2xl border border-dark-800/60 overflow-visible lg:overflow-hidden flex flex-col space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-display font-bold text-xs uppercase tracking-wider text-dark-300">
                Pending Reviews ({queueItems.length})
              </h4>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
              {queueItems.map((item) => {
                const isSelected = selectedRecord && selectedRecord.id === item.id;
                const linkedPhotos = getLinkedPhotos(item.id);
                return (
                  <button
                    key={item.id}
                    onClick={() => handleSelectRecord(item)}
                    className={`w-full p-3 rounded-xl border text-left flex items-center justify-between transition group ${
                      isSelected 
                        ? 'bg-dark-900 border-rose-500/50 glow-red' 
                        : 'bg-dark-900/10 border-dark-850 hover:border-dark-750'
                    }`}
                  >
                    <div className="flex items-center space-x-3 min-w-0">
                      <img 
                        src={linkedPhotos.croppedFace} 
                        className="w-9 h-9 rounded-lg object-cover border border-dark-800 flex-shrink-0"
                        alt="Triage Crop" 
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-white leading-tight truncate">{item.employeeName}</p>
                        <p className="text-[10px] text-dark-500 font-medium mt-0.5 font-mono">ID: {item.employeeId}</p>
                      </div>
                    </div>

                    <div className="text-right flex-shrink-0">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-bold border ${
                        item.confidence >= 70
                          ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                          : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                      }`}>
                        {item.confidence}% Match
                      </span>
                      <p className="text-[9px] text-dark-500 mt-1 font-semibold">
                        {new Date(item.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right 2 Columns: Detailed Resolution Panel */}
          {selectedRecord && currentPhotos && (
            <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6 overflow-visible lg:overflow-hidden">
              {/* Photo Evidence Viewers */}
              <div className="glass-panel p-5 rounded-2xl border border-dark-800/60 flex flex-col justify-between overflow-visible lg:overflow-hidden">
                <h4 className="font-display font-bold text-xs uppercase tracking-wider text-dark-300 border-b border-dark-900/80 pb-3">
                  Photographic Evidence Review
                </h4>

                <div className="flex-1 flex flex-col justify-center space-y-4 my-4">
                  <div className="relative aspect-[3/4] md:aspect-video bg-black rounded-xl border border-dark-800 overflow-hidden group">
                    <img 
                      src={currentPhotos.originalPhoto} 
                      className="w-full h-full object-cover" 
                      alt="Original capture proof" 
                    />
                    <span className="absolute bottom-2 left-2 bg-dark-950/80 border border-dark-800 text-white text-[9px] font-bold px-2 py-0.5 rounded-md">
                      Original Check-in Evidence Frame
                    </span>
                    <a 
                      href={currentPhotos.originalPhoto} 
                      download={`Checkin_evidence_${selectedRecord.id}.jpg`}
                      className="absolute top-2 right-2 p-1.5 bg-dark-950/80 border border-dark-800 hover:text-white rounded-md text-dark-400 transition"
                      title="Download full photograph"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </a>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="aspect-square bg-black rounded-xl border border-dark-800 overflow-hidden relative flex items-center justify-center">
                      <img 
                        src={currentPhotos.croppedFace} 
                        className="w-full h-full object-cover" 
                        alt="Segmented facial crop" 
                      />
                      <span className="absolute bottom-1.5 left-1.5 bg-dark-950/80 border border-dark-800 text-[8px] font-bold text-dark-300 px-1.5 py-0.5 rounded-md">
                        Segmented Facial Crop
                      </span>
                    </div>

                    {activeComparison ? (
                      /* Advanced parameter deviation grid (checking more parameters) */
                      <div className="bg-dark-900/30 p-3 rounded-xl border border-dark-800 flex flex-col justify-between text-[9px] overflow-y-auto">
                        <div className="space-y-1.5">
                          <p className="uppercase font-bold text-dark-400 text-[8px] tracking-wider flex items-center justify-between">
                            <span>Biometric Deviations</span>
                            <span className={`px-1.5 py-0.5 rounded text-[8px] border font-bold ${
                              activeComparison.matched
                                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                                : 'bg-rose-500/10 border-rose-500/20 text-rose-400 animate-pulse'
                            }`}>
                              {activeComparison.confidence}% Match
                            </span>
                          </p>
                          
                          <div className="divide-y divide-dark-900 space-y-1">
                            {activeComparison.parameters.map((p, idx) => (
                              <div key={idx} className="flex justify-between py-1 items-center">
                                <span className="text-dark-500 truncate max-w-[90px]">{p.name.replace(' (IPD)', '')}</span>
                                <div className="flex space-x-1.5 font-mono text-[8px]">
                                  <span className="text-dark-400">Reg: {p.registered}</span>
                                  <span className="text-white">Cap: {p.captured}</span>
                                  <span className={p.status === 'Match' ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                                    {p.status === 'Match' ? '✓' : '✗'}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* Default indicators fallback */
                      <div className="aspect-square rounded-xl border border-dark-800 bg-dark-900/10 p-3 flex flex-col justify-between text-xs">
                        <div>
                          <p className="text-[10px] uppercase font-bold text-dark-500">Validation Indicators</p>
                          <div className="space-y-2 mt-3">
                            <div>
                              <p className="text-[10px] text-dark-400">Confidence Score</p>
                              <p className={`font-bold mt-0.5 text-sm ${
                                selectedRecord.confidence >= 70 ? 'text-amber-400' : 'text-rose-400'
                              }`}>{selectedRecord.confidence}% similarity</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-dark-400">Perimeter GPS</p>
                              <p className="font-bold text-white mt-0.5">{selectedRecord.attendanceStatus}</p>
                              {(selectedRecord.checkInLatitude || selectedRecord.latitude) && (
                                <p className="text-[9px] text-dark-500 font-mono mt-0.5" title="Clock-In Location">
                                  In: {selectedRecord.checkInLatitude || selectedRecord.latitude}, {selectedRecord.checkInLongitude || selectedRecord.longitude}
                                </p>
                              )}
                              {selectedRecord.checkOutLatitude && (
                                <p className="text-[9px] text-dark-500 font-mono mt-0.5" title="Clock-Out Location">
                                  Out: {selectedRecord.checkOutLatitude}, {selectedRecord.checkOutLongitude}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                        
                        <div className={`p-2 rounded-lg border text-[9px] leading-normal flex items-start space-x-1 ${
                          selectedRecord.confidence < 70 
                            ? 'bg-rose-500/10 border-rose-500/20 text-rose-400 animate-pulse'
                            : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                        }`}>
                          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                          <span>
                            {selectedRecord.confidence < 70 
                              ? 'LOW MATCH: Requires lookup matching.'
                              : 'MEDIUM MATCH: Validate coordinates and confirm name.'
                            }
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Resolution Form */}
              <div className="glass-panel p-5 rounded-2xl border border-dark-800/60 flex flex-col justify-between overflow-visible lg:overflow-hidden">
                <div className="space-y-4 overflow-y-auto pr-1 flex-1 pb-4">
                  <h4 className="font-display font-bold text-xs uppercase tracking-wider text-dark-300 border-b border-dark-900/80 pb-3">
                    Verification Resolution Action
                  </h4>

                  {/* Record Details metadata */}
                  <div className="p-3 bg-dark-900/20 rounded-xl border border-dark-850 space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-dark-500">Record ID:</span>
                      <span className="font-bold font-mono text-white">{selectedRecord.id}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-dark-500">Registered Name:</span>
                      <span className="font-bold text-white">{selectedRecord.employeeName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-dark-500">Clock-In Time:</span>
                      <span className="font-bold text-white">
                        {new Date(selectedRecord.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div className="flex justify-between border-t border-dark-800 pt-1.5 mt-1.5">
                      <span className="text-dark-500">Quality Score:</span>
                      <span className={`font-bold ${selectedRecord.qualityScore >= 80 ? 'text-emerald-400' : 'text-amber-500'}`}>
                        {selectedRecord.qualityScore !== undefined ? `${selectedRecord.qualityScore}%` : 'N/A'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-dark-500">Liveness Score:</span>
                      <span className={`font-bold ${selectedRecord.livenessScore >= 75 ? 'text-emerald-400' : 'text-rose-450'}`}>
                        {selectedRecord.livenessScore !== undefined ? `${selectedRecord.livenessScore}%` : 'N/A'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-dark-500">Similarity Score:</span>
                      <span className={`font-bold ${selectedRecord.similarityScore >= 80 ? 'text-emerald-400' : 'text-amber-500'}`}>
                        {selectedRecord.similarityScore !== undefined ? `${selectedRecord.similarityScore}%` : 'N/A'}
                      </span>
                    </div>
                  </div>

                  {/* Autocomplete Search input */}
                  <div className="flex flex-col space-y-1 relative">
                    <label className="text-[10px] uppercase font-bold text-dark-400">Search and Assign Profile</label>
                    <div className="relative">
                      <Search className="absolute left-3 top-2.5 h-4 w-4 text-dark-500" />
                      <input
                        type="text"
                        placeholder="Search employee database..."
                        value={searchEmpQuery}
                        onChange={(e) => {
                          setSearchEmpQuery(e.target.value);
                          setShowDropdown(true);
                        }}
                        onFocus={() => setShowDropdown(true)}
                        className="w-full bg-dark-950/60 border border-dark-800 rounded-xl pl-9 pr-4 py-2 text-xs text-white focus:outline-none"
                      />
                    </div>

                    {/* Autocomplete Dropdown list */}
                    {showDropdown && searchEmpQuery && (
                      <div className="absolute top-full left-0 w-full bg-dark-950 border border-dark-800 rounded-xl mt-1 max-h-36 overflow-y-auto shadow-2xl z-30 divide-y divide-dark-900/50">
                        {filteredEmployees.map(emp => (
                          <button
                            key={emp.id}
                            type="button"
                            onClick={() => handleDropdownSelect(emp)}
                            className="w-full px-3.5 py-2 text-left text-xs hover:bg-dark-900 text-dark-200 hover:text-white flex items-center space-x-2 justify-between"
                          >
                            <span>{emp.name} ({emp.id})</span>
                            <span className="text-[9px] uppercase bg-dark-900 px-2 py-0.5 rounded text-dark-400 font-bold">{emp.department}</span>
                          </button>
                        ))}
                        {filteredEmployees.length === 0 && (
                          <div className="p-2.5 text-center text-xs text-dark-500">No matching employees found.</div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col space-y-1">
                    <label className="text-[10px] uppercase font-bold text-dark-400">Manual Verifier Name</label>
                    <input
                      type="text"
                      value={verifierName}
                      onChange={(e) => setVerifierName(e.target.value)}
                      className="custom-input text-xs"
                    />
                  </div>

                  <div className="flex flex-col space-y-1">
                    <label className="text-[10px] uppercase font-bold text-dark-400">Compliance Audit Notes</label>
                    <textarea
                      rows="3"
                      placeholder="Specify verification notes (e.g. Employee verified visually; GPS geofence bypassed due to loading yard reception drop)..."
                      value={complianceNotes}
                      onChange={(e) => setComplianceNotes(e.target.value)}
                      className="custom-input text-xs resize-none"
                    />
                  </div>
                </div>

                {/* Resolution buttons */}
                <div className="grid grid-cols-2 gap-4 border-t border-dark-900/80 pt-4">
                  <button
                    onClick={() => handleResolve(false)}
                    className="py-2.5 bg-rose-600/10 hover:bg-rose-600/20 border border-rose-500/20 text-rose-400 text-xs font-bold rounded-xl flex items-center justify-center space-x-1.5 transition duration-150"
                  >
                    <ShieldX className="h-4 w-4" />
                    <span>Reject Timecard</span>
                  </button>
                  
                  <button
                    onClick={() => handleResolve(true)}
                    className="py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl flex items-center justify-center space-x-1.5 shadow-lg glow-green transition duration-150"
                  >
                    <ShieldCheck className="h-4 w-4" />
                    <span>Approve & Save</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
