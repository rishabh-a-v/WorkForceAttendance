import { useState, useEffect, useRef } from 'react';
import { 
  Camera, 
  MapPin, 
  CheckCircle, 
  Clock, 
  UserCheck, 
  UserMinus,
  Video,
  XCircle,
  Check,
  Users,
  ShieldCheck,
  RefreshCw,
  Sliders,
  StopCircle,
  Zap,
  ZapOff
} from 'lucide-react';
import { dbService, WORKSITE, updateWorksiteCoords } from '../db/dbService';
import { 
  calculateDistanceInMeters, 
  compareBiometrics, 
  generateBiometrics, 
  recognizeFace, 
  detectFacesInCanvas,
  loadFaceApiModels,
  assessFaceQuality,
  alignAndCropFace,
  calculateMultiFrameLiveness,
  drawImageProp,
  getNormalFrontCameraDeviceId
} from '../utils/faceEngine';

// Removed mock data for deployment
export default function AttendanceScanner() {
  const [employees] = useState(() => dbService.getEmployees());
  const [activeShiftEmployees, setActiveShiftEmployees] = useState(() => {
    const attendance = dbService.getAttendance();
    const today = new Date().toDateString();
    return attendance.filter(a => 
      new Date(a.checkInTime).toDateString() === today && 
      !a.checkOutTime && 
      a.employeeId !== 'UNKNOWN'
    );
  });
  
  // App Config States
  const [scannerMode, setScannerMode] = useState('camera'); // 'camera' or 'manual'
  const [isCheckIn, setIsCheckIn] = useState(true); // check-in mode vs check-out mode



  // Camera & Scanning States
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [detectedFaces, setDetectedFaces] = useState([]);
  const [successCount, setSuccessCount] = useState(null);
  const [facingMode, setFacingMode] = useState('user'); // 'user' (front) or 'environment' (back)
  
  // Captured visual payload for canvas drawing
  const [scanImage, setScanImage] = useState(null);
  const [showDiagnostics, setShowDiagnostics] = useState({}); // { [faceId]: boolean }
  
  // Geolocation States
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsData, setGpsData] = useState(null);
  
  // Manual override states
  const [manualEmpId, setManualEmpId] = useState('');
  const [manualType, setManualType] = useState('checkin');
  const [manualTime, setManualTime] = useState(new Date().toISOString().slice(0, 16));
  const [manualReason, setManualReason] = useState('');
  const [manualSuccessMsg, setManualSuccessMsg] = useState('');

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const canvasRef = useRef(null);
  const [scanStatusMsg, setScanStatusMsg] = useState('Position team in the viewfinder...');
  const groupRollingFramesRef = useRef([]);
  const scanLoopActive = useRef(false);
  const isCheckInRef = useRef(isCheckIn);

  // Auto-logging real-time states and refs
  const [sessionLogged, setSessionLogged] = useState([]);
  const [latestCaptureMsg, setLatestCaptureMsg] = useState('');
  const sessionLoggedIds = useRef(new Set());

  // Flash/Torch states
  const [hasTorch, setHasTorch] = useState(false);
  const [isTorchOn, setIsTorchOn] = useState(false);

  useEffect(() => {
    isCheckInRef.current = isCheckIn;
  }, [isCheckIn]);



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

  const fetchLocation = () => {
    setGpsLoading(true);
    setGpsData(null);
    setErrorMsg('');

    if (!navigator.geolocation) {
      setGpsData({
        lat: null,
        lon: null,
        distance: Infinity,
        accuracy: 0,
        status: 'GPS Unavailable'
      });
      setGpsLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        const dist = calculateDistanceInMeters(
          latitude, 
          longitude, 
          WORKSITE.LATITUDE, 
          WORKSITE.LONGITUDE
        );
        
        setGpsData({
          lat: latitude.toFixed(6),
          lon: longitude.toFixed(6),
          distance: dist,
          accuracy: Math.round(accuracy),
          status: dist <= WORKSITE.RADIUS_METERS ? 'Valid Location' : 'Invalid Location'
        });
        setGpsLoading(false);
      },
      (error) => {
        console.error('Geolocation error:', error);
        setGpsData({
          lat: null,
          lon: null,
          distance: Infinity,
          accuracy: 0,
          status: 'GPS Unavailable'
        });
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleCalibrateGeofence = () => {
    if (!gpsData || !gpsData.lat || !gpsData.lon) return;
    updateWorksiteCoords(gpsData.lat, gpsData.lon);
    alert(`Geofence coordinates centered to: ${gpsData.lat}, ${gpsData.lon}. Status updated to Valid!`);
    fetchLocation();
  };



  const handleStartCamera = async (currentFacingMode = facingMode) => {
    try {
      setErrorMsg('');
      setScanImage(null);
      setDetectedFaces([]);
      setSuccessCount(null);
      setSessionLogged([]);
      setLatestCaptureMsg('');
      sessionLoggedIds.current = new Set();
      setIsCameraActive(true);
      setIsScanning(true);
      setScanStatusMsg('Initializing webcam...');
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
          setScanStatusMsg('Aligning camera... position team in view');
          runGroupAutoScanLoop();
        };
        videoRef.current.play();
      }
    } catch (error) {
      console.error('Camera stream error:', error);
      setErrorMsg('Webcam is unavailable. Please verify device camera permissions.');
      setIsCameraActive(false);
      setIsScanning(false);
    }
  };

  const handleStopCamera = () => {
    scanLoopActive.current = false;
    groupRollingFramesRef.current = [];
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
    setIsScanning(false);
    setHasTorch(false);
    setIsTorchOn(false);
  };

  useEffect(() => {
    Promise.resolve().then(() => {
      fetchLocation();
    });
    
    // Pre-load deep learning face-api models
    loadFaceApiModels().catch(err => {
      console.error('Failed to pre-load face-api models:', err);
    });

    return () => {
      scanLoopActive.current = false;
      handleStopCamera();
    };
  }, []);

  useEffect(() => {
    const syncData = async () => {
      await dbService.syncFromServer();
      updateActiveShift();
    };
    
    syncData();
    const interval = setInterval(syncData, 3000);

    return () => clearInterval(interval);
  }, []);

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

  const runGroupAutoScanLoop = async () => {
    if (!scanLoopActive.current || !videoRef.current || !canvasRef.current) {
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (video.videoWidth === 0 || video.videoHeight === 0) {
      setTimeout(runGroupAutoScanLoop, 150);
      return;
    }

    const isMobile = window.innerWidth < 768;
    const targetW = isMobile ? 450 : 800;
    const targetH = isMobile ? 600 : 450;
    canvas.width = targetW;
    canvas.height = targetH;
    drawImageProp(ctx, video, 0, 0, targetW, targetH);

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = targetW;
    tempCanvas.height = targetH;
    tempCanvas.getContext('2d').drawImage(canvas, 0, 0);
    groupRollingFramesRef.current.push(tempCanvas);
    if (groupRollingFramesRef.current.length > 5) {
      groupRollingFramesRef.current.shift();
    }

    try {
      const employeesDb = dbService.getEmployees();
      const logs = dbService.getAttendance();

      const allFramesDetections = [];
      for (let f = 0; f < groupRollingFramesRef.current.length; f++) {
        const frameCanvas = groupRollingFramesRef.current[f];
        const detections = await detectFacesInCanvas(frameCanvas);
        allFramesDetections.push(detections);
      }

      const tracks = [];
      allFramesDetections.forEach((detectionsInFrame, frameIdx) => {
        detectionsInFrame.forEach(det => {
          if (det.descriptor === null) return;
          let matchedTrackIdx = -1;
          let minCenterDist = 60;
          const detCenter = {
            x: det.box.x + det.box.w / 2,
            y: det.box.y + det.box.h / 2
          };
          tracks.forEach((track, trackIdx) => {
            const lastDet = track[track.length - 1];
            const lastCenter = {
              x: lastDet.box.x + lastDet.box.w / 2,
              y: lastDet.box.y + lastDet.box.h / 2
            };
            const dist = Math.sqrt(Math.pow(detCenter.x - lastCenter.x, 2) + Math.pow(detCenter.y - lastCenter.y, 2));
            if (dist < minCenterDist) {
              minCenterDist = dist;
              matchedTrackIdx = trackIdx;
            }
          });
          if (matchedTrackIdx !== -1) {
            tracks[matchedTrackIdx].push({ ...det, frameIdx });
          } else {
            tracks.push([{ ...det, frameIdx }]);
          }
        });
      });

      const resolvedFaces = await Promise.all(tracks.map(async (track, idx) => {
        const recognitions = await Promise.all(track.map(async (det) => {
          const rec = await recognizeFace(det.descriptor, employeesDb);
          return { rec, det };
        }));

        const qualityDetails = track.map((det) => {
          const frameCanvas = groupRollingFramesRef.current[det.frameIdx];
          return assessFaceQuality(frameCanvas, det.box, det.landmarks);
        });

        const matchCounts = {};
        recognitions.forEach(r => {
          const id = r.rec.matchedEmp ? r.rec.matchedEmp.id : 'UNKNOWN';
          matchCounts[id] = (matchCounts[id] || 0) + 1;
        });

        let consensusEmpId = 'UNKNOWN';
        let maxCount = 0;
        Object.keys(matchCounts).forEach(id => {
          if (matchCounts[id] > maxCount) {
            maxCount = matchCounts[id];
            consensusEmpId = id;
          }
        });

        const matchedEmp = employeesDb.find(e => e.id === consensusEmpId) || null;
        const consensusRecs = recognitions.filter(r => (r.rec.matchedEmp ? r.rec.matchedEmp.id : 'UNKNOWN') === consensusEmpId);
        const avgSimilarity = consensusRecs.reduce((a, b) => a + (b.rec.confidence || 30), 0) / consensusRecs.length;

        const framesLivenessData = qualityDetails.map((q) => ({
          ear: q.leftEAR ? (q.leftEAR + q.rightEAR) / 2 : 0.3,
          yaw: q.yaw || 1.0,
          passiveLiveness: q.passiveLiveness || 95
        }));

        const livenessResult = calculateMultiFrameLiveness(framesLivenessData);
        const avgQualityVal = qualityDetails.reduce((sum, q) => {
          let score = 95;
          if (q.blur < 12) score -= 15;
          if (q.contrast < 25) score -= 15;
          if (q.brightness < 60 || q.brightness > 190) score -= 15;
          return sum + Math.max(20, score);
        }, 0) / qualityDetails.length;

        const avgQuality = Math.round(avgQualityVal);
        const livenessScore = livenessResult.livenessScore;

        let finalScore = Math.round(0.6 * avgSimilarity + 0.2 * livenessScore + 0.2 * avgQuality);
        if (livenessResult.spoofDetected) {
          finalScore = Math.min(finalScore, 40);
        }

        let status = 'Unregistered Person';
        const today = new Date().toDateString();
        const alreadyCheckedIn = matchedEmp && logs.some(a => 
          a.employeeId === matchedEmp.id && 
          new Date(a.checkInTime).toDateString() === today
        );
        const alreadyCheckedOut = matchedEmp && logs.some(a => 
          a.employeeId === matchedEmp.id && 
          new Date(a.checkInTime).toDateString() === today &&
          a.checkOutTime !== null
        );

        if (matchedEmp) {
          if (isCheckInRef.current && alreadyCheckedIn) {
            status = 'Already Checked In';
          } else if (!isCheckInRef.current && !alreadyCheckedIn) {
            status = 'No Active Check-In';
          } else if (!isCheckInRef.current && alreadyCheckedOut) {
            status = 'Already Checked Out';
          } else if (finalScore >= 65) {
            status = 'Recognized';
          } else if (finalScore >= 50) {
            status = 'Manual Review';
          }
        }

        let bestFrameIdx = 0;
        let highestContrast = -1;
        qualityDetails.forEach((q, fIdx) => {
          if (q.contrast > highestContrast) {
            highestContrast = q.contrast;
            bestFrameIdx = fIdx;
          }
        });

        const bestDet = track[bestFrameIdx];
        const bestFrameCanvas = groupRollingFramesRef.current[bestDet.frameIdx];
        const alignedCanvas = alignAndCropFace(bestFrameCanvas, bestDet.landmarks);
        const avatarBase64 = alignedCanvas.toDataURL('image/jpeg', 0.85);

        return {
          id: `F${idx + 1}`,
          name: matchedEmp ? matchedEmp.name : 'Unidentified Face',
          empId: matchedEmp ? matchedEmp.id : 'UNKNOWN',
          confidence: finalScore,
          status,
          box: bestDet.box,
          avatar: avatarBase64,
          qualityScore: avgQuality,
          livenessScore: livenessScore,
          similarityScore: Math.round(avgSimilarity),
          biometricsReport: consensusRecs[0]?.rec.report || compareBiometrics(generateBiometrics('Unknown Face', true), generateBiometrics('Unknown Face', true))
        };
      }));

      setDetectedFaces(resolvedFaces);
      autoLogRecognizedFaces(resolvedFaces);
      setScanStatusMsg(`Scanning active... recognized ${resolvedFaces.filter(r => r.empId !== 'UNKNOWN').length} members`);
      setTimeout(runGroupAutoScanLoop, 500);
    } catch (err) {
      console.error(err);
      setTimeout(runGroupAutoScanLoop, 500);
    }
  };

  const handleOverrideEmployeeId = (faceId, empId) => {
    // Allows admin to correct/re-route matching coordinates in list
    const updated = detectedFaces.map(f => {
      if (f.id === faceId) {
        const emp = employees.find(e => e.id === empId);
        if (emp) {
          const report = compareBiometrics(emp.biometrics, generateBiometrics(emp.name, false));
          return {
            ...f,
            empId: emp.id,
            name: emp.name,
            status: 'Recognized',
            confidence: 99,
            biometricsReport: report
          };
        } else if (empId === 'UNKNOWN') {
          return {
            ...f,
            empId: 'UNKNOWN',
            name: 'Unidentified Face',
            status: 'Unregistered Person',
            confidence: 30,
            biometricsReport: null
          };
        }
      }
      return f;
    });
    setDetectedFaces(updated);
    autoLogRecognizedFaces(updated);
  };

  const autoLogRecognizedFaces = (faces) => {
    if (!faces || faces.length === 0) return;

    const logs = dbService.getAttendance();
    const gpsStatus = gpsData ? gpsData.status : 'GPS Unavailable';
    const today = new Date().toDateString();
    let loggedSomething = false;

    faces.forEach(f => {
      if (f.empId === 'UNKNOWN' || 
          f.status === 'Unregistered Person' || 
          f.status === 'Already Checked In' || 
          f.status === 'Already Checked Out' || 
          f.status === 'No Active Check-In') return;

      if (sessionLoggedIds.current.has(f.empId)) return;

      const alreadyCheckedIn = logs.some(a => 
        a.employeeId === f.empId && 
        new Date(a.checkInTime).toDateString() === today
      );
      const activeCheckIn = logs.find(a => a.employeeId === f.empId && !a.checkOutTime);

      if (isCheckInRef.current) {
        if (alreadyCheckedIn) {
          sessionLoggedIds.current.add(f.empId);
          return;
        }

        const attId = 'ATT' + Math.floor(1000 + Math.random() * 9000);
        const record = {
          id: attId,
          employeeId: f.empId,
          employeeName: f.name,
          checkInTime: new Date().toISOString(),
          checkOutTime: null,
          latitude: gpsData?.lat ? parseFloat(gpsData.lat) : null,
          longitude: gpsData?.lon ? parseFloat(gpsData.lon) : null,
          confidence: f.confidence,
          qualityScore: f.qualityScore || 92,
          livenessScore: f.livenessScore || 95,
          similarityScore: f.similarityScore || f.confidence,
          verificationStatus: f.status === 'Recognized' ? 'Approved' : 'Verification Required',
          attendanceStatus: gpsStatus
        };

        const res = dbService.saveAttendance(record);
        if (res.success) {
          dbService.savePhotos({
            id: 'PH' + Math.floor(1000 + Math.random() * 9000),
            attendanceId: attId,
            originalPhoto: scanImage || f.avatar,
            croppedFace: f.avatar,
            timestamp: new Date().toISOString()
          });
          
          sessionLoggedIds.current.add(f.empId);
          setSessionLogged(prev => [
            { 
              ...f, 
              loggedAt: new Date().toLocaleTimeString(), 
              logType: 'Clock In',
              logId: attId
            }, 
            ...prev
          ]);
          
          const msg = `✓ Attendance captured: ${f.name} (Clocked In)`;
          setLatestCaptureMsg(msg);
          loggedSomething = true;

          setTimeout(() => {
            setLatestCaptureMsg(curr => {
              if (curr === msg) return '';
              return curr;
            });
          }, 4000);
        }
      } else {
        if (!activeCheckIn) {
          sessionLoggedIds.current.add(f.empId);
          return;
        }

        const res = dbService.updateAttendance(activeCheckIn.id, {
          checkOutTime: new Date().toISOString(),
          confidence: Math.round((activeCheckIn.confidence + f.confidence) / 2), 
          attendanceStatus: gpsStatus
        });
        
        if (res.success) {
          sessionLoggedIds.current.add(f.empId);
          setSessionLogged(prev => [
            { 
              ...f, 
              loggedAt: new Date().toLocaleTimeString(), 
              logType: 'Clock Out',
              logId: activeCheckIn.id
            }, 
            ...prev
          ]);
          
          const msg = `✓ Attendance captured: ${f.name} (Clocked Out)`;
          setLatestCaptureMsg(msg);
          loggedSomething = true;

          setTimeout(() => {
            setLatestCaptureMsg(curr => {
              if (curr === msg) return '';
              return curr;
            });
          }, 4000);
        }
      }
    });

    if (loggedSomething) {
      updateActiveShift();
    }
    };

  const handleManualOverrideSubmit = (e) => {
    e.preventDefault();
    setErrorMsg('');
    setManualSuccessMsg('');
    
    if (!manualEmpId) {
      setErrorMsg('Please select an employee profile to override.');
      return;
    }
    
    const targetEmp = employees.find(e => e.id === manualEmpId);
    if (!targetEmp) return;
    
    const overrideDate = new Date(manualTime);
    const today = overrideDate.toDateString();
    const attendanceLogs = dbService.getAttendance();
    
    if (manualType === 'checkin') {
      const alreadyCheckedIn = attendanceLogs.some(a => 
        a.employeeId === targetEmp.id && 
        new Date(a.checkInTime).toDateString() === today
      );
      if (alreadyCheckedIn) {
        setErrorMsg(`Override rejected: ${targetEmp.name} has already checked in on this date.`);
        return;
      }

      const attRecord = {
        id: 'ATT' + Math.floor(1000 + Math.random() * 9000),
        employeeId: targetEmp.id,
        employeeName: targetEmp.name,
        checkInTime: overrideDate.toISOString(),
        checkOutTime: null,
        latitude: WORKSITE.LATITUDE,
        longitude: WORKSITE.LONGITUDE,
        confidence: 100, // Manual overrides get 100% confidence credit
        verificationStatus: 'Approved',
        attendanceStatus: 'Valid Location'
      };

      const res = dbService.saveAttendance(attRecord);
      if (res.success) {
        dbService.savePhotos({
          id: 'PH' + Math.floor(1000 + Math.random() * 9000),
          attendanceId: attRecord.id,
          originalPhoto: targetEmp.avatar,
          croppedFace: targetEmp.avatar,
          timestamp: new Date().toISOString()
        });

        dbService.logAction(
          'Manual Override',
          'System Admin',
          null,
          JSON.stringify(attRecord),
          `Supervisor override check-in logged for ${targetEmp.name}. Justification: ${manualReason || 'Admin adjustment'}.`
        );

        setManualSuccessMsg(`Clock-In override successfully logged for ${targetEmp.name}.`);
        setManualReason('');
      } else {
        setErrorMsg(res.error);
      }
    } else {
      // Manual Clock-Out
      const activeCheckIn = attendanceLogs.find(a => a.employeeId === targetEmp.id && !a.checkOutTime);
      if (!activeCheckIn) {
        setErrorMsg(`Override rejected: No active shift clock-in found for ${targetEmp.name}.`);
        return;
      }

      const oldValue = JSON.stringify(activeCheckIn);
      const updateFields = {
        checkOutTime: overrideDate.toISOString(),
        attendanceStatus: 'Valid Location'
      };

      const res = dbService.updateAttendance(activeCheckIn.id, updateFields);
      if (res.success) {
        dbService.logAction(
          'Manual Override',
          'System Admin',
          oldValue,
          JSON.stringify({ ...activeCheckIn, ...updateFields }),
          `Supervisor override clock-out logged for ${targetEmp.name}. Justification: ${manualReason || 'Admin adjustment'}.`
        );

        setManualSuccessMsg(`Clock-Out override successfully logged for ${targetEmp.name}.`);
        setManualReason('');
      } else {
        setErrorMsg(res.error);
      }
    }

    updateActiveShift();
  };

  const toggleDiagnostics = (faceId) => {
    setShowDiagnostics(prev => ({
      ...prev,
      [faceId]: !prev[faceId]
    }));
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-4 md:space-y-6">
      {/* Title Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-display font-extrabold text-white tracking-tight">
            Shift Scanning Terminal
          </h2>
          <p className="text-xs text-dark-400 mt-1">
            Webcam shift clock-in/out scanner console. Automatically checks for multiple faces and processes them individually.
          </p>
        </div>
        
        {/* Active Shift Card */}
        <div className="flex items-center space-x-2 text-xs bg-dark-900 border border-dark-800 rounded-xl px-4 py-2 text-dark-300">
          <Clock className="h-4 w-4 text-brand-400 animate-pulse" />
          <span className="font-semibold">{activeShiftEmployees.length} Workers Active in Shift</span>
        </div>
      </div>

      {/* Geofence Info & Console Toolbar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="glass-card lg:col-span-2 p-5 rounded-2xl border border-dark-800 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center space-x-3.5">
            <div className="p-3 bg-brand-500/10 rounded-xl border border-brand-500/20 text-brand-400">
              <MapPin className="h-5.5 w-5.5" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-dark-400">Site Geofencing Status</p>
              {gpsLoading ? (
                <p className="text-xs font-semibold text-dark-300 mt-1 flex items-center">
                  <RefreshCw className="h-3 w-3 mr-1 animate-spin text-brand-400" /> Tracking browser GPS perimeter...
                </p>
              ) : gpsData ? (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-xs">
                  <span className={`font-extrabold ${gpsData.status === 'Valid Location' ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {gpsData.status}
                  </span>
                  <span className="text-dark-500">•</span>
                  <span className="text-dark-300">Worksite Distance: {gpsData.distance === Infinity ? 'N/A' : `${gpsData.distance}m`}</span>
                  <span className="text-dark-500">•</span>
                  <span className="text-dark-400 text-[10px]">Precision: {gpsData.accuracy}m</span>
                </div>
              ) : (
                <p className="text-xs text-dark-500 mt-1">Status Uninitialized</p>
              )}
            </div>
          </div>
          
          <div className="flex space-x-2 w-full md:w-auto">
            <button
              onClick={fetchLocation}
              className="flex-1 md:flex-initial px-4 py-2 bg-dark-900 border border-dark-800 text-xs font-bold rounded-xl text-brand-400 hover:bg-dark-800 transition"
            >
              Recenter GPS
            </button>
            {gpsData && gpsData.status === 'Invalid Location' && (
              <button
                onClick={handleCalibrateGeofence}
                className="flex-1 md:flex-initial px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-md glow-green transition"
                title="Re-centers geofence map coordinates to match your current supervisor browser coordinate coordinates."
              >
                Calibrate Center
              </button>
            )}
          </div>
        </div>

        {/* Action Controls Panel */}
        <div className="glass-card p-5 rounded-2xl border border-dark-800 flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-[10px] uppercase font-bold text-dark-400">Terminal Mode</p>
            <div className="flex bg-dark-950 p-1 rounded-xl border border-dark-850 mt-1">
              <button
                onClick={() => { setScannerMode('camera'); setManualSuccessMsg(''); setErrorMsg(''); }}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition ${
                  scannerMode === 'camera' 
                    ? 'bg-brand-600 text-white glow-blue' 
                    : 'text-dark-400 hover:text-white'
                }`}
              >
                Shift Terminal
              </button>
              <button
                onClick={() => { setScannerMode('manual'); setDetectedFaces([]); setScanImage(null); }}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition ${
                  scannerMode === 'manual' 
                    ? 'bg-brand-600 text-white glow-blue' 
                    : 'text-dark-400 hover:text-white'
                }`}
              >
                Manual Entry
              </button>
            </div>
          </div>
        </div>
      </div>

      {scannerMode === 'camera' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Left 2 Columns: Video Scanner Panel */}
          <div className="lg:col-span-2 space-y-4">
            <div className="glass-panel p-5 rounded-2xl border border-dark-800/60 flex flex-col space-y-4">
              
              {/* Scan Toolbar */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-dark-900 pb-4">
                <div className="flex items-center space-x-2">
                  <span className="p-1.5 bg-brand-500/10 border border-brand-500/20 text-brand-400 rounded-lg">
                    <Video className="h-4 w-4" />
                  </span>
                  <div>
                    <h3 className="text-xs font-bold text-white">Live Scanner Frame</h3>
                    <p className="text-[10px] text-dark-400 mt-0.5">Captures single or multiple worker identities side-by-side.</p>
                  </div>
                </div>
              </div>


              {/* Viewport */}
              <div className="relative aspect-[3/4] md:aspect-[16/9] bg-dark-950 rounded-xl overflow-hidden border border-dark-850 flex items-center justify-center">
                {/* On-screen auto-captured banner */}
                {latestCaptureMsg && (
                  <div className="absolute top-4 left-4 right-4 bg-emerald-500/95 backdrop-blur-md border border-emerald-400 text-white px-4 py-3 rounded-xl flex items-center justify-between shadow-2xl z-30 transition-all duration-300 animate-slide-down">
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <span className="p-1 bg-white/20 rounded-lg flex-shrink-0">
                        <Check className="h-4 w-4 text-white font-extrabold" />
                      </span>
                      <p className="text-xs font-bold truncate">{latestCaptureMsg}</p>
                    </div>
                    <button 
                      type="button"
                      onClick={() => setLatestCaptureMsg('')} 
                      className="text-white hover:text-emerald-100 transition cursor-pointer p-1"
                    >
                      <XCircle className="h-4.5 w-4.5" />
                    </button>
                  </div>
                )}

                {isCameraActive && (
                  <>
                    <video 
                      ref={videoRef} 
                      className={`w-full h-full object-cover ${facingMode === 'user' ? 'transform -scale-x-100' : ''}`}
                      playsInline 
                      muted 
                    />
                    {isCameraActive && (
                      <>
                        {/* Face Detection Status Bar — top of viewport */}
                        <div className="absolute top-4 left-4 z-20">
                          {detectedFaces.length === 0 ? (
                            <div className="flex items-center space-x-1.5 bg-dark-950/85 backdrop-blur-sm border border-dark-800 px-3 py-1.5 rounded-full shadow-lg">
                              <span className="w-2 h-2 rounded-full bg-brand-400 animate-pulse flex-shrink-0" />
                              <span className="text-[10px] font-bold text-dark-300 tracking-wide uppercase">Scanning for faces...</span>
                            </div>
                          ) : (
                            <div className="flex items-center space-x-1.5 bg-dark-950/85 backdrop-blur-sm border border-emerald-500/30 px-3 py-1.5 rounded-full shadow-lg">
                              <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
                              <span className="text-[10px] font-bold text-white tracking-wide">
                                {detectedFaces.length} face{detectedFaces.length > 1 ? 's' : ''} detected
                              </span>
                              {detectedFaces.filter(f => f.empId !== 'UNKNOWN').length > 0 && (
                                <span className="text-[9px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/25 px-1.5 py-0.5 rounded-full font-bold">
                                  {detectedFaces.filter(f => f.empId !== 'UNKNOWN').length} matched
                                </span>
                              )}
                              {detectedFaces.filter(f => f.empId === 'UNKNOWN').length > 0 && (
                                <span className="text-[9px] bg-rose-500/20 text-rose-400 border border-rose-500/25 px-1.5 py-0.5 rounded-full font-bold">
                                  {detectedFaces.filter(f => f.empId === 'UNKNOWN').length} unknown
                                </span>
                              )}
                            </div>
                          )}
                        </div>

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

                        {/* End Streaming button */}
                        <button
                          type="button"
                          onClick={handleStopCamera}
                          className="absolute bottom-6 left-1/2 transform -translate-x-1/2 px-6 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-full flex items-center space-x-2 border border-rose-500/25 font-bold text-xs tracking-wider shadow-xl glow-red transition z-20 cursor-pointer"
                        >
                          <StopCircle className="h-4 w-4 animate-pulse" />
                          <span>End Streaming / Stop Scanner</span>
                        </button>
                      </>
                    )}
                  </>
                )}
                
                {/* Captured snapshot representation */}
                {scanImage && (
                  <>
                    <img src={scanImage} className="w-full h-full object-cover opacity-60" alt="Captured Frame" />
                    {!isScanning && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center space-y-3 bg-dark-950/40">
                        <button
                          onClick={() => {
                            setScanImage(null);
                            setDetectedFaces([]);
                            setErrorMsg('');
                            setSuccessCount(null);
                            handleStartCamera();
                          }}
                          className="px-5 py-2.5 bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold rounded-xl shadow-lg glow-blue transition cursor-pointer flex items-center space-x-2"
                        >
                          <Camera className="h-4 w-4" />
                          <span>Retake Picture / Reset Scanner</span>
                        </button>
                        {detectedFaces.length === 0 && (
                          <p className="text-[10px] text-rose-450 bg-dark-950/80 px-3 py-1.5 border border-rose-500/20 rounded-full font-bold">
                            ⚠️ No faces detected in the image. Please retake.
                          </p>
                        )}
                      </div>
                    )}
                  </>
                )}

                {/* Hidden processing canvas */}
                <canvas ref={canvasRef} className="hidden" />

                {/* laser scanner animations */}
                {isScanning && (
                  <div className="absolute inset-0 bg-brand-500/5 flex items-center justify-center z-10">
                    <div className="laser-scanner" />
                    <p className="absolute bottom-6 bg-dark-950/80 px-4 py-2 border border-brand-500/20 text-[10px] uppercase font-bold text-brand-400 rounded-xl tracking-widest animate-pulse">
                      {scanStatusMsg}
                    </p>
                  </div>
                )}

                {/* Camera fallback screen */}
                {!isCameraActive && !scanImage && (
                  <div className="flex flex-col items-center justify-center text-center p-8 text-dark-500 space-y-3">
                    <Camera className="h-10 w-10 text-dark-600" />
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-white">Scanner Standby Mode</p>
                      <p className="text-[10px] text-dark-400">Initialize webcam streams or select preset templates to run log scan.</p>
                    </div>
                    <button
                      onClick={handleStartCamera}
                      className="px-5 py-2.5 bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold rounded-xl shadow-lg glow-blue transition"
                    >
                      Start Webcam Scanner
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Dynamic Shift Controls & Outcome */}
          <div className="space-y-6">
            <div className="glass-panel p-6 rounded-2xl border border-dark-800/60 space-y-5">
              <div>
                <h3 className="text-sm font-display font-extrabold text-white">Shift Registry Dispatcher</h3>
                <p className="text-[10px] text-dark-400 mt-1">Define check-in/out mode and save attendance to shift log records.</p>
              </div>

              {/* Mode Toggle */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-dark-400 uppercase">Clocking Mode Action</label>
                <div className="grid grid-cols-2 bg-dark-950 p-1 rounded-xl border border-dark-850">
                  <button
                    type="button"
                    onClick={() => { 
                      setIsCheckIn(true); 
                      setSuccessCount(null); 
                      handleStopCamera();
                      sessionLoggedIds.current = new Set();
                      setSessionLogged([]);
                    }}
                    className={`py-2 rounded-lg text-xs font-bold flex items-center justify-center space-x-1.5 transition ${
                      isCheckIn 
                        ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-extrabold shadow-sm' 
                        : 'text-dark-400 hover:text-white'
                    }`}
                  >
                    <UserCheck className="h-4 w-4" />
                    <span>Clock In Shift</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { 
                      setIsCheckIn(false); 
                      setSuccessCount(null); 
                      handleStopCamera();
                      sessionLoggedIds.current = new Set();
                      setSessionLogged([]);
                    }}
                    className={`py-2 rounded-lg text-xs font-bold flex items-center justify-center space-x-1.5 transition ${
                      !isCheckIn 
                        ? 'bg-brand-500/10 border border-brand-500/20 text-brand-400 font-extrabold shadow-sm' 
                        : 'text-dark-400 hover:text-white'
                    }`}
                  >
                    <UserMinus className="h-4 w-4" />
                    <span>Clock Out Shift</span>
                  </button>
                </div>
              </div>

              {/* Error Box */}
              {errorMsg && (
                <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-xs flex items-start space-x-2 leading-relaxed">
                  <XCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Success Count Box */}
              {successCount !== null && (
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl space-y-2">
                  <p className="text-emerald-400 text-xs font-bold flex items-center">
                    <ShieldCheck className="h-4.5 w-4.5 mr-1 text-emerald-400 animate-bounce" />
                    Shift Log Transaction Wrote!
                  </p>
                  <p className="text-[10px] text-dark-300 leading-relaxed">
                    Successfully saved attendance logs for <strong>{successCount} workers</strong>. Time cards logged, photo proofs stored, and audit trail ledger created.
                  </p>
                  <button
                    onClick={() => { setSuccessCount(null); handleStartCamera(); }}
                    className="w-full py-2 bg-dark-900 hover:bg-dark-800 border border-dark-800 text-[10px] text-white font-bold rounded-xl transition"
                  >
                    Scan Next Shift Group
                  </button>
                </div>
              )}

              {/* Auto-Logged Session Feed */}
              <div className="space-y-3 pt-2 border-t border-dark-900">
                <div className="flex items-center justify-between pb-1">
                  <span className="text-[10px] font-bold text-dark-400 uppercase">Logged in Session ({sessionLogged.length})</span>
                  {sessionLogged.length > 0 && (
                    <span className="text-[9px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 border border-emerald-500/20 rounded-full font-bold">
                      Real-time Auto Saved
                    </span>
                  )}
                </div>

                {sessionLogged.length === 0 ? (
                  <div className="py-8 text-center text-dark-500 text-[10px] bg-dark-950/20 border border-dashed border-dark-900 rounded-xl leading-relaxed p-4">
                    <Users className="h-6 w-6 mx-auto mb-2 text-dark-600 animate-pulse" />
                    <p className="font-semibold text-dark-400">Webcam Scanner Active</p>
                    <p className="text-[9px] text-dark-500 mt-1">Stand in front of the camera. Resolved faces will automatically check in/out in real-time.</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                    {sessionLogged.map((log) => (
                      <div key={log.logId || log.empId} className="flex items-center justify-between p-2.5 bg-dark-950/50 border border-dark-850 rounded-xl hover:border-dark-700 transition">
                        <div className="flex items-center space-x-2.5 min-w-0">
                          <img 
                            src={log.avatar} 
                            className="w-8 h-8 rounded-lg object-cover border border-dark-800 bg-dark-900 flex-shrink-0" 
                            alt={log.name} 
                          />
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-white truncate leading-tight">{log.name}</p>
                            <p className="text-[9px] text-dark-500 font-mono truncate mt-0.5">{log.empId}</p>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold ${
                            log.logType === 'Clock In' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/15' : 'bg-brand-500/10 text-brand-400 border border-brand-500/15'
                          }`}>
                            {log.logType}
                          </span>
                          <p className="text-[8px] text-dark-500 font-mono mt-1">{log.loggedAt}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

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
      ) : (
        /* Manual Override entry console view */
        <div className="max-w-xl mx-auto glass-panel p-6 rounded-2xl border border-dark-800/60 space-y-4">
          <div>
            <h3 className="text-sm font-display font-extrabold text-white flex items-center space-x-2">
              <Sliders className="h-4.5 w-4.5 text-brand-400" />
              <span>Supervisor Manual Log Override</span>
            </h3>
            <p className="text-[10px] text-dark-400 mt-1">
              Bypasses spatial matching vectors and locks coordinates validation. Authenticated manually by administrative supervisors.
            </p>
          </div>

          <form onSubmit={handleManualOverrideSubmit} className="space-y-4 text-xs">
            {errorMsg && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs rounded-xl flex items-center space-x-2">
                <XCircle className="h-4 w-4 flex-shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}
            
            {manualSuccessMsg && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs rounded-xl flex items-center space-x-2">
                <CheckCircle className="h-4 w-4 flex-shrink-0" />
                <span>{manualSuccessMsg}</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-dark-400 uppercase">Employee Profile</label>
                <select
                  value={manualEmpId}
                  onChange={(e) => setManualEmpId(e.target.value)}
                  className="w-full bg-dark-950 border border-dark-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-brand-500"
                >
                  <option value="">Select Employee...</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.name} ({emp.id})</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-dark-400 uppercase">Transaction Action</label>
                <select
                  value={manualType}
                  onChange={(e) => setManualType(e.target.value)}
                  className="w-full bg-dark-950 border border-dark-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-brand-500"
                >
                  <option value="checkin">Clock In Manual</option>
                  <option value="checkout">Clock Out Manual</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-dark-400 uppercase">Timestamp Lock</label>
              <input
                type="datetime-local"
                value={manualTime}
                onChange={(e) => setManualTime(e.target.value)}
                className="w-full bg-dark-950 border border-dark-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-500"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-dark-400 uppercase">Override Justification Notes</label>
              <textarea
                value={manualReason}
                onChange={(e) => setManualReason(e.target.value)}
                placeholder="Specify override reasons (e.g. employee left phone, webcam network error, etc.)..."
                className="w-full bg-dark-950 border border-dark-800 rounded-xl px-3 py-2 text-xs text-white h-20 resize-none focus:outline-none focus:border-brand-500"
                required
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-brand-600 hover:bg-brand-500 text-white font-bold text-xs rounded-xl shadow-lg glow-blue transition"
            >
              Sign Override Card & Save Log
            </button>
          </form>
        </div>
      )}

      {/* Grid of Results (Single or Multiple Detected Faces) */}
      {scannerMode === 'camera' && detectedFaces.length > 0 && (
        <div className="space-y-4">
          <h4 className="font-display font-extrabold text-sm text-white">Detected Face Output Results ({detectedFaces.length})</h4>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {detectedFaces.map((f) => (
              <div key={f.id} className="glass-panel p-4 rounded-2xl border border-dark-800/80 space-y-3 flex flex-col justify-between">
                
                {/* Result header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2.5">
                    <img 
                      src={f.avatar} 
                      className="w-10 h-10 rounded-lg object-cover border border-dark-800 bg-dark-950" 
                      alt="Crop" 
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white truncate leading-tight">{f.name}</p>
                      <p className="text-[9px] text-dark-500 font-mono truncate mt-0.5">ID: {f.empId}</p>
                    </div>
                  </div>
                  
                  {/* Confidence text */}
                  <div className="text-right">
                    <p className={`text-xs font-extrabold ${
                      f.status === 'Recognized' 
                        ? 'text-emerald-400' 
                        : f.status === 'Manual Review' 
                          ? 'text-amber-400' 
                          : f.status === 'Already Checked In' || f.status === 'Already Checked Out' || f.status === 'No Active Check-In'
                            ? 'text-blue-400'
                            : 'text-rose-500'
                    }`}>
                      {f.confidence}%
                    </p>
                    <p className="text-[8px] text-dark-500 uppercase mt-0.5">Score</p>
                  </div>
                </div>

                {/* Status indicator */}
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-dark-500 font-medium">Status Match:</span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full font-bold border ${
                    f.status === 'Recognized'
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                      : f.status === 'Manual Review'
                        ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                        : f.status === 'Already Checked In' || f.status === 'Already Checked Out' || f.status === 'No Active Check-In'
                          ? 'bg-blue-500/10 border-blue-500/20 text-blue-400'
                          : 'bg-rose-500/10 border-rose-500/20 text-rose-500 animate-pulse'
                  }`}>
                    {f.status}
                  </span>
                </div>

                {/* Telemetry indexes */}
                <div className="grid grid-cols-3 gap-1 bg-dark-950 p-2 rounded-lg text-center border border-dark-850">
                  <div>
                    <p className="text-[8px] text-dark-500 font-bold uppercase tracking-wider">Quality</p>
                    <p className={`text-[10px] font-extrabold ${f.qualityScore >= 80 ? 'text-emerald-400' : 'text-amber-500'}`}>{f.qualityScore || 0}%</p>
                  </div>
                  <div>
                    <p className="text-[8px] text-dark-500 font-bold uppercase tracking-wider">Liveness</p>
                    <p className={`text-[10px] font-extrabold ${f.livenessScore >= 75 ? 'text-emerald-400' : 'text-rose-450'}`}>{f.livenessScore || 0}%</p>
                  </div>
                  <div>
                    <p className="text-[8px] text-dark-500 font-bold uppercase tracking-wider">Similarity</p>
                    <p className={`text-[10px] font-extrabold ${f.similarityScore >= 80 ? 'text-emerald-400' : 'text-amber-500'}`}>{f.similarityScore || 0}%</p>
                  </div>
                </div>

                {/* Admin Assignment override dropdown */}
                <div className="space-y-1">
                  <label className="text-[8px] font-bold text-dark-500 uppercase tracking-wider">Correct Identity Override</label>
                  <select
                    value={f.empId}
                    onChange={(e) => handleOverrideEmployeeId(f.id, e.target.value)}
                    className="w-full bg-dark-950 border border-dark-850 rounded-lg px-2 py-1.5 text-[10px] text-white focus:outline-none"
                  >
                    <option value="UNKNOWN">Unidentified Face</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.name}</option>
                    ))}
                  </select>
                </div>

                {/* Biometrics Parameters Diagnostics */}
                {f.biometricsReport && (
                  <div className="border border-dark-850 rounded-lg overflow-hidden text-[9px] mt-1">
                    <button
                      type="button"
                      onClick={() => toggleDiagnostics(f.id)}
                      className="w-full px-2 py-1.5 bg-dark-900/60 flex items-center justify-between text-dark-400 hover:text-white font-bold"
                    >
                      <span>🔍 Diagnostics</span>
                      <span>{showDiagnostics[f.id] ? '▲' : '▼'}</span>
                    </button>
                    {showDiagnostics[f.id] && (
                      <div className="bg-dark-950 p-2 divide-y divide-dark-900 space-y-1 font-mono">
                        {f.biometricsReport.parameters.slice(0, 5).map((p, idx) => (
                          <div key={idx} className="flex justify-between py-0.5">
                            <span className="text-dark-500 truncate max-w-[80px]">{p.name.replace(' (IPD)', '')}</span>
                            <span className={p.status === 'Match' ? 'text-emerald-400' : 'text-rose-400'}>
                              {p.status === 'Match' ? '✓' : '✗'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
