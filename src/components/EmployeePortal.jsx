import React, { useState, useEffect, useRef } from 'react';
import { 
  Camera, 
  MapPin, 
  CheckCircle, 
  AlertCircle, 
  HelpCircle,
  Clock, 
  UserCheck, 
  UserMinus,
  Video,
  XCircle,
  Check,
  Users,
  ShieldCheck,
  RefreshCw,
  LogOut,
  User,
  Search,
  Bell,
  Zap,
  ZapOff
} from 'lucide-react';
import { dbService, WORKSITE } from '../db/dbService';
import { 
  calculateDistanceInMeters, 
  cropFaceFromCanvas, 
  compareBiometrics, 
  generateBiometrics, 
  recognizeFace, 
  detectFaceInCanvas,
  loadFaceApiModels,
  assessFaceQuality,
  alignAndCropFace,
  calculateMultiFrameLiveness,
  getFaceDescriptor,
  extractBiometricsFromCanvas,
  drawImageProp,
  getNormalFrontCameraDeviceId
} from '../utils/faceEngine';

export default function EmployeePortal({ currentUser, onLogout }) {
  const [employees, setEmployees] = useState([]);
  const [activeEmployee, setActiveEmployee] = useState(null);
  const [personalLogs, setPersonalLogs] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Camera & Scanner States
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isCheckIn, setIsCheckIn] = useState(true);
  const [scanImage, setScanImage] = useState(null);
  const [facingMode, setFacingMode] = useState('user'); // 'user' (front) or 'environment' (back)
  const [scanStatusMsg, setScanStatusMsg] = useState('Position your face in the viewfinder...');
  const [hasTorch, setHasTorch] = useState(false);
  const [isTorchOn, setIsTorchOn] = useState(false);
  
  const rollingFramesRef = useRef([]);
  const scanLoopActive = useRef(false);
  const gpsDataRef = useRef(gpsData);
  const isCheckInRef = useRef(isCheckIn);
  const activeEmployeeRef = useRef(activeEmployee);
  const logCountRef = useRef(0);

  useEffect(() => {
    gpsDataRef.current = gpsData;
  }, [gpsData]);

  useEffect(() => {
    isCheckInRef.current = isCheckIn;
  }, [isCheckIn]);

  useEffect(() => {
    activeEmployeeRef.current = activeEmployee;
  }, [activeEmployee]);

  useEffect(() => {
    return () => {
      scanLoopActive.current = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);
  
  // Live Notifications
  const [toastMessage, setToastMessage] = useState(null);
  
  // GPS State
  const [gpsData, setGpsData] = useState(null);
  const [gpsLoading, setGpsLoading] = useState(false);

  // Change Password States
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSuccessMsg, setPasswordSuccessMsg] = useState('');
  const [passwordErrorMsg, setPasswordErrorMsg] = useState('');

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const canvasRef = useRef(null);
  const logCountRef = useRef(0);

  useEffect(() => {
    // Hydrate active profiles and logs
    const allEmps = dbService.getEmployees();
    setEmployees(allEmps);

    if (currentUser) {
      setActiveEmployee(currentUser);
    } else {
      const savedLoginId = localStorage.getItem('wf_employee_login');
      if (savedLoginId) {
        const matched = allEmps.find(e => e.id === savedLoginId);
        if (matched) {
          setActiveEmployee(matched);
        }
      }
    }

    // Pre-load deep learning face-api models
    loadFaceApiModels().catch(err => {
      console.error('Failed to pre-load face-api models:', err);
    });

    fetchLocation();

    return () => {
      handleStopCamera();
    };
  }, [currentUser]);

  // Update logs when activeEmployee changes, and start live sync polling
  useEffect(() => {
    if (!activeEmployee) {
      setPersonalLogs([]);
      return;
    }

    const refreshLogs = () => {
      const allLogs = dbService.getAttendance();
      const filtered = allLogs.filter(a => a.employeeId === activeEmployee.id);
      
      setPersonalLogs(prev => {
        // If the log count increases or values update, let the employee know!
        if (logCountRef.current > 0 && filtered.length > logCountRef.current) {
          // Find the newly added log
          const latest = filtered[filtered.length - 1];
          showToast(`Attendance marked! Status: ${latest.verificationStatus} (${latest.attendanceStatus})`);
        } else if (logCountRef.current > 0) {
          // Check if any status updated from "Verification Required" to "Approved"
          filtered.forEach(currentLog => {
            const prevLog = prev.find(p => p.id === currentLog.id);
            if (prevLog && prevLog.verificationStatus !== currentLog.verificationStatus) {
              showToast(`Log ${currentLog.id} status updated to ${currentLog.verificationStatus}!`);
            }
          });
        }
        logCountRef.current = filtered.length;
        return filtered;
      });
    };

    refreshLogs();

    // 1. Live Sync Poller: checks every 2 seconds
    const interval = setInterval(refreshLogs, 2000);

    // 2. Storage Event Listener: syncs cross-tab updates instantly
    const handleStorageChange = (e) => {
      if (e.key === 'wf_attendance' || e.key === null) {
        refreshLogs();
      }
    };
    window.addEventListener('storage', handleStorageChange);

    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [activeEmployee]);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 5000);
  };

  const handleLogin = (emp) => {
    setActiveEmployee(emp);
    localStorage.setItem('wf_employee_login', emp.id);
    logCountRef.current = 0;
    showToast(`Logged in successfully as ${emp.name}`);
  };

  const handleLogout = () => {
    handleStopCamera();
    setActiveEmployee(null);
    localStorage.removeItem('wf_employee_login');
    if (onLogout) {
      onLogout();
    }
  };

  const fetchLocation = () => {
    setGpsLoading(true);
    setGpsData(null);

    if (!navigator.geolocation) {
      setGpsData({ lat: null, lon: null, distance: Infinity, status: 'GPS Unavailable' });
      setGpsLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const dist = calculateDistanceInMeters(latitude, longitude, WORKSITE.LATITUDE, WORKSITE.LONGITUDE);
        setGpsData({
          lat: latitude.toFixed(6),
          lon: longitude.toFixed(6),
          distance: dist,
          status: dist <= WORKSITE.RADIUS_METERS ? 'Valid Location' : 'Invalid Location'
        });
        setGpsLoading(false);
      },
      (error) => {
        setGpsData({ lat: null, lon: null, distance: Infinity, status: 'GPS Unavailable' });
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleStartCamera = async (currentFacingMode = facingMode) => {
    try {
      setErrorMsg('');
      setSuccessMsg('');
      setScanImage(null);
      setIsCameraActive(true);
      setIsScanning(true);
      setScanStatusMsg('Initializing webcam...');
      rollingFramesRef.current = [];
      
      const constraints = {
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 }
        }
      };

      if (currentFacingMode === 'user') {
        const devId = await getNormalFrontCameraDeviceId();
        if (devId) {
          constraints.video.deviceId = { exact: devId };
        } else {
          constraints.video.facingMode = 'user';
        }
      } else {
        constraints.video.facingMode = currentFacingMode;
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      // Check torch/flash capabilities for environment-facing camera
      let supportsTorch = false;
      const track = stream.getVideoTracks()[0];
      if (track && currentFacingMode === 'environment') {
        try {
          const capabilities = track.getCapabilities ? track.getCapabilities() : {};
          supportsTorch = !!capabilities.torch;
        } catch (e) {
          console.warn("Torch capability check failed:", e);
        }
      }
      setHasTorch(supportsTorch);
      setIsTorchOn(false);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onplay = () => {
          scanLoopActive.current = true;
          setScanStatusMsg('Aligning camera... please face the camera');
          runAutoScanLoop();
        };
        videoRef.current.play();
      }
    } catch (error) {
      console.error(error);
      setErrorMsg('Webcam stream is unavailable. Please verify browser camera permissions.');
      setIsCameraActive(false);
      setIsScanning(false);
    }
  };

  const toggleFacingMode = () => {
    const nextMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(nextMode);
    if (isCameraActive) {
      handleStopCamera();
      setTimeout(() => {
        handleStartCamera(nextMode);
      }, 100);
    }
  };

  const handleStopCamera = () => {
    scanLoopActive.current = false;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
    setHasTorch(false);
    setIsTorchOn(false);
  };

  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (!track) return;
    try {
      const nextTorchState = !isTorchOn;
      await track.applyConstraints({
        advanced: [{ torch: nextTorchState }]
      });
      setIsTorchOn(nextTorchState);
    } catch (err) {
      console.error("Failed to toggle torch:", err);
    }
  };

  const runAutoScanLoop = async () => {
    if (!scanLoopActive.current || !videoRef.current || !canvasRef.current || !activeEmployeeRef.current) {
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (video.videoWidth === 0 || video.videoHeight === 0) {
      setTimeout(runAutoScanLoop, 150);
      return;
    }

    // Create a temporary canvas at full video resolution to detect the face
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = video.videoWidth || 640;
    tempCanvas.height = video.videoHeight || 480;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height);

    const faceBox = await detectFaceInCanvas(tempCanvas);

    canvas.width = 400;
    canvas.height = 400;

    if (faceBox && faceBox.landmarks) {
      const padW = faceBox.w * 0.3;
      const padH = faceBox.h * 0.3;
      const cropX = Math.max(0, faceBox.x - padW / 2);
      const cropY = Math.max(0, faceBox.y - padH / 2);
      const cropW = Math.min(tempCanvas.width - cropX, faceBox.w + padW);
      const cropH = Math.min(tempCanvas.height - cropY, faceBox.h + padH);
      ctx.drawImage(tempCanvas, cropX, cropY, cropW, cropH, 0, 0, 400, 400);
    } else {
      const sourceSize = Math.min(tempCanvas.width, tempCanvas.height);
      const sourceX = (tempCanvas.width - sourceSize) / 2;
      const sourceY = (tempCanvas.height - sourceSize) / 2;
      ctx.drawImage(tempCanvas, sourceX, sourceY, sourceSize, sourceSize, 0, 0, 400, 400);
    }

    const frameCanvas = document.createElement('canvas');
    frameCanvas.width = 400;
    frameCanvas.height = 400;
    frameCanvas.getContext('2d').drawImage(canvas, 0, 0);
    rollingFramesRef.current.push(frameCanvas);
    if (rollingFramesRef.current.length > 5) {
      rollingFramesRef.current.shift();
    }

    try {
      const localFaceBox = await detectFaceInCanvas(canvas);
      if (!localFaceBox || !localFaceBox.landmarks) {
        setScanStatusMsg('Aligning camera... position your face');
        setTimeout(runAutoScanLoop, 300);
        return;
      }

      const quality = assessFaceQuality(canvas, localFaceBox, localFaceBox.landmarks);
      if (!quality.passed) {
        setScanStatusMsg(`Hold still: ${quality.reason}`);
        setTimeout(runAutoScanLoop, 300);
        return;
      }

      const alignedCanvas = alignAndCropFace(canvas, localFaceBox.landmarks || localFaceBox);
      const cropBase64 = alignedCanvas.toDataURL('image/jpeg', 0.85);

      const imgDescriptor = await getFaceDescriptor(alignedCanvas);
      if (!imgDescriptor) {
        setScanStatusMsg('Calibrating biometrics... sit still');
        setTimeout(runAutoScanLoop, 300);
        return;
      }

      const samplesList = activeEmployeeRef.current.samples || [
        {
          id: `SAMP_${activeEmployeeRef.current.id}_1`,
          vector: activeEmployeeRef.current.biometrics?.vector || new Array(512).fill(0),
          avatar: activeEmployeeRef.current.avatar
        }
      ];

      const sampleMatchResults = samplesList.map(sample => {
        if (!sample.vector) return { distance: Infinity, cosine: -1 };
        const norm = (v) => {
          const s = Math.sqrt(v.reduce((sum, val) => sum + val * val, 0));
          return s > 0 ? v.map(val => val / s) : v;
        };
        const v1 = norm(imgDescriptor);
        const v2 = norm(sample.vector);
        let sumSq = 0;
        let dot = 0;
        for (let i = 0; i < v1.length; i++) {
          sumSq += Math.pow(v1[i] - v2[i], 2);
          dot += v1[i] * v2[i];
        }
        return { distance: Math.sqrt(sumSq), cosine: dot };
      });

      let minDistance = Infinity;
      let maxCosine = -Infinity;
      sampleMatchResults.forEach(r => {
        if (r.distance < minDistance) minDistance = r.distance;
        if (r.cosine > maxCosine) maxCosine = r.cosine;
      });

      const capBio = extractBiometricsFromCanvas(alignedCanvas);
      const shapeReport = compareBiometrics(activeEmployeeRef.current.biometrics, capBio);
      const similarityScore = maxCosine;
      const finalScore = Math.max(0, Math.min(100, Math.round(similarityScore * 100)));

      setScanStatusMsg(`Matching: ${finalScore}% confidence... hold still`);

      if (finalScore >= 75) {
        if (rollingFramesRef.current.length >= 3) {
          const framesLivenessData = [];
          for (let f = 0; f < rollingFramesRef.current.length; f++) {
            const frameBox = await detectFaceInCanvas(rollingFramesRef.current[f]);
            const frameQuality = assessFaceQuality(rollingFramesRef.current[f], frameBox, frameBox.landmarks);
            framesLivenessData.push({
              ear: frameQuality.leftEAR ? (frameQuality.leftEAR + frameQuality.rightEAR) / 2 : 0.3,
              yaw: frameQuality.yaw || 1.0,
              passiveLiveness: frameQuality.passiveLiveness || 95
            });
          }

          const livenessResult = calculateMultiFrameLiveness(framesLivenessData);
          if (livenessResult.spoofDetected || finalScore < 75) {
            setScanStatusMsg('Biometrics mismatch or spoof detected.');
            setTimeout(runAutoScanLoop, 350);
            return;
          }

          scanLoopActive.current = false;
          
          const photoBase64 = canvas.toDataURL('image/jpeg', 0.85);
          setScanImage(photoBase64);
          handleStopCamera();

          const gpsStatus = gpsDataRef.current ? gpsDataRef.current.status : 'GPS Unavailable';
          let status = 'Approved';
          if (finalScore < 75 || gpsStatus === 'Invalid Location') {
            status = 'Verification Required';
          }

          const today = new Date().toDateString();
          const logs = dbService.getAttendance();

          if (isCheckInRef.current) {
            const alreadyIn = logs.some(l => l.employeeId === activeEmployeeRef.current.id && new Date(l.checkInTime).toDateString() === today);
            if (alreadyIn) {
              setErrorMsg('You have already checked in today.');
              return;
            }

            const attId = 'ATT' + Math.floor(1000 + Math.random() * 9000);
            const record = {
              id: attId,
              employeeId: activeEmployeeRef.current.id,
              employeeName: activeEmployeeRef.current.name,
              checkInTime: new Date().toISOString(),
              checkOutTime: null,
              latitude: gpsDataRef.current?.lat ? parseFloat(gpsDataRef.current.lat) : null,
              longitude: gpsDataRef.current?.lon ? parseFloat(gpsDataRef.current.lon) : null,
              confidence: finalScore,
              qualityScore: 94,
              livenessScore: livenessResult.livenessScore,
              similarityScore: neuralScore,
              verificationStatus: status,
              attendanceStatus: gpsStatus
            };

            const res = dbService.saveAttendance(record);
            if (res.success) {
              dbService.savePhotos({
                id: 'PH' + Math.floor(1000 + Math.random() * 9000),
                attendanceId: attId,
                originalPhoto: photoBase64,
                croppedFace: cropBase64,
                timestamp: new Date().toISOString()
              });
              setSuccessMsg(`Checked In Successfully! Timecard Resolution: ${status}.`);
            } else {
              setErrorMsg(res.error || 'Failed to save attendance.');
            }
          } else {
            const activeCheckIn = logs.find(l => l.employeeId === activeEmployeeRef.current.id && !l.checkOutTime);
            if (!activeCheckIn) {
              setErrorMsg('No active check-in transaction found for today.');
              return;
            }

            const res = dbService.updateAttendance(activeCheckIn.id, {
              checkOutTime: new Date().toISOString(),
              attendanceStatus: gpsStatus
            });

            if (res.success) {
              setSuccessMsg('Checked Out Successfully! Timecard updated.');
            } else {
              setErrorMsg(res.error || 'Failed to update checkout.');
            }
          }
          return;
        } else {
          setScanStatusMsg('Acquiring multi-frame liveness telemetry...');
        }
      }

      setTimeout(runAutoScanLoop, 350);
    } catch (err) {
      console.error(err);
      setTimeout(runAutoScanLoop, 350);
    }
  };

  const handleSelfScan = () => {
    // Deprecated in favor of runAutoScanLoop
  };

  const handleChangePassword = (e) => {
    e.preventDefault();
    setPasswordErrorMsg('');
    setPasswordSuccessMsg('');

    if (newPassword !== confirmPassword) {
      setPasswordErrorMsg('New passwords do not match.');
      return;
    }

    if (newPassword.length < 4) {
      setPasswordErrorMsg('Password must be at least 4 characters long.');
      return;
    }

    const res = dbService.changePassword(activeEmployee.id, currentPassword, newPassword, false);
    if (res.success) {
      setPasswordSuccessMsg('Password updated successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      
      // Update local state copy
      setActiveEmployee(res.employee);
    } else {
      setPasswordErrorMsg(res.error);
    }
  };

  const filteredEmployees = employees.filter(e => 
    e.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.department.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const activeLogToday = personalLogs.find(l => {
    const today = new Date().toDateString();
    return new Date(l.checkInTime).toDateString() === today;
  });

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-4 md:space-y-6">
      
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-6 right-6 bg-brand-600 text-white px-5 py-3 border border-brand-400 rounded-xl shadow-2xl z-50 flex items-center space-x-2 animate-in fade-in slide-in-from-top-6 duration-200">
          <Bell className="h-4.5 w-4.5 text-brand-200 animate-bounce" />
          <span className="text-xs font-bold">{toastMessage}</span>
        </div>
      )}

      {/* Login Gate Screen */}
      {!activeEmployee ? (
        <div className="max-w-2xl mx-auto flex flex-col space-y-6 py-12">
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-display font-extrabold text-white tracking-tight">
              Employee Portal Access
            </h2>
            <p className="text-xs text-dark-400 max-w-md mx-auto leading-relaxed">
              Identify your profile in the registered registry database directory below to access your personal timecard console.
            </p>
          </div>

          <div className="glass-panel p-6 rounded-2xl border border-dark-800/60 space-y-4">
            <div className="relative">
              <Search className="absolute left-3.5 top-3 h-4 w-4 text-dark-500" />
              <input
                type="text"
                placeholder="Search registered staff by name, department, or ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-dark-950/60 border border-dark-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-dark-100 focus:outline-none focus:border-brand-500"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[360px] overflow-y-auto pr-1">
              {filteredEmployees.map(emp => (
                <button
                  key={emp.id}
                  onClick={() => handleLogin(emp)}
                  className="p-4 bg-dark-900/30 border border-dark-850 hover:border-brand-500/50 hover:bg-dark-900/50 rounded-xl text-left transition flex items-center space-x-3.5 group cursor-pointer"
                >
                  <img 
                    src={emp.avatar} 
                    className="w-11 h-11 rounded-full border border-dark-800 object-cover group-hover:scale-105 transition" 
                    alt={emp.name} 
                  />
                  <div className="min-w-0 flex-1">
                    <h4 className="text-xs font-bold text-white group-hover:text-brand-400 transition leading-tight truncate">{emp.name}</h4>
                    <p className="text-[10px] text-dark-400 mt-0.5 font-medium truncate">{emp.designation}</p>
                    <div className="flex items-center space-x-2 mt-1.5 text-[9px]">
                      <span className="uppercase font-bold tracking-wider bg-brand-500/10 border border-brand-500/20 text-brand-400 px-1.5 py-0.5 rounded-md">
                        {emp.department}
                      </span>
                      <span className="text-dark-500 font-medium">ID: {emp.id}</span>
                    </div>
                  </div>
                </button>
              ))}

              {filteredEmployees.length === 0 && (
                <p className="col-span-full text-xs text-dark-500 text-center py-12">No registered employees match your query.</p>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Employee Workspace UI */
        <div className="space-y-6">
          
          {/* Header Panel */}
          <div className="glass-panel p-4 sm:p-5 rounded-2xl border border-dark-800/60 flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex flex-col sm:flex-row items-center text-center sm:text-left gap-4">
              <img 
                src={activeEmployee.avatar} 
                className="w-12 h-12 rounded-full border-2 border-brand-500/30 object-cover flex-shrink-0" 
                alt={activeEmployee.name} 
              />
              <div className="flex flex-col items-center sm:items-start">
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                  <h2 className="text-base sm:text-lg font-display font-extrabold text-white leading-tight">
                    Welcome, {activeEmployee.name}
                  </h2>
                  <span className="text-[9px] uppercase tracking-wider bg-brand-500/10 border border-brand-500/20 text-brand-400 px-2 py-0.5 rounded-md font-bold">
                    {activeEmployee.department}
                  </span>
                </div>
                <p className="text-[10px] text-dark-400 mt-1 font-semibold">
                  {activeEmployee.designation} • ID: {activeEmployee.id}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-3 w-full md:w-auto">
              {/* GPS Info */}
              <div className="text-right text-[10px] leading-normal hidden sm:block">
                <p className="text-dark-500 font-bold uppercase tracking-wider">Perimeter Distance</p>
                {gpsLoading ? (
                  <p className="text-dark-400 mt-0.5">Fetching location coordinates...</p>
                ) : gpsData ? (
                  <p className={`font-bold ${gpsData.status === 'Valid Location' ? 'text-emerald-400' : 'text-rose-400'} mt-0.5`}>
                    {gpsData.status} ({gpsData.distance === Infinity ? 'N/A' : `${gpsData.distance}m`})
                  </p>
                ) : (
                  <p className="text-dark-500 mt-0.5">GPS Offline</p>
                )}
              </div>

              <button
                onClick={handleLogout}
                className="px-4 py-2.5 bg-dark-900 hover:bg-dark-800 border border-dark-800 text-xs font-bold text-rose-400 rounded-xl transition flex items-center space-x-1.5 w-full md:w-auto justify-center cursor-pointer"
              >
                <LogOut className="h-4 w-4" />
                <span>Logout Portal</span>
              </button>
            </div>
          </div>

          {/* Core Employee Scanning Screen */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Self Scanner Column */}
            <div className="lg:col-span-2 space-y-4">
              <div className="glass-panel p-5 rounded-2xl border border-dark-800/60 flex flex-col space-y-4">
                <div className="flex justify-between items-center border-b border-dark-900 pb-3">
                  <div className="flex items-center space-x-2">
                    <span className="p-1.5 bg-brand-500/10 border border-brand-500/20 text-brand-400 rounded-lg">
                      <Camera className="h-4.5 w-4.5" />
                    </span>
                    <div>
                      <h3 className="text-xs font-bold text-white">Self-Verification Webcam</h3>
                      <p className="text-[9px] text-dark-400 mt-0.5">Capture your face snaps below to sign shift logs.</p>
                    </div>
                  </div>

                  <div className="flex bg-dark-950 p-0.5 rounded-lg border border-dark-850">
                    <button
                      onClick={() => {
                        setIsCheckIn(true);
                        setSuccessMsg('');
                        setErrorMsg('');
                        setScanImage(null);
                        handleStopCamera();
                      }}
                      className={`px-3 py-1 rounded-md text-[10px] font-bold transition ${
                        isCheckIn ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'text-dark-400 hover:text-white'
                      }`}
                    >
                      Clock In
                    </button>
                    <button
                      onClick={() => {
                        setIsCheckIn(false);
                        setSuccessMsg('');
                        setErrorMsg('');
                        setScanImage(null);
                        handleStopCamera();
                      }}
                      className={`px-3 py-1 rounded-md text-[10px] font-bold transition ${
                        !isCheckIn ? 'bg-brand-500/10 text-brand-400 border border-brand-500/20' : 'text-dark-400 hover:text-white'
                      }`}
                    >
                      Clock Out
                    </button>
                  </div>
                </div>

                {/* Viewport Box */}
                <div className="relative aspect-[3/4] md:aspect-[16/9] bg-dark-950 rounded-xl overflow-hidden border border-dark-850 flex items-center justify-center">
                  {isCameraActive ? (
                    <>
                      <video 
                        ref={videoRef} 
                        className={`w-full h-full object-cover ${facingMode === 'user' ? 'transform -scale-x-100' : ''}`}
                        playsInline 
                        muted 
                      />
                      {isCameraActive && (
                        <div className="absolute top-4 right-4 flex space-x-2 z-20">
                          {hasTorch && (
                            <button
                              type="button"
                              onClick={toggleTorch}
                              className={`p-2 rounded-xl border border-dark-800 transition cursor-pointer ${
                                isTorchOn 
                                  ? 'bg-amber-500 text-dark-950 font-extrabold shadow-md glow-amber' 
                                  : 'bg-dark-950/80 hover:bg-dark-900 text-white'
                              }`}
                              title={isTorchOn ? "Turn off Flash" : "Turn on Flash"}
                            >
                              {isTorchOn ? <Zap className="h-4 w-4" /> : <ZapOff className="h-4 w-4" />}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={toggleFacingMode}
                            className="p-2 bg-dark-950/80 hover:bg-dark-900 border border-dark-800 text-white rounded-xl transition cursor-pointer"
                            title="Flip camera"
                          >
                            <RefreshCw className="h-4 w-4 text-brand-400" />
                          </button>
                        </div>
                      )}
                    </>
                  ) : scanImage ? (
                    // Show the captured image with a "Scan Again" button overlaid
                    <>
                      <img src={scanImage} className="w-full h-full object-cover opacity-60" alt="My Snap" />
                      <div className="absolute inset-0 flex flex-col items-center justify-center space-y-3">
                        <button
                          onClick={() => { setScanImage(null); setSuccessMsg(''); setErrorMsg(''); }}
                          className="px-5 py-2.5 bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold rounded-xl shadow-lg glow-blue transition cursor-pointer flex items-center space-x-2"
                        >
                          <Camera className="h-4 w-4" />
                          <span>{isCheckIn ? 'Scan Again' : 'Start Clock Out Scan'}</span>
                        </button>
                        <p className="text-[9px] text-dark-300 bg-dark-950/70 px-3 py-1 rounded-full">
                          Previous scan shown — click above to launch a new scan
                        </p>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center text-center p-8 text-dark-500 space-y-3">
                      <Camera className="h-9 w-9 text-dark-600 animate-pulse" />
                      <div className="space-y-1">
                        <p className="text-xs font-bold text-white">Scanner Standby Mode</p>
                        <p className="text-[9px] text-dark-400">Launch webcam scanner to calibrate biometric feature templates.</p>
                      </div>
                      <button
                        onClick={handleStartCamera}
                        className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold rounded-xl shadow-lg glow-blue transition cursor-pointer"
                      >
                        Start Self Scanner
                      </button>
                    </div>
                  )}

                  {/* Scanning Animation */}
                  {isScanning && (
                    <div className="absolute inset-0 bg-brand-500/5 flex items-center justify-center z-10">
                      <div className="laser-scanner" />
                      <p className="absolute bottom-6 bg-dark-950/80 px-4 py-2 border border-brand-500/20 text-[9px] uppercase font-bold text-brand-400 rounded-xl tracking-widest animate-pulse">
                        {scanStatusMsg}
                      </p>
                    </div>
                  )}

                  {/* Capture Button — only while camera is live */}
                  {isCameraActive && !isScanning && (
                    <button
                      onClick={handleSelfScan}
                      className="absolute bottom-4 left-1/2 transform -translate-x-1/2 px-5 py-2.5 bg-brand-600 hover:bg-brand-500 text-white rounded-full flex items-center space-x-1.5 border border-brand-400 text-xs font-bold tracking-wide shadow-xl glow-blue transition cursor-pointer"
                    >
                      <UserCheck className="h-4 w-4" />
                      <span>Clock attendance now</span>
                    </button>
                  )}

                  {/* Hidden Canvas */}
                  <canvas ref={canvasRef} className="hidden" />
                </div>
              </div>
            </div>

            {/* Quick Status receipts & notifications */}
            <div className="space-y-4">
              <div className="glass-panel p-5 rounded-2xl border border-dark-800/60 space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-dark-400">Timecard Receipts</h3>

                {errorMsg && (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-450 rounded-xl text-xs flex items-start space-x-2 leading-relaxed">
                    <XCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                {successMsg && (
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-xs flex items-start space-x-2 leading-relaxed">
                    <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <span>{successMsg}</span>
                  </div>
                )}

                {/* Logged Today Indicator */}
                <div className="p-4 bg-dark-950/40 rounded-xl border border-dark-850/60 space-y-3">
                  <p className="text-[10px] font-bold text-dark-400 uppercase tracking-wider">Today's Active Logs</p>
                  
                  {activeLogToday ? (
                    <div className="space-y-2.5">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-dark-400">Check-In Logged:</span>
                        <span className="font-extrabold text-emerald-400">
                          {new Date(activeLogToday.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-dark-400">Check-Out Logged:</span>
                        <span className={activeLogToday.checkOutTime ? 'font-extrabold text-brand-400' : 'text-dark-500 font-semibold'}>
                          {activeLogToday.checkOutTime 
                            ? new Date(activeLogToday.checkOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                            : 'Active in Shift'
                          }
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-[10px] border-t border-dark-900 pt-2">
                        <span className="text-dark-500">Match Accuracy:</span>
                        <span className="font-bold text-white">{activeLogToday.confidence}% Similarity</span>
                      </div>
                      <div className="flex justify-between items-center text-[10px]">
                        <span className="text-dark-500">Resolution Status:</span>
                        <span className={`inline-flex px-2 py-0.5 rounded-full font-bold border text-[8px] ${
                          activeLogToday.verificationStatus === 'Approved'
                            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                            : 'bg-amber-500/10 border-amber-500/20 text-amber-400 animate-pulse'
                        }`}>
                          {activeLogToday.verificationStatus}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-dark-500 py-3 text-center">No clock-ins recorded for today. Please clock in to start your shift.</p>
                  )}
                </div>
              </div>

              {/* Change Password settings */}
              <div className="glass-panel p-5 rounded-2xl border border-dark-800/60 space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-dark-400">Security PIN Settings</h3>
                
                <form onSubmit={handleChangePassword} className="space-y-3 text-xs">
                  {passwordErrorMsg && (
                    <p className="text-rose-450 text-[10px] font-semibold">{passwordErrorMsg}</p>
                  )}
                  {passwordSuccessMsg && (
                    <p className="text-emerald-400 text-[10px] font-semibold">{passwordSuccessMsg}</p>
                  )}
                  
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-dark-450 uppercase">Current Password / PIN</label>
                    <input
                      type="password"
                      placeholder="••••••"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      className="w-full bg-dark-950 border border-dark-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-brand-500"
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-dark-450 uppercase">New Password / PIN</label>
                    <input
                      type="password"
                      placeholder="••••••"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full bg-dark-950 border border-dark-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-brand-500"
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-dark-450 uppercase">Confirm New PIN</label>
                    <input
                      type="password"
                      placeholder="••••••"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full bg-dark-950 border border-dark-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-brand-500"
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2 bg-dark-900 hover:bg-dark-800 border border-dark-800 text-[10px] font-bold text-brand-400 rounded-xl transition cursor-pointer"
                  >
                    Change PIN Password
                  </button>
                </form>
              </div>
            </div>
          </div>

          {/* Historical Logs List */}
          <div className="glass-panel p-5 rounded-2xl border border-dark-800/60 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold text-white">Live Attendance Report History ({personalLogs.length})</h3>
                <p className="text-[9px] text-dark-400 mt-0.5">List of all historical shift logs, including geofencing accuracy diagnostics.</p>
              </div>
              <button
                onClick={fetchLocation}
                className="p-1.5 bg-dark-900 border border-dark-800 text-brand-400 hover:text-brand-350 rounded-lg text-xs transition"
                title="Refresh logs & GPS"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="overflow-x-auto rounded-xl border border-dark-900/60 bg-dark-950/20 text-xs">
              <table className="w-full text-left">
                <thead className="bg-dark-950/80 text-dark-400 font-semibold border-b border-dark-900">
                  <tr>
                    <th className="p-3">Record ID</th>
                    <th className="p-3">Check-In Time</th>
                    <th className="p-3">Check-Out Time</th>
                    <th className="p-3">Confidence Match</th>
                    <th className="p-3">Liveness Index</th>
                    <th className="p-3">GPS Location</th>
                    <th className="p-3">Approval Resolution</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-900/40 text-dark-200">
                  {personalLogs.slice().reverse().map(log => {
                    const checkIn = new Date(log.checkInTime);
                    const checkOut = log.checkOutTime ? new Date(log.checkOutTime) : null;
                    return (
                      <tr key={log.id} className="hover:bg-dark-900/10 transition">
                        <td className="p-3 font-mono font-bold text-dark-400">{log.id}</td>
                        <td className="p-3 font-medium">
                          {checkIn.toLocaleDateString()} • {checkIn.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="p-3 font-medium text-dark-400">
                          {checkOut 
                            ? `${checkOut.toLocaleDateString()} • ${checkOut.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                            : <span className="text-[9px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded font-bold">Shift Active</span>
                          }
                        </td>
                        <td className="p-3 font-bold text-white">{log.confidence}% similarity</td>
                        <td className="p-3 font-bold text-white">{log.livenessScore || 95}%</td>
                        <td className="p-3">
                          <span className={`inline-flex px-1.5 py-0.5 rounded border text-[9px] font-bold ${
                            log.attendanceStatus === 'Valid Location'
                              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                              : 'bg-rose-500/10 border-rose-500/20 text-rose-450'
                          }`}>
                            {log.attendanceStatus}
                          </span>
                        </td>
                        <td className="p-3">
                          <span className={`inline-flex px-1.5 py-0.5 rounded border text-[9px] font-bold ${
                            log.verificationStatus === 'Approved'
                              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                              : 'bg-amber-500/10 border-amber-500/20 text-amber-400 animate-pulse'
                          }`}>
                            {log.verificationStatus}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {personalLogs.length === 0 && (
                    <tr>
                      <td colSpan="7" className="text-center py-8 text-dark-500">No shift timecard records logged for your profile.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
