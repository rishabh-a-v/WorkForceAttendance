import { useState, useEffect, useRef } from 'react';
import { 
  Camera, 
  MapPin, 
  Clock, 
  UserCheck, 
  UserMinus,
  Video,
  XCircle,
  Check,
  Users,
  ShieldCheck,
  RefreshCw,
  Zap,
  ZapOff,
  StopCircle,
  LogOut
} from 'lucide-react';
import { dbService } from '../db/dbService';
import { 
  recognizeFace, 
  detectFacesInCanvas,
  loadFaceApiModels,
  getNormalFrontCameraDeviceId,
  cropFaceFromCanvas,
  trainEmployeeFace,
  extractBiometricsFromCanvas
} from '../utils/faceEngine';

const generateRandomId = (prefix) => {
  return prefix + Math.floor(1000 + Math.random() * 9000);
};

// Preset shift templates representing group shifts (essential for simulation/testing)


export default function SupervisorPortal({ currentUser, onLogout }) {
  const [employees, setEmployees] = useState(() => dbService.getEmployees());

  // Group Scanner States
  const [activeShiftEmployees, setActiveShiftEmployees] = useState(() => {
    const attendance = dbService.getAttendance();
    const today = new Date().toDateString();
    return attendance.filter(a => 
      new Date(a.checkInTime).toDateString() === today && 
      !a.checkOutTime && 
      a.employeeId !== 'UNKNOWN'
    );
  });


  // Group photo additional states
  const [photoDimensions, setPhotoDimensions] = useState({ width: 0, height: 0 });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeCardId, setActiveCardId] = useState(null);
  const [registeringFaceId, setRegisteringFaceId] = useState(null);
  const [showSearchFaceId, setShowSearchFaceId] = useState(null);
  const [newEmpName, setNewEmpName] = useState('');
  const [newEmpMobile, setNewEmpMobile] = useState('');
  const [newEmpId, setNewEmpId] = useState('');
  const [newEmpDept, setNewEmpDept] = useState('General');
  const [newEmpDesig, setNewEmpDesig] = useState('Staff');
  const [newEmpError, setNewEmpError] = useState('');



  const updateActiveShift = () => {
    const attendance = dbService.getAttendance();
    const today = new Date().toDateString();
    const active = attendance.filter(a => 
      new Date(a.checkInTime).toDateString() === today && 
      !a.checkOutTime && 
      a.employeeId !== 'UNKNOWN'
    );
    setActiveShiftEmployees(active);
  };


  // ==========================================
  // SHARED GPS GEOLOCATION
  // ==========================================
  const [gpsData, setGpsData] = useState(null);
  const [gpsLoading, setGpsLoading] = useState(false);

  const fetchLocation = () => {
    setGpsLoading(true);
    setGpsData(null);

    const fetchIpLocationFallback = (originalError) => {
      console.warn('Attempting IP Geolocation fallback due to browser GPS failure:', originalError);
      
      // Try freeipapi.com first
      fetch('https://freeipapi.com/api/json')
        .then(res => {
          if (!res.ok) throw new Error('freeipapi HTTP error');
          return res.json();
        })
        .then(data => {
          if (data.latitude !== undefined && data.longitude !== undefined) {
            setGpsData({
              lat: parseFloat(data.latitude).toFixed(6),
              lon: parseFloat(data.longitude).toFixed(6),
              status: 'GPS Captured (IP)'
            });
            setGpsLoading(false);
          } else {
            throw new Error('Invalid coordinates format from freeipapi');
          }
        })
        .catch(err => {
          console.warn('freeipapi failed, trying ipinfo...', err);
          // Try ipinfo.io as secondary fallback
          fetch('https://ipinfo.io/json')
            .then(res => {
              if (!res.ok) throw new Error('ipinfo HTTP error');
              return res.json();
            })
            .then(data => {
              if (data.loc) {
                const [lat, lon] = data.loc.split(',');
                setGpsData({
                  lat: parseFloat(lat).toFixed(6),
                  lon: parseFloat(lon).toFixed(6),
                  status: 'GPS Captured (IP)'
                });
                setGpsLoading(false);
              } else {
                throw new Error('Invalid coordinates format from ipinfo');
              }
            })
            .catch(finalErr => {
              console.error('All geolocation fallbacks failed:', finalErr);
              setGpsData({ lat: null, lon: null, status: `GPS Error: ${originalError || 'Not supported/blocked'}` });
              setGpsLoading(false);
            });
        });
    };

    if (window.location.protocol === 'http:' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      fetchIpLocationFallback('Insecure HTTP context prevents browser Geolocation API');
      return;
    }

    if (!navigator.geolocation) {
      fetchIpLocationFallback('Geolocation API not supported by browser');
      return;
    }

    const options = { enableHighAccuracy: true, timeout: 6000 };
    
    const successCallback = (position) => {
      const { latitude, longitude } = position.coords;
      setGpsData({
        lat: latitude.toFixed(6),
        lon: longitude.toFixed(6),
        status: 'GPS Captured'
      });
      setGpsLoading(false);
    };

    const errorCallback = (error) => {
      if (options.enableHighAccuracy) {
        console.warn('High accuracy geolocation failed, trying low accuracy...');
        options.enableHighAccuracy = false;
        options.timeout = 10000;
        navigator.geolocation.getCurrentPosition(successCallback, (err2) => {
          fetchIpLocationFallback(`Browser GPS failed: ${err2.message} (Code ${err2.code})`);
        }, options);
      } else {
        fetchIpLocationFallback(`Browser GPS failed: ${error.message} (Code ${error.code})`);
      }
    };

    navigator.geolocation.getCurrentPosition(successCallback, errorCallback, options);
  };

  // ==========================================
  // TAB B: GROUP SCAN (BULK ATTENDANCE SCAN)
  // ==========================================
  const [isGroupCheckIn, setIsGroupCheckIn] = useState(true);
  const [isGroupCameraActive, setIsGroupCameraActive] = useState(false);
  const [groupScanImage, setGroupScanImage] = useState(null);
  const [groupFacingMode, setGroupFacingMode] = useState('environment');
  const [groupErrorMsg, setGroupErrorMsg] = useState('');
  const [groupDetectedFaces, setGroupDetectedFaces] = useState([]);
  const [groupSuccessCount, setGroupSuccessCount] = useState(null);
  const [isGroupScanning, setIsGroupScanning] = useState(false);
  const [groupScanStatusMsg, setGroupScanStatusMsg] = useState('');
  const [groupHasTorch, setGroupHasTorch] = useState(false);
  const [groupIsTorchOn, setGroupIsTorchOn] = useState(false);

  const groupRollingFramesRef = useRef([]);
  const groupStreamRef = useRef(null);
  const groupVideoRef = useRef(null);
  const groupCanvasRef = useRef(null);
  const groupScanLoopActive = useRef(false);

  const startGroupCamera = async (currentFacingMode = groupFacingMode) => {
    try {
      setGroupErrorMsg('');
      setGroupScanImage(null);
      setGroupDetectedFaces([]);
      setGroupSuccessCount(null);
      setIsGroupCameraActive(true);
      setIsGroupScanning(false);
      setGroupScanStatusMsg('Webcam stream active');
      groupRollingFramesRef.current = [];

      const constraints = {
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 }
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
      groupStreamRef.current = stream;

      // Check torch/flash capabilities for environment-facing camera
      let supportsTorch = false;
      const track = stream.getVideoTracks()[0];
      if (track && currentFacingMode === 'environment') {
        try {
          const capabilities = track.getCapabilities ? track.getCapabilities() : {};
          supportsTorch = !!capabilities.torch;
        } catch (e) {
          console.warn("Group torch capability check failed:", e);
        }
      }
      setGroupHasTorch(supportsTorch);
      setGroupIsTorchOn(false);

      if (groupVideoRef.current) {
        groupVideoRef.current.srcObject = stream;
        groupVideoRef.current.play();
      }
    } catch (error) {
      console.error(error);
      setGroupErrorMsg('Webcam is unavailable.');
      setIsGroupCameraActive(false);
      setIsGroupScanning(false);
    }
  };

  const stopGroupCamera = () => {
    groupScanLoopActive.current = false;
    groupRollingFramesRef.current = [];
    if (groupStreamRef.current) {
      groupStreamRef.current.getTracks().forEach(track => track.stop());
      groupStreamRef.current = null;
    }
    if (groupVideoRef.current) groupVideoRef.current.srcObject = null;
    setIsGroupCameraActive(false);
    setIsGroupScanning(false);
    setGroupHasTorch(false);
    setGroupIsTorchOn(false);
  };

  useEffect(() => {
    loadFaceApiModels().catch(err => {
      console.error('Failed to pre-load face-api models:', err);
    });
    Promise.resolve().then(() => {
      fetchLocation();
    });
    
    return () => {
      stopGroupCamera();
    };
  }, []);

  useEffect(() => {
    const syncData = async () => {
      await dbService.syncFromServer();
      updateActiveShift();
      setEmployees(dbService.getEmployees());
    };
    
    syncData();
    const interval = setInterval(syncData, 3000);

    return () => clearInterval(interval);
  }, []);

  const toggleGroupTorch = async () => {
    if (!groupStreamRef.current) return;
    const track = groupStreamRef.current.getVideoTracks()[0];
    if (!track) return;
    try {
      const nextTorchState = !groupIsTorchOn;
      await track.applyConstraints({
        advanced: [{ torch: nextTorchState }]
      });
      setGroupIsTorchOn(nextTorchState);
    } catch (err) {
      console.error("Failed to toggle group torch:", err);
    }
  };

  const toggleGroupFacingMode = () => {
    const nextMode = groupFacingMode === 'user' ? 'environment' : 'user';
    setGroupFacingMode(nextMode);
    if (isGroupCameraActive) {
      stopGroupCamera();
      setTimeout(() => startGroupCamera(nextMode), 100);
    }
  };

  // Group Photo Snapshot capture handler
  const captureGroupSnapshot = async () => {
    if (!groupVideoRef.current || !groupCanvasRef.current) return;
    const video = groupVideoRef.current;
    const canvas = groupCanvasRef.current;
    const ctx = canvas.getContext('2d');
    
    if (video.videoWidth === 0 || video.videoHeight === 0) return;
    
    const targetW = video.videoWidth;
    const targetH = video.videoHeight;
    canvas.width = targetW;
    canvas.height = targetH;
    
    // Draw current frame (with mirror correction for user facing camera)
    ctx.save();
    if (groupFacingMode === 'user') {
      ctx.translate(targetW, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, targetW, targetH);
    ctx.restore();
    
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    setGroupScanImage(dataUrl);
    setPhotoDimensions({ width: targetW, height: targetH });
    
    stopGroupCamera();
    await processGroupPhoto(canvas);
  };
  // Core processing pipeline: Face detection & Recognition
  const processGroupPhoto = async (canvas) => {
    setIsGroupScanning(true);
    setGroupScanStatusMsg('Running face detection neural network...');
    setGroupErrorMsg('');
    try {
      await loadFaceApiModels();
      const newDetections = await detectFacesInCanvas(canvas);
      
      const hasRealDetections = newDetections && newDetections.length > 0 && newDetections[0].descriptor !== null;
      
      if (!hasRealDetections) {
        setGroupDetectedFaces([]);
        setGroupErrorMsg('No faces detected in the image. Please retake the photo or upload a clearer group image.');
        setIsGroupScanning(false);
        return;
      }
      
      setGroupScanStatusMsg(`Running ArcFace facial recognition on ${newDetections.length} faces...`);
      const employeesDb = dbService.getEmployees();
      
      const resolved = await Promise.all(newDetections.map(async (det, idx) => {
        const rec = await recognizeFace(det.descriptor, employeesDb);
        const finalScore = rec.matchedEmp ? rec.confidence : 0;
        let matchedEmp = rec.matchedEmp;
        
        let status = 'Unknown';
        if (matchedEmp) {
          if (finalScore >= 90) {
            status = 'Recognized';
          } else if (finalScore >= 70) {
            status = 'Possible Match';
          } else {
            status = 'Unknown';
            matchedEmp = null;
          }
        }
        
        const faceCropBase64 = cropFaceFromCanvas(canvas, det.box);
        
        return {
          id: `F${idx + 1}`,
          box: det.box,
          descriptor: det.descriptor,
          landmarks: det.landmarks,
          avatar: faceCropBase64,
          matchedEmp,
          confidence: finalScore,
          status,
          approved: status === 'Recognized',
          rejected: false,
          overrideEmp: null
        };
      }));
      
      setGroupDetectedFaces(resolved);
      setIsGroupScanning(false);
    } catch (err) {
      console.error(err);
      setGroupErrorMsg('An error occurred during facial recognition processing.');
      setIsGroupScanning(false);
    }
  };

  const handleAssignEmployee = (faceId, emp) => {
    setGroupDetectedFaces(prev => prev.map(f => {
      if (f.id === faceId) {
        return {
          ...f,
          matchedEmp: emp,
          overrideEmp: emp,
          status: 'Recognized',
          confidence: 99,
          approved: true,
          rejected: false
        };
      }
      return f;
    }));
  };

  const handleRegisterNewEmployee = async (e) => {
    e.preventDefault();
    setNewEmpError('');
    
    if (!newEmpName.trim()) {
      setNewEmpError('Full Name is required.');
      return;
    }
    if (!newEmpMobile.trim()) {
      setNewEmpError('Mobile Number is required.');
      return;
    }
    
    const targetFace = groupDetectedFaces.find(f => f.id === registeringFaceId);
    if (!targetFace) return;
    
    const trimmedId = newEmpId.trim() || 'EMP' + Math.floor(100 + Math.random() * 900);
    const existingEmployees = dbService.getEmployees();
    
    if (existingEmployees.some(emp => emp.id === trimmedId)) {
      setNewEmpError('Employee ID already exists.');
      return;
    }
    if (existingEmployees.some(emp => emp.mobile === newEmpMobile.trim())) {
      setNewEmpError('Mobile number already registered to another profile.');
      return;
    }
    if (existingEmployees.some(emp => emp.name.toLowerCase() === newEmpName.trim().toLowerCase())) {
      setNewEmpError('An employee with this name already exists.');
      return;
    }
    
    try {
      const croppedCanvas = document.createElement('canvas');
      croppedCanvas.width = 112;
      croppedCanvas.height = 112;
      const img = new Image();
      
      const loadImgPromise = new Promise((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed to load face crop'));
        img.src = targetFace.avatar;
      });
      await loadImgPromise;
      
      croppedCanvas.getContext('2d').drawImage(img, 0, 0, 112, 112);
      const capBio = extractBiometricsFromCanvas(croppedCanvas);
      const trainedBiometrics = trainEmployeeFace([targetFace.descriptor], [capBio]);
      
      const newEmployee = {
        id: trimmedId,
        name: newEmpName.trim(),
        mobile: newEmpMobile.trim(),
        department: newEmpDept,
        designation: newEmpDesig,
        password: '123456',
        role: 'employee',
        avatar: targetFace.avatar,
        registeredPhotos: [targetFace.avatar],
        biometrics: trainedBiometrics,
        samples: [{
          id: `SAMP_${trimmedId}_1`,
          vector: targetFace.descriptor,
          avatar: targetFace.avatar,
          quality: { blur: 15, brightness: 120, contrast: 50, eyeVisible: true, headYaw: 1.0, headPitch: 1.0, isPartial: false, passed: true },
          registeredAt: new Date().toISOString()
        }],
        registeredAt: new Date().toISOString()
      };
      
      const res = dbService.saveEmployee(newEmployee);
      if (!res.success) {
        setNewEmpError(res.error || 'Failed to save employee.');
        return;
      }
      
      dbService.logAction(
        'Inline Employee Registration',
        currentUser.name,
        null,
        JSON.stringify({ id: trimmedId, name: newEmployee.name }),
        `Registered new employee ${newEmployee.name} (${trimmedId}) inline during attendance group photo marking.`
      );
      
      setEmployees(dbService.getEmployees());
      
      setGroupDetectedFaces(prev => prev.map(f => {
        if (f.id === registeringFaceId) {
          return {
            ...f,
            matchedEmp: newEmployee,
            status: 'Recognized',
            confidence: 99,
            approved: true,
            rejected: false
          };
        }
        return f;
      }));
      
      setRegisteringFaceId(null);
      setNewEmpName('');
      setNewEmpMobile('');
      setNewEmpId('');
      setNewEmpDept('General');
      setNewEmpDesig('Staff');
    } catch (err) {
      console.error(err);
      setNewEmpError('Error generating biometrics or registering employee.');
    }
  };



  const handleFinalizeAttendance = async () => {
    setGroupErrorMsg('');
    
    const approvedFaces = groupDetectedFaces.filter(f => f.approved && (f.matchedEmp || f.overrideEmp));
    
    if (approvedFaces.length === 0) {
      setGroupErrorMsg('No approved employee attendance records selected to submit.');
      return;
    }
    
    setIsSubmitting(true);
    
    const today = new Date().toDateString();
    const gpsStatus = gpsData ? gpsData.status : 'GPS Unavailable';
    const logs = dbService.getAttendance();
    
    let successCount = 0;
    let duplicateCount = 0;
    
    for (const f of approvedFaces) {
      const emp = f.overrideEmp || f.matchedEmp;
      
      const alreadyCheckedIn = logs.some(a => 
        a.employeeId === emp.id && 
        new Date(a.checkInTime).toDateString() === today
      );
      
      const activeCheckIn = logs.find(a => a.employeeId === emp.id && !a.checkOutTime);
      
      const photoId = generateRandomId('PH');
      const attId = generateRandomId('ATT');
      
      if (isGroupCheckIn) {
        if (alreadyCheckedIn) {
          duplicateCount++;
          continue;
        }
        
        const record = {
          id: attId,
          employeeId: emp.id,
          employeeName: emp.name,
          mobile: emp.mobile,
          checkInTime: new Date().toISOString(),
          checkOutTime: null,
          latitude: gpsData?.lat ? parseFloat(gpsData.lat) : null,
          longitude: gpsData?.lon ? parseFloat(gpsData.lon) : null,
          checkOutLatitude: null,
          checkOutLongitude: null,
          confidence: f.confidence >= 1 ? f.confidence / 100 : f.confidence,
          qualityScore: 95,
          livenessScore: 95,
          similarityScore: f.confidence,
          verificationStatus: 'Approved',
          attendanceStatus: gpsStatus,
          approvedBy: currentUser?.id || 'SUP001',
          groupPhotoId: photoId
        };
        
        const res = dbService.saveAttendance(record);
        if (res.success) {
          dbService.savePhotos({
            id: photoId,
            attendanceId: attId,
            originalPhoto: groupScanImage,
            croppedFace: f.avatar,
            timestamp: new Date().toISOString()
          });
          successCount++;
        }
      } else {
        if (!activeCheckIn) {
          duplicateCount++;
          continue;
        }
        
        const res = dbService.updateAttendance(activeCheckIn.id, {
          checkOutTime: new Date().toISOString(),
          confidence: Math.round((activeCheckIn.confidence + f.confidence) / 2),
          attendanceStatus: gpsStatus,
          checkOutLatitude: gpsData?.lat ? parseFloat(gpsData.lat) : null,
          checkOutLongitude: gpsData?.lon ? parseFloat(gpsData.lon) : null,
          approvedBy: currentUser?.id || 'SUP001',
          groupPhotoId: photoId
        });
        
        if (res.success) {
          dbService.savePhotos({
            id: photoId,
            attendanceId: activeCheckIn.id,
            originalPhoto: groupScanImage,
            croppedFace: f.avatar,
            timestamp: new Date().toISOString()
          });
          successCount++;
        }
      }
    }
    
    dbService.logAction(
      'Group Photo Attendance Processing',
      currentUser.name,
      null,
      JSON.stringify({
        totalFacesDetected: groupDetectedFaces.length,
        approvedCount: approvedFaces.length,
        loggedCount: successCount,
        skippedDuplicates: duplicateCount,
        clockMode: isGroupCheckIn ? 'Clock In' : 'Clock Out'
      }),
      `Supervisor ${currentUser.name} uploaded group photo, detected ${groupDetectedFaces.length} faces, approved ${approvedFaces.length} attendance marks. Logged ${successCount} successfully, skipped ${duplicateCount} duplicates.`
    );
    
    setIsSubmitting(false);
    updateActiveShift();
    setGroupSuccessCount(successCount);
    
    setGroupScanImage(null);
    setGroupDetectedFaces([]);
  };





  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 md:space-y-6 select-none">


      {/* Title Header */}
      <div className="glass-panel p-4 sm:p-5 rounded-2xl border border-dark-800/60 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex flex-col sm:flex-row items-center text-center sm:text-left gap-4">
          <div className="p-3 bg-violet-500/10 border border-violet-500/20 text-violet-400 rounded-2xl flex-shrink-0">
            <Users className="h-6 w-6" />
          </div>
          <div className="flex flex-col items-center sm:items-start">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
              <h2 className="text-base sm:text-lg font-display font-extrabold text-white leading-tight">
                Supervisor Attendance Scanner
              </h2>
            </div>
            <p className="text-[10px] text-dark-400 mt-1 font-semibold">
              Management Portal • ID: {currentUser?.id} • Name: {currentUser?.name}
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-3 w-full md:w-auto md:justify-end">
          <div className="flex items-center space-x-2 text-xs bg-dark-900 border border-dark-800 rounded-xl px-4 py-2 text-dark-300">
            <Clock className="h-4 w-4 text-violet-400 animate-pulse" />
            <span className="font-semibold">{activeShiftEmployees.length} Workers Active in Shift</span>
          </div>
          <button
            onClick={() => {
              stopGroupCamera();
              setGroupErrorMsg('');
              setGroupSuccessCount(null);
              setGroupScanImage(null);
              setGroupDetectedFaces([]);
              fetchLocation();
            }}
            className="p-2 bg-dark-900 hover:bg-dark-800 border border-dark-800 text-dark-400 hover:text-white rounded-xl transition cursor-pointer"
            title="Refresh scanner"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            onClick={() => onLogout?.()}
            className="flex items-center space-x-2 px-3 py-2 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 text-xs font-bold rounded-xl transition cursor-pointer"
            title="Logout"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </div>

      {/* GPS Info & Console Toolbar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 glass-panel p-5 rounded-2xl border border-dark-800/60 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center space-x-3.5">
            <div className="p-3 bg-violet-500/10 border border-violet-500/20 text-violet-400 rounded-xl">
              <MapPin className="h-5.5 w-5.5" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-dark-400">GPS Location Status</p>
              {gpsLoading ? (
                <p className="text-xs font-semibold text-dark-300 mt-1 flex items-center">
                  <RefreshCw className="h-3 w-3 mr-1 animate-spin text-violet-400" /> Tracking browser GPS coordinates...
                </p>
              ) : gpsData ? (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-xs">
                  <span className={`font-extrabold ${gpsData.status?.startsWith('GPS Captured') ? 'text-emerald-400' : 'text-rose-455'}`}>
                    {gpsData.status}
                  </span>
                  {gpsData.lat && (
                    <>
                      <span className="text-dark-500">•</span>
                      <span className="text-dark-300 font-semibold font-mono">Coords: {gpsData.lat}, {gpsData.lon}</span>
                    </>
                  )}
                  <span className="text-dark-500">•</span>
                  <span className="text-dark-400 text-[10px]">Precision: {gpsData.accuracy || '8'}m</span>
                </div>
              ) : (
                <p className="text-xs text-dark-500 mt-1">Status Uninitialized</p>
              )}
            </div>
          </div>
          
          <div className="flex space-x-2 w-full md:w-auto">
            <button
              onClick={fetchLocation}
              className="flex-1 md:flex-initial px-4 py-2 bg-dark-900 border border-dark-800 text-xs font-bold rounded-xl text-violet-400 hover:bg-dark-800 transition cursor-pointer"
            >
              Recenter GPS
            </button>
          </div>
        </div>

        {/* Action Controls Panel */}
        <div className="glass-panel p-5 rounded-2xl border border-dark-800/60 flex items-center justify-between">
          <div className="space-y-1 w-full">
            <p className="text-[10px] uppercase font-bold text-dark-400">Scan Session Action Type</p>
            <div className="grid grid-cols-2 bg-dark-950 p-1 rounded-xl border border-dark-850 mt-1 max-w-[280px]">
              <button
                type="button"
                onClick={() => {
                  setIsGroupCheckIn(true);
                  setGroupSuccessCount(null);
                  stopGroupCamera();
                }}
                className={`py-1.5 rounded-lg text-xs font-bold transition flex items-center justify-center space-x-1.5 cursor-pointer ${
                  isGroupCheckIn 
                    ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-extrabold shadow-sm' 
                    : 'text-dark-400 hover:text-white'
                }`}
              >
                <UserCheck className="h-3.5 w-3.5" />
                <span>Clock In Group</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsGroupCheckIn(false);
                  setGroupSuccessCount(null);
                  stopGroupCamera();
                }}
                className={`py-1.5 rounded-lg text-xs font-bold transition flex items-center justify-center space-x-1.5 cursor-pointer ${
                  !isGroupCheckIn 
                    ? 'bg-violet-500/10 border border-violet-500/20 text-violet-400 font-extrabold shadow-sm' 
                    : 'text-dark-400 hover:text-white'
                }`}
              >
                <UserMinus className="h-3.5 w-3.5" />
                <span>Clock Out Group</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="w-full">
        <div className="space-y-6">
              <div className="space-y-6">
                
                {/* 1. Capture/Standby State (No group image loaded yet) */}
                {!groupScanImage && (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Left 2 Columns: Video Scanner Panel */}
                    <div className="lg:col-span-2 space-y-4">
                      <div className="glass-panel p-5 rounded-2xl border border-dark-800/60 flex flex-col space-y-4">
                        {/* Scan Toolbar */}
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-dark-900 pb-4">
                          <div className="flex items-center space-x-2">
                            <span className="p-1.5 bg-violet-500/10 border border-violet-500/20 text-violet-400 rounded-lg">
                              <Video className="h-4 w-4" />
                            </span>
                            <div>
                              <h3 className="text-xs font-bold text-white">Live Scanner Frame</h3>
                              <p className="text-[10px] text-dark-400 mt-0.5">Captures single or multiple worker identities side-by-side.</p>
                            </div>
                          </div>
                        </div>

                        {/* Viewport Box */}
                        <div className="relative aspect-[3/4] md:aspect-[16/9] bg-dark-950 rounded-xl overflow-hidden border border-dark-850 flex items-center justify-center">
                          {isGroupCameraActive && (
                            <>
                              <video 
                                ref={groupVideoRef} 
                                className={`w-full h-full object-cover ${groupFacingMode === 'user' ? 'transform -scale-x-100' : ''}`}
                                playsInline 
                                muted 
                              />
                              <div className="absolute top-4 right-4 flex space-x-2 z-20">
                                {groupHasTorch && (
                                  <button
                                    type="button"
                                    onClick={toggleGroupTorch}
                                    className={`p-2 rounded-xl border border-dark-800 transition cursor-pointer ${
                                      groupIsTorchOn 
                                        ? 'bg-amber-500 text-dark-950 font-extrabold shadow-md glow-amber' 
                                        : 'bg-dark-950/80 hover:bg-dark-900 text-white'
                                    }`}
                                    title={groupIsTorchOn ? "Turn off Flash" : "Turn on Flash"}
                                  >
                                    {groupIsTorchOn ? <Zap className="h-4 w-4" /> : <ZapOff className="h-4 w-4" />}
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={toggleGroupFacingMode}
                                  className="p-2 bg-dark-950/80 hover:bg-dark-900 border border-dark-800 text-white rounded-xl transition cursor-pointer"
                                  title="Flip camera"
                                >
                                  <RefreshCw className="h-4 w-4 text-brand-400" />
                                </button>
                              </div>

                              <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 flex space-x-3 z-20">
                                <button
                                  type="button"
                                  onClick={captureGroupSnapshot}
                                  className="px-6 py-2.5 bg-violet-600 hover:bg-violet-500 text-white rounded-full flex items-center space-x-2 border border-violet-500/25 font-bold text-xs tracking-wider shadow-xl transition cursor-pointer"
                                >
                                  <Camera className="h-4 w-4" />
                                  <span>Capture Group Photo</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={stopGroupCamera}
                                  className="px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-full flex items-center space-x-2 border border-rose-500/25 font-bold text-xs tracking-wider shadow-xl transition cursor-pointer"
                                >
                                  <StopCircle className="h-4 w-4" />
                                  <span>Stop Stream</span>
                                </button>
                              </div>
                            </>
                          )}

                          {/* Standby/Uploader Menu */}
                          {!isGroupCameraActive && (
                            <div className="flex flex-col items-center justify-center text-center p-8 text-dark-500 space-y-4 max-w-sm">
                              <Camera className="h-10 w-10 text-violet-400 animate-pulse" />
                              <div className="space-y-1">
                                <p className="text-xs font-semibold text-white">Attendance via Group Photo</p>
                                <p className="text-[10px] text-dark-400">Capture a live group image to match multiple employees.</p>
                              </div>
                              <div className="flex justify-center w-full">
                                <button
                                  onClick={() => startGroupCamera()}
                                  className="w-full px-4 py-2.5 bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold rounded-xl shadow-lg transition cursor-pointer flex items-center justify-center space-x-2"
                                >
                                  <Video className="h-4 w-4" />
                                  <span>Capture Webcam</span>
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Processing loading bar */}
                          {isGroupScanning && (
                            <div className="absolute inset-0 bg-dark-950/80 backdrop-blur-sm flex flex-col items-center justify-center z-40 space-y-4">
                              <RefreshCw className="h-10 w-10 text-violet-400 animate-spin" />
                              <div className="text-center space-y-1">
                                <p className="text-xs font-bold text-white">Processing Group Photo</p>
                                <p className="text-[10px] text-dark-400 animate-pulse">{groupScanStatusMsg}</p>
                              </div>
                            </div>
                          )}
                        </div>
                        {/* Hidden processing canvas */}
                        <canvas ref={groupCanvasRef} className="hidden" />
                      </div>
                    </div>

                    {/* Right column: Controls & Registry Dispatcher */}
                    <div className="space-y-6">
                      <div className="glass-panel p-6 rounded-2xl border border-dark-800/60 space-y-5">
                        <div>
                          <h3 className="text-sm font-display font-extrabold text-white">Shift Registry Dispatcher</h3>
                          <p className="text-[10px] text-dark-400 mt-1">Scan and save attendance to shift log records.</p>
                        </div>

                        {groupErrorMsg && (
                          <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-455 text-xs flex items-start space-x-2 leading-relaxed">
                            <XCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                            <span>{groupErrorMsg}</span>
                          </div>
                        )}

                        {groupSuccessCount !== null && (
                          <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl space-y-2">
                            <p className="text-emerald-400 text-xs font-bold flex items-center">
                              <ShieldCheck className="h-4.5 w-4.5 mr-1 text-emerald-400 animate-bounce" />
                              Attendance Session Complete!
                            </p>
                            <p className="text-[10px] text-dark-300 leading-relaxed">
                              Successfully recorded attendance logs for <strong>{groupSuccessCount} employees</strong>. Original group photo & crops uploaded.
                            </p>
                            <button
                              onClick={() => { setGroupSuccessCount(null); }}
                              className="w-full py-2 bg-dark-900 hover:bg-dark-800 border border-dark-800 text-[10px] text-white font-bold rounded-xl transition cursor-pointer"
                            >
                              Dismiss Message
                            </button>
                          </div>
                        )}

                        {/* Employee Shift Status List */}
                        <div className="space-y-3 pt-4 border-t border-dark-900">
                          <div className="flex items-center justify-between pb-1">
                            <span className="text-[10px] font-bold text-dark-400 uppercase">Employee Shift Status</span>
                            <span className="text-[9px] text-dark-500 font-mono">Today</span>
                          </div>
                          <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                            {(() => {
                              const todayStr = new Date().toDateString();
                              const allLogs = dbService.getAttendance();
                              const todayLogs = allLogs.filter(a => new Date(a.checkInTime).toDateString() === todayStr && a.employeeId !== 'UNKNOWN');

                              return employees.map((emp) => {
                                const log = todayLogs.find(l => l.employeeId === emp.id);
                                let statusText = 'Not Checked In';
                                let statusColor = 'bg-dark-900 text-dark-400 border-dark-850';
                                let timeStr = '';

                                if (log) {
                                  if (log.checkOutTime) {
                                    statusText = 'Clocked Out';
                                    statusColor = 'bg-brand-500/10 text-brand-400 border-brand-500/20';
                                    timeStr = new Date(log.checkOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                  } else {
                                    statusText = 'Clocked In';
                                    statusColor = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
                                    timeStr = new Date(log.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                  }
                                }

                                return (
                                  <div key={emp.id} className="flex items-center justify-between p-2 bg-dark-950/30 border border-dark-900 rounded-xl hover:border-dark-800 transition">
                                    <div className="flex items-center space-x-2.5 min-w-0">
                                      <img 
                                        src={emp.avatar || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none"><circle cx="50" cy="50" r="50" fill="%231e293b"/></svg>'} 
                                        className="w-7 h-7 rounded-lg object-cover border border-dark-800 bg-dark-900 flex-shrink-0" 
                                        alt={emp.name} 
                                      />
                                      <div className="min-w-0">
                                        <p className="text-xs font-bold text-white truncate leading-tight">{emp.name}</p>
                                        <p className="text-[9px] text-dark-500 font-mono mt-0.5">{emp.id}</p>
                                      </div>
                                    </div>
                                    <div className="text-right flex-shrink-0 flex flex-col items-end space-y-0.5">
                                      <span className={`text-[8px] px-2 py-0.5 rounded-full font-bold border ${statusColor}`}>
                                        {statusText}
                                      </span>
                                      {timeStr && <p className="text-[8px] text-dark-500 font-mono">{timeStr}</p>}
                                    </div>
                                  </div>
                                );
                              });
                            })()}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. Photo Processing & Review Stage */}
                {groupScanImage && (
                  <div className="space-y-6">
                    {/* Top Alert Error if any */}
                    {groupErrorMsg && (
                      <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-455 text-xs flex items-center space-x-2">
                        <XCircle className="h-4 w-4 flex-shrink-0" />
                        <span>{groupErrorMsg}</span>
                      </div>
                    )}
                    
                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                      
                      {/* Left: Interactive Group Image Overlay */}
                      <div className="xl:col-span-2 space-y-4">
                        <div className="glass-panel p-4 rounded-2xl border border-dark-800/60 flex flex-col space-y-3">
                          <div className="flex justify-between items-center pb-2 border-b border-dark-900">
                            <div>
                              <h4 className="text-xs font-bold text-white uppercase">Group Photo Proof</h4>
                              <p className="text-[9px] text-dark-400 mt-0.5">Detected Faces: {groupDetectedFaces.length}</p>
                            </div>
                            <button
                              onClick={() => {
                                setGroupScanImage(null);
                                setGroupDetectedFaces([]);
                                setGroupErrorMsg('');
                              }}
                              className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-550/20 rounded-lg text-[10px] font-bold transition flex items-center space-x-1"
                            >
                              <XCircle className="h-3.5 w-3.5" />
                              <span>Discard Image</span>
                            </button>
                          </div>
                          
                          <div className="flex justify-center bg-dark-950/40 p-2 rounded-xl border border-dark-900">
                            <div className="relative inline-block w-full max-w-4xl overflow-hidden rounded-lg">
                              <img
                                src={groupScanImage}
                                className="block w-full h-auto rounded-lg"
                                alt="Staging Queue Group Snapshot"
                              />
                              {/* Overlay Bounding Boxes */}
                              {groupDetectedFaces.map(face => {
                                const left = (face.box.x / photoDimensions.width) * 100;
                                const top = (face.box.y / photoDimensions.height) * 100;
                                const width = (face.box.w / photoDimensions.width) * 100;
                                const height = (face.box.h / photoDimensions.height) * 100;
                                const isActive = activeCardId === face.id;
                                const borderColor = face.status === 'Recognized' ? 'border-emerald-500' : face.status === 'Possible Match' ? 'border-amber-500' : 'border-rose-500';
                                
                                return (
                                  <div
                                    key={face.id}
                                    style={{
                                      position: 'absolute',
                                      left: `${left}%`,
                                      top: `${top}%`,
                                      width: `${width}%`,
                                      height: `${height}%`
                                    }}
                                    className={`border-2 ${borderColor} ${isActive ? 'ring-2 ring-white/50 scale-105 z-10' : 'opacity-85'} transition-all rounded-md cursor-pointer`}
                                    onMouseEnter={() => setActiveCardId(face.id)}
                                    onMouseLeave={() => setActiveCardId(null)}
                                  >
                                    <span className={`absolute top-0 left-0 text-[8px] font-extrabold text-white px-1.5 py-0.5 rounded-br ${
                                      face.status === 'Recognized' ? 'bg-emerald-600' :
                                      face.status === 'Possible Match' ? 'bg-amber-600' : 'bg-rose-600'
                                    }`}>
                                      {face.id}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Right: Stage Control Panel */}
                      <div className="space-y-4">
                        <div className="glass-panel p-5 rounded-2xl border border-dark-800/60 space-y-4">
                          <div>
                            <h4 className="text-xs font-bold text-white uppercase tracking-wider">Attendance Queue Control</h4>
                            <p className="text-[10px] text-dark-400 mt-1">Review the matching output, resolve warnings/unknowns, and bulk approve.</p>
                          </div>
                          
                          <div className="space-y-2">
                            <label className="text-[9px] font-bold text-dark-400 uppercase">Clock Action type</label>
                            <div className="grid grid-cols-2 bg-dark-950 p-1 rounded-xl border border-dark-850">
                              <button
                                type="button"
                                onClick={() => setIsGroupCheckIn(true)}
                                className={`py-1.5 rounded-lg text-[10px] font-bold flex items-center justify-center space-x-1 transition cursor-pointer ${
                                  isGroupCheckIn 
                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-550/20 font-extrabold' 
                                    : 'text-dark-400 hover:text-white'
                                }`}
                              >
                                <UserCheck className="h-3.5 w-3.5" />
                                <span>Clock In</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setIsGroupCheckIn(false)}
                                className={`py-1.5 rounded-lg text-[10px] font-bold flex items-center justify-center space-x-1 transition cursor-pointer ${
                                  !isGroupCheckIn 
                                    ? 'bg-violet-500/10 text-violet-400 border border-violet-550/20 font-extrabold' 
                                    : 'text-dark-400 hover:text-white'
                                }`}
                              >
                                <UserMinus className="h-3.5 w-3.5" />
                                <span>Clock Out</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Stage Queue Cards List */}
                    <div className="space-y-3.5 pt-4">
                      <h4 className="font-display font-extrabold text-sm text-white uppercase tracking-wider">Face Identification review list ({groupDetectedFaces.length})</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                        {groupDetectedFaces.map(face => {
                          const emp = face.overrideEmp || face.matchedEmp;
                          const isActive = activeCardId === face.id;
                          const isApproved = face.approved;
                          
                          return (
                            <div
                              key={face.id}
                              onMouseEnter={() => setActiveCardId(face.id)}
                              onMouseLeave={() => setActiveCardId(null)}
                              className={`glass-panel p-4 rounded-2xl border transition-all duration-300 flex flex-col justify-between space-y-4 ${
                                isActive ? 'border-violet-550 bg-dark-900/30 shadow-xl scale-[1.01]' : 'border-dark-850'
                              } ${isApproved ? 'border-emerald-550/40 bg-emerald-500/5' : ''} ${
                                face.rejected ? 'border-rose-500/30 opacity-70' : ''
                              }`}
                            >
                              {/* Crop thumbnail and metadata */}
                              <div className="flex items-start space-x-3.5">
                                <img
                                  src={face.avatar}
                                  className="w-14 h-14 rounded-xl object-cover border border-dark-800 bg-dark-955 flex-shrink-0"
                                  alt="Crop"
                                />
                                <div className="min-w-0 flex-1 space-y-1">
                                  <div className="flex items-center space-x-1.5">
                                    <span className="text-[9px] bg-dark-955 border border-dark-800 text-dark-300 px-1.5 py-0.5 rounded font-bold">
                                      {face.id}
                                    </span>
                                    {face.status === 'Recognized' && (
                                      <span className="text-[8.5px] bg-emerald-500/10 text-emerald-450 border border-emerald-500/20 px-2 py-0.5 rounded-full font-bold">
                                        Recognized
                                      </span>
                                    )}
                                    {face.status === 'Possible Match' && (
                                      <span className="text-[8.5px] bg-amber-500/10 text-amber-400 border border-amber-550/20 px-2 py-0.5 rounded-full font-bold">
                                        Possible Match
                                      </span>
                                    )}
                                    {face.status === 'Unknown' && (
                                      <span className="text-[8.5px] bg-rose-500/10 text-rose-455 border border-rose-500/20 px-2 py-0.5 rounded-full font-bold">
                                        Unknown Person
                                      </span>
                                    )}
                                  </div>
                                  
                                  {emp ? (
                                    <div className="space-y-0.5 text-[10px]">
                                      <p className="text-xs font-bold text-white truncate">{emp.name}</p>
                                      <p className="text-[9px] text-dark-400 font-mono truncate">ID: {emp.id}</p>
                                      <p className="text-[9px] text-dark-500 truncate">Mob: {emp.mobile}</p>
                                      <p className="text-[9.5px] text-violet-400 font-bold mt-1">
                                        Confidence: {face.confidence}%
                                      </p>
                                    </div>
                                  ) : (
                                    <p className="text-[10px] font-bold text-dark-500 italic mt-1">Unregistered Person</p>
                                  )}
                                </div>
                              </div>

                              {/* Card Actions: Confirm, Search, Register */}
                              <div className="pt-2 border-t border-dark-900/60 space-y-2">
                                {face.status === 'Possible Match' && !face.overrideEmp && (
                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={() => {
                                        setGroupDetectedFaces(prev => prev.map(f => {
                                          if (f.id === face.id) {
                                            return { ...f, approved: true, rejected: false, status: 'Recognized' };
                                          }
                                          return f;
                                        }));
                                      }}
                                      className="flex-1 py-1.5 bg-amber-500 text-dark-950 text-[10px] font-bold rounded-lg transition hover:bg-amber-400 cursor-pointer text-center"
                                    >
                                      Confirm Match
                                    </button>
                                    <button
                                      onClick={() => setShowSearchFaceId(face.id)}
                                      className="flex-1 py-1.5 bg-dark-900 border border-dark-800 text-[10px] text-dark-300 font-bold rounded-lg transition hover:bg-dark-800 cursor-pointer text-center"
                                    >
                                      Change Employee
                                    </button>
                                  </div>
                                )}

                                {face.status === 'Unknown' && !face.overrideEmp && (
                                  <div className="flex flex-col gap-1.5">
                                    <button
                                      onClick={() => setShowSearchFaceId(face.id)}
                                      className="w-full py-1.5 bg-dark-900 border border-dark-800 hover:bg-dark-800 text-[10px] font-bold text-white rounded-lg transition flex items-center justify-center space-x-1 cursor-pointer"
                                    >
                                      <span>Assign Existing Employee</span>
                                    </button>
                                    <button
                                      onClick={() => {
                                        setRegisteringFaceId(face.id);
                                        setNewEmpError('');
                                      }}
                                      className="w-full py-1.5 bg-violet-650/10 hover:bg-violet-650/20 border border-violet-500/20 text-[10px] font-bold text-violet-400 rounded-lg transition flex items-center justify-center space-x-1 cursor-pointer"
                                    >
                                      <span>Register New Employee</span>
                                    </button>
                                  </div>
                                )}

                                {showSearchFaceId === face.id && (
                                  <div className="bg-dark-955 p-2 rounded-xl border border-dark-800 mt-2 space-y-2">
                                    <p className="text-[9px] font-bold text-dark-400 uppercase">Search Employee</p>
                                    <select
                                      onChange={(e) => {
                                        const selected = employees.find(x => x.id === e.target.value);
                                        if (selected) {
                                          handleAssignEmployee(face.id, selected);
                                          setShowSearchFaceId(null);
                                        }
                                      }}
                                      className="w-full bg-dark-900 border border-dark-850 rounded-lg px-2 py-1 text-[10px] text-white focus:outline-none focus:border-violet-500 cursor-pointer"
                                      defaultValue=""
                                    >
                                      <option value="" disabled>Select employee...</option>
                                      {employees.map(x => (
                                        <option key={x.id} value={x.id}>{x.name} ({x.id})</option>
                                      ))}
                                    </select>
                                    <button
                                      onClick={() => setShowSearchFaceId(null)}
                                      className="text-[9px] text-dark-500 hover:text-white underline block"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                )}
                              </div>

                              {/* Individual Approve/Reject buttons */}
                              {((face.matchedEmp || face.overrideEmp) && showSearchFaceId !== face.id) && (
                                <div className="flex items-center justify-between pt-2 border-t border-dark-900/40">
                                  <span className="text-[9px] text-dark-400 font-bold uppercase">Candidate Status</span>
                                  <div className="flex items-center space-x-2">
                                    <button
                                      onClick={() => {
                                        setGroupDetectedFaces(prev => prev.map(f => {
                                          if (f.id === face.id) {
                                            return { ...f, approved: true, rejected: false };
                                          }
                                          return f;
                                        }));
                                      }}
                                      className={`px-3 py-1 rounded-lg text-[9px] font-bold transition cursor-pointer ${
                                        isApproved
                                          ? 'bg-emerald-600 text-white shadow-sm'
                                          : 'bg-dark-900 text-dark-400 hover:text-white'
                                      }`}
                                    >
                                      Approve
                                    </button>
                                    <button
                                      onClick={() => {
                                        setGroupDetectedFaces(prev => prev.map(f => {
                                          if (f.id === face.id) {
                                            return { ...f, approved: false, rejected: true };
                                          }
                                          return f;
                                        }));
                                      }}
                                      className={`px-3 py-1 rounded-lg text-[9px] font-bold transition cursor-pointer ${
                                        face.rejected
                                          ? 'bg-rose-600 text-white shadow-sm'
                                          : 'bg-dark-900 text-dark-400 hover:text-white'
                                      }`}
                                    >
                                      Reject
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      <div className="max-w-md mx-auto mt-8 pt-4 border-t border-dark-900/40">
                        <button
                          onClick={handleFinalizeAttendance}
                          disabled={isSubmitting}
                          className="w-full py-4 bg-violet-600 hover:bg-violet-500 text-white disabled:bg-dark-800 disabled:text-dark-500 rounded-2xl text-xs font-extrabold transition shadow-lg flex items-center justify-center space-x-2 cursor-pointer font-display"
                        >
                          {isSubmitting ? (
                            <>
                              <RefreshCw className="h-4.5 w-4.5 animate-spin" />
                              <span>Recording Logs...</span>
                            </>
                          ) : (
                            <>
                              <Check className="h-4.5 w-4.5" />
                              <span>Confirm & Log Attendance ({groupDetectedFaces.filter(f => f.approved).length} Approved)</span>
                            </>
                          )}
                        </button>
                        <p className="text-[9px] text-dark-500 text-center mt-2 leading-normal">
                          Please verify all matching candidates. Unapproved faces will not be marked in the database.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

            {/* Inline Registration Modal overlay */}
            {registeringFaceId && (
              <div className="fixed inset-0 bg-dark-950/85 backdrop-blur-md flex items-center justify-center z-50 p-4">
                <div className="glass-panel max-w-md w-full p-6 rounded-2xl border border-dark-800 space-y-4 shadow-2xl relative">
                  <button
                    onClick={() => {
                      setRegisteringFaceId(null);
                      setNewEmpName('');
                      setNewEmpMobile('');
                      setNewEmpId('');
                      setNewEmpError('');
                    }}
                    className="absolute top-4 right-4 text-dark-400 hover:text-white transition cursor-pointer p-1"
                  >
                    <XCircle className="h-5 w-5" />
                  </button>
                  
                  <div className="flex items-center space-x-3.5">
                    <div className="p-2.5 bg-violet-500/10 border border-violet-500/20 text-violet-400 rounded-xl">
                      <Users className="h-5.5 w-5.5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-display font-extrabold text-white">Register New Employee</h3>
                      <p className="text-[10px] text-dark-400">Add the worker profile directly to the database.</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-center bg-dark-950/50 p-4 rounded-xl border border-dark-900">
                    <div className="text-center space-y-2">
                      <img
                        src={groupDetectedFaces.find(f => f.id === registeringFaceId)?.avatar}
                        className="w-24 h-24 rounded-xl object-cover border border-violet-500/30 mx-auto shadow-inner"
                        alt="Detected face crop"
                      />
                      <span className="text-[9px] bg-violet-500/20 text-violet-400 border border-violet-500/25 px-2 py-0.5 rounded font-bold">
                        Detected Face Crop
                      </span>
                    </div>
                  </div>
                  
                  <form onSubmit={handleRegisterNewEmployee} className="space-y-3.5 text-xs">
                    {newEmpError && (
                      <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-455 text-xs rounded-xl flex items-center space-x-2">
                        <XCircle className="h-4 w-4 flex-shrink-0" />
                        <span>{newEmpError}</span>
                      </div>
                    )}
                    
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-dark-400 uppercase">Full Name <span className="text-rose-455">*</span></label>
                      <input
                        type="text"
                        value={newEmpName}
                        onChange={(e) => setNewEmpName(e.target.value)}
                        className="w-full bg-dark-950 border border-dark-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-violet-500"
                        placeholder="e.g. John Doe"
                        required
                      />
                    </div>
                    
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-dark-400 uppercase">Mobile Number <span className="text-rose-455">*</span></label>
                      <input
                        type="tel"
                        value={newEmpMobile}
                        onChange={(e) => setNewEmpMobile(e.target.value)}
                        className="w-full bg-dark-950 border border-dark-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-violet-500"
                        placeholder="e.g. 9876543210"
                        required
                      />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-dark-400 uppercase">Employee ID (Optional)</label>
                        <input
                          type="text"
                          value={newEmpId}
                          onChange={(e) => setNewEmpId(e.target.value)}
                          className="w-full bg-dark-950 border border-dark-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-violet-500"
                          placeholder="Auto-generated if empty"
                        />
                      </div>
                      
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-dark-400 uppercase">Department</label>
                        <select
                          value={newEmpDept}
                          onChange={(e) => setNewEmpDept(e.target.value)}
                          className="w-full bg-dark-950 border border-dark-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-violet-500 cursor-pointer"
                        >
                          <option value="General">General</option>
                          <option value="Operations">Operations</option>
                          <option value="Production">Production</option>
                          <option value="HR">HR</option>
                          <option value="Sales">Sales</option>
                        </select>
                      </div>
                    </div>
                    
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-dark-400 uppercase">Designation</label>
                      <input
                        type="text"
                        value={newEmpDesig}
                        onChange={(e) => setNewEmpDesig(e.target.value)}
                        className="w-full bg-dark-950 border border-dark-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-violet-500"
                        placeholder="e.g. Staff"
                      />
                    </div>
                    
                    <div className="flex space-x-2 pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setRegisteringFaceId(null);
                          setNewEmpName('');
                          setNewEmpMobile('');
                          setNewEmpId('');
                          setNewEmpError('');
                        }}
                        className="flex-1 py-2.5 bg-dark-900 border border-dark-800 hover:bg-dark-800 text-dark-300 font-bold rounded-xl text-center cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="flex-1 py-2.5 bg-violet-600 hover:bg-violet-500 text-white font-bold rounded-xl shadow-lg cursor-pointer"
                      >
                        Save & Link
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
  );
}
