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
  ZapOff,
  X,
  StopCircle
} from 'lucide-react';
import { dbService, WORKSITE } from '../db/dbService';
import { 
  calculateDistanceInMeters, 
  cropFaceFromCanvas, 
  compareBiometrics, 
  generateBiometrics, 
  recognizeFace, 
  detectFacesInCanvas,
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
  const [detectedFaces, setDetectedFaces] = useState([]);
  
  const rollingFramesRef = useRef([]);
  const scanLoopActive = useRef(false);
  const scanTimeoutRef = useRef(null);
  const isCheckInRef = useRef(isCheckIn);
  const activeEmployeeRef = useRef(activeEmployee);



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
  const gpsDataRef = useRef(null);

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
    gpsDataRef.current = gpsData;
  }, [gpsData]);

  useEffect(() => {
    isCheckInRef.current = isCheckIn;
  }, [isCheckIn]);

  useEffect(() => {
    activeEmployeeRef.current = activeEmployee;
  }, [activeEmployee]);

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

    const refreshLogs = async () => {
      await dbService.syncFromServer();
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
    setErrorMsg('');

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
              setErrorMsg(`GPS Error: ${originalError || 'Not supported/blocked'}. IP Fallback failed: ${finalErr.message}`);
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

  const handleStartCamera = async (currentFacingMode = facingMode) => {
    try {
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
        scanTimeoutRef.current = null;
      }
      setErrorMsg('');
      setSuccessMsg('');
      setScanImage(null);
      setIsCameraActive(true);
      setIsScanning(true);
      setScanStatusMsg('Initializing webcam...');
      rollingFramesRef.current = [];
      setDetectedFaces([]);
      
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
    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current);
      scanTimeoutRef.current = null;
    }
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
    setDetectedFaces([]);
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
      scanTimeoutRef.current = setTimeout(runAutoScanLoop, 150);
      return;
    }

    canvas.width = 640;
    canvas.height = 480;
    drawImageProp(ctx, video, 0, 0, 640, 480);

    const frameCanvas = document.createElement('canvas');
    frameCanvas.width = 640;
    frameCanvas.height = 480;
    frameCanvas.getContext('2d').drawImage(canvas, 0, 0);

    try {
      const logs = dbService.getAttendance();
      const employeesDb = dbService.getEmployees();

      // Detect faces in the new frame canvas
      const newDetections = await detectFacesInCanvas(frameCanvas);
      rollingFramesRef.current.push({ canvas: frameCanvas, detections: newDetections });
      if (rollingFramesRef.current.length > 5) {
        rollingFramesRef.current.shift();
      }

      // Track detections across frames
      const allFramesDetections = rollingFramesRef.current.map(f => f.detections);

      // Track detections across frames
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

      // Resolve each track (consensus matching against activeEmployeeRef.current)
      const resolvedFaces = await Promise.all(tracks.map(async (track, idx) => {
        const recognitions = await Promise.all(track.map(async (det) => {
          // Match against activeEmployeeRef.current specifically
          const rec = await recognizeFace(det.descriptor, [activeEmployeeRef.current]);
          return { rec, det };
        }));

        const qualityDetails = track.map((det) => {
          const frameCanvas = rollingFramesRef.current ? rollingFramesRef.current[det.frameIdx].canvas : null;
          if (!frameCanvas) {
            return { passed: false, reason: 'Invalid frame canvas reference', blur: 0, contrast: 0, brightness: 0 };
          }
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

        const matchedEmp = (activeEmployeeRef.current.id === consensusEmpId) ? activeEmployeeRef.current : null;
        const consensusRecs = recognitions.filter(r => (r.rec.matchedEmp ? r.rec.matchedEmp.id : 'UNKNOWN') === consensusEmpId);
        const avgSimilarity = consensusRecs.reduce((a, b) => a + (b.rec.confidence || 30), 0) / consensusRecs.length;

        const framesLivenessData = qualityDetails.map((q) => ({
          ear: (q.leftEAR !== undefined && q.rightEAR !== undefined) ? (q.leftEAR + q.rightEAR) / 2 : 0.3,
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
          } else if (finalScore >= 75) {
            // Register success if EITHER blink OR motion (nod/head turn) is detected
            if (livenessResult.blinkDetected || livenessResult.motionDetected) {
              status = 'Recognized';
            } else {
              status = 'Blink Required';
            }
          } else if (finalScore >= 60) {
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
        const bestFrameCanvas = rollingFramesRef.current ? rollingFramesRef.current[bestDet.frameIdx].canvas : null;
        if (!bestFrameCanvas) {
          return null;
        }
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
          biometricsReport: consensusRecs[0]?.rec.report || compareBiometrics(generateBiometrics('Unknown Face', true), generateBiometrics('Unknown Face', true)),
          spoofDetected: livenessResult.spoofDetected,
          blinkDetected: livenessResult.blinkDetected,
          motionDetected: livenessResult.motionDetected
        };
      }));

      const validResolvedFaces = resolvedFaces.filter(f => f !== null);
      setDetectedFaces(validResolvedFaces);

      // Now process matching results specifically for activeEmployeeRef.current
      const matchedFace = validResolvedFaces.find(f => f.empId === activeEmployeeRef.current.id);
      if (matchedFace) {
        const finalScore = matchedFace.confidence;
        const status = matchedFace.status;

        if (status === 'Already Checked In') {
          setErrorMsg('You have already checked in today.');
          scanLoopActive.current = false;
          handleStopCamera();
          return;
        } else if (status === 'No Active Check-In') {
          setErrorMsg('No active check-in transaction found for today.');
          scanLoopActive.current = false;
          handleStopCamera();
          return;
        } else if (status === 'Already Checked Out') {
          setErrorMsg('You have already checked out today.');
          scanLoopActive.current = false;
          handleStopCamera();
          return;
        }

        // Require at least 3 frames for robust logging verification
        if (rollingFramesRef.current.length >= 3) {
          if (matchedFace.spoofDetected) {
            setScanStatusMsg('Biometrics mismatch or spoof detected.');
            scanTimeoutRef.current = setTimeout(runAutoScanLoop, 350);
            return;
          }

          if (status === 'Blink Required') {
            setScanStatusMsg('Liveness check: Please blink or turn your head to verify.');
            scanTimeoutRef.current = setTimeout(runAutoScanLoop, 350);
            return;
          }

          if (status === 'Recognized' || status === 'Manual Review') {
            scanLoopActive.current = false;
            const photoBase64 = canvas.toDataURL('image/jpeg', 0.85);
            setScanImage(photoBase64);
            handleStopCamera();

            const gpsStatus = gpsDataRef.current ? gpsDataRef.current.status : 'GPS Unavailable';
            let resolutionStatus = 'Approved';
            if (status === 'Manual Review') {
              resolutionStatus = 'Verification Required';
            }

            const today = new Date().toDateString();

            if (isCheckInRef.current) {
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
                qualityScore: matchedFace.qualityScore,
                livenessScore: matchedFace.livenessScore,
                similarityScore: matchedFace.similarityScore,
                verificationStatus: resolutionStatus,
                attendanceStatus: gpsStatus
              };

              const res = dbService.saveAttendance(record);
              if (res.success) {
                dbService.savePhotos({
                  id: 'PH' + Math.floor(1000 + Math.random() * 9000),
                  attendanceId: attId,
                  originalPhoto: photoBase64,
                  croppedFace: matchedFace.avatar,
                  timestamp: new Date().toISOString()
                });
                setSuccessMsg(`Checked In Successfully! Timecard Resolution: ${resolutionStatus}.`);
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
                confidence: Math.round((activeCheckIn.confidence + finalScore) / 2),
                attendanceStatus: gpsStatus
              });

              if (res.success) {
                setSuccessMsg('Checked Out Successfully! Timecard updated.');
              } else {
                setErrorMsg(res.error || 'Failed to update checkout.');
              }
            }
            return;
          }
        } else {
          setScanStatusMsg('Acquiring multi-frame liveness telemetry...');
        }
      } else {
        setScanStatusMsg('Aligning camera... position your face');
      }

      scanTimeoutRef.current = setTimeout(runAutoScanLoop, 350);
    } catch (err) {
      console.error(err);
      scanTimeoutRef.current = setTimeout(runAutoScanLoop, 350);
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
                <p className="text-dark-500 font-bold uppercase tracking-wider">GPS Coordinates</p>
                {gpsLoading ? (
                  <p className="text-dark-400 mt-0.5">Fetching location coordinates...</p>
                ) : gpsData && gpsData.lat ? (
                  <p className="text-emerald-400 font-bold mt-0.5">
                    {gpsData.lat}, {gpsData.lon}
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
          </div>          {/* GPS Location Status Bar */}
          <div className="glass-panel p-4 rounded-2xl border border-dark-800/60 flex flex-col md:flex-row justify-between items-center gap-4 mb-6">
            <div className="flex items-center space-x-3.5 w-full md:w-auto">
              <div className={`p-2.5 rounded-xl border ${
                gpsLoading 
                  ? 'bg-brand-500/10 border-brand-500/20 text-brand-400'
                  : gpsData?.status?.startsWith('GPS Captured')
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                    : 'bg-dark-800/40 border-dark-800/60 text-dark-400'
              }`}>
                <MapPin className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] uppercase font-bold text-dark-400 tracking-wider">Your Verification Location</p>
                {gpsLoading ? (
                  <p className="text-xs font-semibold text-dark-300 mt-0.5 flex items-center">
                    <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin text-brand-400" /> Tracking GPS coordinates...
                  </p>
                ) : gpsData ? (
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-0.5 text-xs">
                    <span className={`font-extrabold ${gpsData.status?.startsWith('GPS Captured') ? 'text-emerald-400' : 'text-rose-450'}`}>
                      {gpsData.status}
                    </span>
                    {gpsData.lat && (
                      <>
                        <span className="text-dark-500">•</span>
                        <span className="text-dark-300 font-semibold font-mono">Coords: {gpsData.lat}, {gpsData.lon}</span>
                      </>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-dark-500 mt-0.5">GPS location uninitialized. Please refresh.</p>
                )}
              </div>
            </div>
            
            <button
              onClick={fetchLocation}
              disabled={gpsLoading}
              className="w-full md:w-auto px-4 py-2 bg-dark-900 hover:bg-dark-800 border border-dark-800 text-xs font-bold text-brand-400 rounded-xl transition flex items-center justify-center space-x-1.5 cursor-pointer disabled:opacity-55 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${gpsLoading ? 'animate-spin' : ''}`} />
              <span>Refresh Location</span>
            </button>
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
                        <>
                          {/* Face Detection Status Bar — top-left of viewport */}
                          <div className="absolute top-4 left-4 z-20">
                            {detectedFaces.length === 0 ? (
                              <div className="flex items-center space-x-1.5 bg-dark-950/85 backdrop-blur-sm border border-dark-800 px-3 py-1.5 rounded-full shadow-lg">
                                <span className="w-2 h-2 rounded-full bg-brand-400 animate-pulse flex-shrink-0" />
                                <span className="text-[10px] font-bold text-dark-300 tracking-wide uppercase">Scanning for face...</span>
                              </div>
                            ) : (
                              <div className="flex items-center space-x-1.5 bg-dark-950/85 backdrop-blur-sm border border-emerald-500/30 px-3 py-1.5 rounded-full shadow-lg">
                                <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
                                <span className="text-[10px] font-bold text-white tracking-wide">
                                  Face detected
                                </span>
                                {detectedFaces[0].empId !== 'UNKNOWN' && (
                                  <span className="text-[9px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/25 px-1.5 py-0.5 rounded-full font-bold">
                                    Matched ({detectedFaces[0].confidence}%)
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
                          className="absolute bottom-6 left-1/2 transform -translate-x-1/2 px-6 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-full flex items-center space-x-2 border border-rose-500/25 font-bold text-xs tracking-wider shadow-xl transition z-20 cursor-pointer"
                        >
                          <StopCircle className="h-4 w-4 animate-pulse" />
                          <span>End Streaming / Stop Scanner</span>
                        </button>
                      </>
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

              {/* Detected Face Output Results */}
              {detectedFaces.length > 0 && (
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-200">
                  <h4 className="font-display font-extrabold text-xs text-dark-400 uppercase tracking-wider">Detected Face Output Results</h4>
                  
                  <div className="grid grid-cols-1 gap-5">
                    {detectedFaces.map((f) => (
                      <div 
                        key={f.id} 
                        className="glass-panel p-4 rounded-2xl border border-dark-800/80 space-y-3 flex flex-col justify-between"
                      >
                        {/* Card header */}
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
                          
                          <div className="text-right">
                            <p className={`text-xs font-extrabold ${f.status === 'Recognized' ? 'text-emerald-400' : 'text-rose-450'}`}>
                              {f.confidence}%
                            </p>
                            <p className="text-[8px] text-dark-500 uppercase mt-0.5">Score</p>
                          </div>
                        </div>

                        {/* Status details */}
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-dark-500 font-medium">Status Match:</span>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full font-bold border text-[9px] ${
                            f.status === 'Recognized'
                              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                              : f.status === 'Blink Required'
                                ? 'bg-amber-500/10 border-amber-500/20 text-amber-400 animate-pulse'
                                : 'bg-rose-500/10 border-rose-500/20 text-rose-500'
                          }`}>
                            {f.status}
                          </span>
                        </div>

                        {/* Liveness Check */}
                        {f.empId !== 'UNKNOWN' && (f.status === 'Recognized' || f.status === 'Blink Required') && (
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="text-dark-500 font-medium">Liveness Check:</span>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full font-bold border text-[9px] ${
                              (f.blinkDetected || f.motionDetected)
                                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                                : 'bg-amber-500/10 border-amber-500/20 text-amber-400 animate-pulse'
                            }`}>
                              {(f.blinkDetected || f.motionDetected) ? 'Verified ✓' : 'Blink or Turn Head'}
                            </span>
                          </div>
                        )}

                        {/* Telemetry indexes */}
                        <div className="grid grid-cols-3 gap-1 bg-dark-950 p-2 rounded-lg text-center border border-dark-850">
                          <div>
                            <p className="text-[8px] text-dark-500 font-bold uppercase tracking-wider">Quality</p>
                            <p className="text-[10px] font-extrabold text-emerald-400">{f.qualityScore}%</p>
                          </div>
                          <div>
                            <p className="text-[8px] text-dark-500 font-bold uppercase tracking-wider">Liveness</p>
                            <p className="text-[10px] font-extrabold text-emerald-400">{f.livenessScore}%</p>
                          </div>
                          <div>
                            <p className="text-[8px] text-dark-500 font-bold uppercase tracking-wider">Similarity</p>
                            <p className="text-[10px] font-extrabold text-emerald-400">{f.similarityScore}%</p>
                          </div>
                        </div>

                        {/* Diagnostics Details */}
                        {f.biometricsReport && (
                          <div className="border border-dark-850 rounded-lg overflow-hidden text-[9px] mt-1">
                            <div className="bg-dark-900/60 px-2 py-1.5 flex items-center justify-between text-dark-400 font-bold border-b border-dark-850">
                              <span>🔍 Diagnostics Parameters</span>
                            </div>
                            <div className="bg-dark-950 p-2 divide-y divide-dark-900 space-y-1 font-mono">
                              {f.biometricsReport.parameters?.slice(0, 5).map((p, idx) => (
                                <div key={idx} className="flex justify-between py-0.5">
                                  <span className="text-dark-500 truncate max-w-[120px]">{p.name.replace(' (IPD)', '')}</span>
                                  <span className={p.status === 'Match' ? 'text-emerald-400' : 'text-rose-450'}>
                                    {p.status === 'Match' ? '✓' : '✗'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Quick Status receipts & notifications */}
            <div className="space-y-4">
              
              {/* Shift Registry Dispatcher Toggle */}
              <div className="glass-panel p-6 rounded-2xl border border-dark-800/60 space-y-5">
                <div>
                  <h3 className="text-sm font-display font-extrabold text-white">Shift Registry Dispatcher</h3>
                  <p className="text-[10px] text-dark-400 mt-1">Define check-in/out mode and save attendance to shift log records.</p>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-dark-400 uppercase">Clocking Mode Action</label>
                  <div className="grid grid-cols-2 bg-dark-950 p-1 rounded-xl border border-dark-850">
                    <button
                      type="button"
                      onClick={() => { 
                        setIsCheckIn(true); 
                        setSuccessMsg(''); 
                        setErrorMsg(''); 
                        setScanImage(null); 
                        handleStopCamera(); 
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
                        setSuccessMsg(''); 
                        setErrorMsg(''); 
                        setScanImage(null); 
                        handleStopCamera(); 
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
              </div>
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
