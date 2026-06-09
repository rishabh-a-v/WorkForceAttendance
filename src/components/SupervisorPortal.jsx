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
  Zap,
  ZapOff,
  StopCircle
} from 'lucide-react';
import { dbService, WORKSITE } from '../db/dbService';
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

const generateRandomId = (prefix) => {
  return prefix + Math.floor(1000 + Math.random() * 9000);
};

// Preset shift templates representing group shifts (essential for simulation/testing)
const TEAM_TEMPLATES = [
  {
    id: 'SHIFT_A',
    name: 'Shift A - Packing Packers (4 Faces Preset)',
    img: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450" fill="none"><rect width="800" height="450" fill="%230f172a"/><rect x="80" y="80" width="140" height="240" rx="16" fill="%231e293b" stroke="%23334155" stroke-width="2"/><rect x="250" y="80" width="140" height="240" rx="16" fill="%231e293b" stroke="%23334155" stroke-width="2"/><rect x="420" y="80" width="140" height="240" rx="16" fill="%231e293b" stroke="%23334155" stroke-width="2"/><rect x="590" y="80" width="140" height="240" rx="16" fill="%231e293b" stroke="%23334155" stroke-width="2"/><circle cx="150" cy="150" r="40" fill="%2338bdf8"/><circle cx="320" cy="150" r="40" fill="%23f472b6"/><circle cx="490" cy="150" r="40" fill="%2394a3b8"/><circle cx="660" cy="150" r="40" fill="%2334d399"/><text x="400" y="380" fill="%2364748b" font-size="16" font-family="sans-serif" font-weight="bold" text-anchor="middle">PACKING LINE TEAM A</text></svg>',
    faces: [
      { id: 'F1', name: 'Worker 1', empId: 'EMP001', confidence: 98, status: 'Recognized', box: { x: 100, y: 100, w: 100, h: 100 }, avatar: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none"><circle cx="50" cy="50" r="50" fill="%231e293b"/><path d="M50 82c16.5 0 30-10.5 30-22c0-1.5-1-4.5-3-5.5c-3-1.5-7-.5-10 .5c-5 1.5-12 1.5-17 0c-3-1-7-2-10-.5C37 56 36 59 36 60.5C36 71.5 49.5 82 50 82z" fill="%230c85e9"/><circle cx="50" cy="40" r="18" fill="%2338bdf8"/><path d="M50 25c6 0 10 4 10 9s-4 7-10 7s-10-2-10-7s4-9 10-9z" fill="%230284c7"/></svg>' },
      { id: 'F2', name: 'Worker 2', empId: 'EMP002', confidence: 95, status: 'Recognized', box: { x: 270, y: 100, w: 100, h: 100 }, avatar: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none"><circle cx="50" cy="50" r="50" fill="%231e293b"/><path d="M50 82c16.5 0 30-10.5 30-22c0-1.5-1-4.5-3-5.5c-3-1.5-7-.5-10 .5c-5 1.5-12 1.5-17 0c-3-1-7-2-10-.5C37 56 36 59 36 60.5C36 71.5 49.5 82 50 82z" fill="%23ec4899"/><circle cx="50" cy="40" r="18" fill="%23f472b6"/><path d="M50 25c6 0 9 4 9 9s-3 7-9 7s-9-2-9-7s3-9 9-9z" fill="%23db2777"/></svg>' },
      { id: 'F3', name: 'Unidentified Face', empId: 'UNKNOWN', confidence: 42, status: 'Manual Review', box: { x: 440, y: 100, w: 100, h: 100 }, avatar: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none"><circle cx="50" cy="50" r="50" fill="%23334155"/><path d="M50 82c16.5 0 30-10.5 30-22c0-1.5-1-4.5-3-5.5c-3-1.5-7-.5-10 .5c-5 1.5-12 1.5-17 0c-3-1-7-2-10-.5C37 56 36 59 36 60.5C36 71.5 49.5 82 50 82z" fill="%2364748b"/><circle cx="50" cy="40" r="18" fill="%2394a3b8"/><path d="M47 28h6v12h-6zm0 16h6v6h-6z" fill="%230f172a"/></svg>' },
      { id: 'F4', name: 'Worker 3', empId: 'EMP003', confidence: 78, status: 'Manual Review', box: { x: 610, y: 100, w: 100, h: 100 }, avatar: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none"><circle cx="50" cy="50" r="50" fill="%231e293b"/><path d="M50 82c16.5 0 30-10.5 30-22c0-1.5-1-4.5-3-5.5c-3-1.5-7-.5-10 .5c-5 1.5-12 1.5-17 0c-3-1-7-2-10-.5C37 56 36 59 36 60.5C36 71.5 49.5 82 50 82z" fill="%2310b981"/><circle cx="50" cy="40" r="18" fill="%2334d399"/><path d="M50 25c6 0 10 4 10 9s-4 7-10 7s-10-2-10-7s4-9 10-9z" fill="%23059669"/></svg>' }
    ]
  }
];

export default function SupervisorPortal({ currentUser }) {
  const [employees] = useState(() => dbService.getEmployees());

  // Group Scanner and Manual Entry States
  const [scannerMode, setScannerMode] = useState('camera'); // 'camera' or 'manual'
  const [activeShiftEmployees, setActiveShiftEmployees] = useState(() => {
    const attendance = dbService.getAttendance();
    const today = new Date().toDateString();
    return attendance.filter(a => 
      new Date(a.checkInTime).toDateString() === today && 
      !a.checkOutTime && 
      a.employeeId !== 'UNKNOWN'
    );
  });
  const [sessionLogged, setSessionLogged] = useState([]);
  const [latestCaptureMsg, setLatestCaptureMsg] = useState('');
  const [showDiagnostics, setShowDiagnostics] = useState({});
  const sessionLoggedIds = useRef(new Set());

  // Manual override states
  const [manualEmpId, setManualEmpId] = useState('');
  const [manualType, setManualType] = useState('checkin');
  const [manualTime, setManualTime] = useState(new Date().toISOString().slice(0, 16));
  const [manualReason, setManualReason] = useState('');
  const [manualSuccessMsg, setManualSuccessMsg] = useState('');

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
      () => {
        setGpsData({ lat: null, lon: null, distance: Infinity, status: 'GPS Unavailable' });
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  // ==========================================
  // TAB B: GROUP SCAN (BULK ATTENDANCE SCAN)
  // ==========================================
  const [isGroupCheckIn, setIsGroupCheckIn] = useState(true);
  const [groupInputSource, setGroupInputSource] = useState('webcam');
  const [isGroupCameraActive, setIsGroupCameraActive] = useState(false);
  const [isGroupScanning, setIsGroupScanning] = useState(false);
  const [groupScanImage, setGroupScanImage] = useState(null);
  const [groupDetectedFaces, setGroupDetectedFaces] = useState([]);
  const [groupErrorMsg, setGroupErrorMsg] = useState('');
  const [groupSuccessCount, setGroupSuccessCount] = useState(null);
  const [selectedTemplateIdx, setSelectedTemplateIdx] = useState('');
  const [groupFacingMode, setGroupFacingMode] = useState('user');
  const [groupScanStatusMsg, setGroupScanStatusMsg] = useState('Position face in the viewfinder...');
  const [groupHasTorch, setGroupHasTorch] = useState(false);
  const [groupIsTorchOn, setGroupIsTorchOn] = useState(false);
  
  const groupVideoRef = useRef(null);
  const groupStreamRef = useRef(null);
  const groupCanvasRef = useRef(null);
  const groupRollingFramesRef = useRef([]);
  const groupScanLoopActive = useRef(false);
  const isGroupCheckInRef = useRef(isGroupCheckIn);
  useEffect(() => { isGroupCheckInRef.current = isGroupCheckIn; }, [isGroupCheckIn]);

  const startGroupCamera = async (currentFacingMode = groupFacingMode) => {
    try {
      setGroupErrorMsg('');
      setGroupScanImage(null);
      setGroupDetectedFaces([]);
      setGroupSuccessCount(null);
      setSessionLogged([]);
      setLatestCaptureMsg('');
      sessionLoggedIds.current = new Set();
      setIsGroupCameraActive(true);
      setIsGroupScanning(true);
      setGroupScanStatusMsg('Initializing webcam...');
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
        groupVideoRef.current.onplay = () => {
          groupScanLoopActive.current = true;
          setGroupScanStatusMsg('Aligning camera... position face in view');
          runGroupAutoScanLoop();
        };
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
      // Safety stop of cameras on unmount
      stopGroupCamera();
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

  const runGroupAutoScanLoop = async () => {
    if (!groupScanLoopActive.current || !groupVideoRef.current || !groupCanvasRef.current) {
      return;
    }

    const video = groupVideoRef.current;
    const canvas = groupCanvasRef.current;
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
          if (isGroupCheckInRef.current && alreadyCheckedIn) {
            status = 'Already Checked In';
          } else if (!isGroupCheckInRef.current && !alreadyCheckedIn) {
            status = 'No Active Check-In';
          } else if (!isGroupCheckInRef.current && alreadyCheckedOut) {
            status = 'Already Checked Out';
          } else if (finalScore >= 75) {
            status = 'Recognized';
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

      setGroupDetectedFaces(resolvedFaces);
      autoLogRecognizedFaces(resolvedFaces);
      setGroupScanStatusMsg(`Scanning active... recognized ${resolvedFaces.filter(r => r.empId !== 'UNKNOWN').length} members`);
      setTimeout(runGroupAutoScanLoop, 500);
    } catch (err) {
      console.error(err);
      setTimeout(runGroupAutoScanLoop, 500);
    }
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

      if (isGroupCheckInRef.current) {
        if (alreadyCheckedIn) {
          sessionLoggedIds.current.add(f.empId);
          return;
        }

        const attId = generateRandomId('ATT');
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
            id: generateRandomId('PH'),
            attendanceId: attId,
            originalPhoto: groupScanImage || f.avatar,
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

  const handleSelectTemplate = (idx) => {
    setSelectedTemplateIdx(idx);
    if (idx === '') return;
    const template = TEAM_TEMPLATES[idx];
    setGroupScanImage(template.img);
    processFrame(idx);
  };

  const processFrame = async (activeIdx = selectedTemplateIdx) => {
    setIsGroupScanning(true);
    await new Promise(r => setTimeout(r, 1500));
    const faces = TEAM_TEMPLATES[activeIdx].faces;
    setGroupDetectedFaces(faces);
    autoLogRecognizedFaces(faces);
    setIsGroupScanning(false);
  };

  const handleOverrideEmployeeId = (faceId, empId) => {
    const updated = groupDetectedFaces.map(f => {
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
            biometricsReport: report,
            isOverride: true
          };
        } else if (empId === 'UNKNOWN') {
          return {
            ...f,
            empId: 'UNKNOWN',
            name: 'Unidentified Face',
            status: 'Unregistered Person',
            confidence: 30,
            biometricsReport: null,
            isOverride: false
          };
        }
      }
      return f;
    });
    setGroupDetectedFaces(updated);
    if (isGroupCameraActive) {
      autoLogRecognizedFaces(updated);
    }
  };

  const toggleDiagnostics = (faceId) => {
    setShowDiagnostics(prev => ({
      ...prev,
      [faceId]: !prev[faceId]
    }));
  };

  const handleManualOverrideSubmit = (e) => {
    e.preventDefault();
    setGroupErrorMsg('');
    setManualSuccessMsg('');
    
    if (!manualEmpId) {
      setGroupErrorMsg('Please select an employee profile to override.');
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
        setGroupErrorMsg(`Override rejected: ${targetEmp.name} has already checked in on this date.`);
        return;
      }

      const attRecord = {
        id: generateRandomId('ATT'),
        employeeId: targetEmp.id,
        employeeName: targetEmp.name,
        checkInTime: overrideDate.toISOString(),
        checkOutTime: null,
        latitude: WORKSITE.LATITUDE,
        longitude: WORKSITE.LONGITUDE,
        confidence: 100, // Manual overrides get 100% confidence credit
        verificationStatus: 'Verification Required', // Restricted access: Supervisor logs require verification
        attendanceStatus: 'Valid Location'
      };

      const res = dbService.saveAttendance(attRecord);
      if (res.success) {
        dbService.savePhotos({
          id: generateRandomId('PH'),
          attendanceId: attRecord.id,
          originalPhoto: targetEmp.avatar,
          croppedFace: targetEmp.avatar,
          timestamp: new Date().toISOString()
        });

        dbService.logAction(
          'Manual Override',
          currentUser.name,
          null,
          JSON.stringify(attRecord),
          `Supervisor override check-in logged for ${targetEmp.name}. Justification: ${manualReason || 'Supervisor adjustment'}.`
        );

        setManualSuccessMsg(`Clock-In override successfully logged for ${targetEmp.name}. Requires admin approval.`);
        setManualReason('');
      } else {
        setGroupErrorMsg(res.error);
      }
    } else {
      // Manual Clock-Out
      const activeCheckIn = attendanceLogs.find(a => a.employeeId === targetEmp.id && !a.checkOutTime);
      if (!activeCheckIn) {
        setGroupErrorMsg(`Override rejected: No active shift clock-in found for ${targetEmp.name}.`);
        return;
      }

      const oldValue = JSON.stringify(activeCheckIn);
      const updateFields = {
        checkOutTime: overrideDate.toISOString(),
        attendanceStatus: 'Valid Location',
        verificationStatus: 'Verification Required' // Restricted access
      };

      const res = dbService.updateAttendance(activeCheckIn.id, updateFields);
      if (res.success) {
        dbService.logAction(
          'Manual Override',
          currentUser.name,
          oldValue,
          JSON.stringify({ ...activeCheckIn, ...updateFields }),
          `Supervisor override clock-out logged for ${targetEmp.name}. Justification: ${manualReason || 'Supervisor adjustment'}.`
        );

        setManualSuccessMsg(`Clock-Out override successfully logged for ${targetEmp.name}. Requires admin approval.`);
        setManualReason('');
      } else {
        setGroupErrorMsg(res.error);
      }
    }

    updateActiveShift();
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
              setSelectedTemplateIdx('');
              setSessionLogged([]);
              setLatestCaptureMsg('');
              sessionLoggedIds.current = new Set();
              setManualEmpId('');
              setManualType('checkin');
              setManualTime(new Date().toISOString().slice(0, 16));
              setManualReason('');
              setManualSuccessMsg('');
              fetchLocation();
            }}
            className="p-2 bg-dark-900 hover:bg-dark-800 border border-dark-800 text-dark-400 hover:text-white rounded-xl transition cursor-pointer"
            title="Refresh scanner"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Geofence Info & Console Toolbar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 glass-panel p-5 rounded-2xl border border-dark-800/60 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center space-x-3.5">
            <div className="p-3 bg-violet-500/10 border border-violet-500/20 text-violet-400 rounded-xl">
              <MapPin className="h-5.5 w-5.5" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-dark-400">Site Geofencing Status</p>
              {gpsLoading ? (
                <p className="text-xs font-semibold text-dark-300 mt-1 flex items-center">
                  <RefreshCw className="h-3 w-3 mr-1 animate-spin text-violet-400" /> Tracking browser GPS perimeter...
                </p>
              ) : gpsData ? (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-xs">
                  <span className={`font-extrabold ${gpsData.status === 'Valid Location' ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {gpsData.status}
                  </span>
                  <span className="text-dark-500">•</span>
                  <span className="text-dark-300">Worksite Distance: {gpsData.distance === Infinity ? 'N/A' : `${gpsData.distance}m`}</span>
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
          <div className="space-y-1">
            <p className="text-[10px] uppercase font-bold text-dark-400">Terminal Mode</p>
            <div className="flex bg-dark-950 p-1 rounded-xl border border-dark-850 mt-1">
              <button
                onClick={() => { setScannerMode('camera'); setManualSuccessMsg(''); setGroupErrorMsg(''); }}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  scannerMode === 'camera' 
                    ? 'bg-violet-600 text-white shadow-md' 
                    : 'text-dark-400 hover:text-white'
                }`}
              >
                Shift Terminal
              </button>
              <button
                onClick={() => { setScannerMode('manual'); setGroupDetectedFaces([]); setGroupScanImage(null); }}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  scannerMode === 'manual' 
                    ? 'bg-violet-600 text-white shadow-md' 
                    : 'text-dark-400 hover:text-white'
                }`}
              >
                Manual Entry
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="w-full">
        <div className="space-y-6">
            {scannerMode === 'camera' ? (
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

                      {/* Input Source Selector / Preset template Selector */}
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          value={groupInputSource}
                          onChange={(e) => {
                            setGroupInputSource(e.target.value);
                            stopGroupCamera();
                            setGroupScanImage(null);
                            setGroupDetectedFaces([]);
                            setSelectedTemplateIdx('');
                          }}
                          className="bg-dark-900 border border-dark-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none cursor-pointer"
                        >
                          <option value="webcam">Live Video Webcam</option>
                          <option value="preset">Preset Team Snapshots</option>
                        </select>

                        {groupInputSource === 'preset' && (
                          <select
                            value={selectedTemplateIdx}
                            onChange={(e) => handleSelectTemplate(e.target.value)}
                            className="bg-dark-900 border border-dark-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none cursor-pointer"
                          >
                            <option value="">Select Team Preset...</option>
                            {TEAM_TEMPLATES.map((t, idx) => (
                              <option key={t.id} value={idx}>{t.name}</option>
                            ))}
                          </select>
                        )}
                      </div>
                    </div>

                    {/* Viewport Box */}
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

                      {isGroupCameraActive && (
                        <>
                          <video 
                            ref={groupVideoRef} 
                            className={`w-full h-full object-cover ${groupFacingMode === 'user' ? 'transform -scale-x-100' : ''}`}
                            playsInline 
                            muted 
                          />
                          {isGroupCameraActive && (
                            <>
                              {/* Face Detection Status Bar — top of viewport */}
                              <div className="absolute top-4 left-4 z-20">
                                {groupDetectedFaces.length === 0 ? (
                                  <div className="flex items-center space-x-1.5 bg-dark-950/85 backdrop-blur-sm border border-dark-800 px-3 py-1.5 rounded-full shadow-lg">
                                    <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse flex-shrink-0" />
                                    <span className="text-[10px] font-bold text-dark-300 tracking-wide uppercase">Scanning for faces...</span>
                                  </div>
                                ) : (
                                  <div className="flex items-center space-x-1.5 bg-dark-950/85 backdrop-blur-sm border border-emerald-500/30 px-3 py-1.5 rounded-full shadow-lg">
                                    <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
                                    <span className="text-[10px] font-bold text-white tracking-wide">
                                      {groupDetectedFaces.length} face{groupDetectedFaces.length > 1 ? 's' : ''} detected
                                    </span>
                                    {groupDetectedFaces.filter(f => f.empId !== 'UNKNOWN').length > 0 && (
                                      <span className="text-[9px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/25 px-1.5 py-0.5 rounded-full font-bold">
                                        {groupDetectedFaces.filter(f => f.empId !== 'UNKNOWN').length} matched
                                      </span>
                                    )}
                                    {groupDetectedFaces.filter(f => f.empId === 'UNKNOWN').length > 0 && (
                                      <span className="text-[9px] bg-rose-500/20 text-rose-400 border border-rose-500/25 px-1.5 py-0.5 rounded-full font-bold">
                                        {groupDetectedFaces.filter(f => f.empId === 'UNKNOWN').length} unknown
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>

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

                              {/* End Streaming button */}
                              <button
                                type="button"
                                onClick={stopGroupCamera}
                                className="absolute bottom-6 left-1/2 transform -translate-x-1/2 px-6 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-full flex items-center space-x-2 border border-rose-500/25 font-bold text-xs tracking-wider shadow-xl transition z-20 cursor-pointer"
                              >
                                <StopCircle className="h-4 w-4 animate-pulse" />
                                <span>End Streaming / Stop Scanner</span>
                              </button>
                            </>
                          )}
                        </>
                      )}
                      
                      {groupScanImage && (
                        <>
                          <img src={groupScanImage} className="w-full h-full object-cover opacity-60" alt="Captured Frame" />
                          {!isGroupScanning && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center space-y-3 bg-dark-950/40">
                              <button
                                onClick={() => {
                                  setGroupScanImage(null);
                                  setGroupDetectedFaces([]);
                                  setGroupErrorMsg('');
                                  setGroupSuccessCount(null);
                                  startGroupCamera();
                                }}
                                className="px-5 py-2.5 bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold rounded-xl shadow-lg transition cursor-pointer flex items-center space-x-2"
                              >
                                <Camera className="h-4 w-4" />
                                <span>Retake Picture / Reset Scanner</span>
                              </button>
                              {groupDetectedFaces.length === 0 && (
                                <p className="text-[10px] text-rose-455 bg-dark-950/80 px-3 py-1.5 border border-rose-500/20 rounded-full font-bold">
                                  ⚠️ No faces detected in the image. Please retake.
                                </p>
                              )}
                            </div>
                          )}
                        </>
                      )}

                      {/* Hidden processing canvas */}
                      <canvas ref={groupCanvasRef} className="hidden" />

                      {/* laser scanner animations */}
                      {isGroupScanning && (
                        <div className="absolute inset-0 bg-violet-500/5 flex items-center justify-center z-10">
                          <div className="laser-scanner" />
                          <p className="absolute bottom-6 bg-dark-950/80 px-4 py-2 border border-violet-500/20 text-[10px] uppercase font-bold text-violet-400 rounded-xl tracking-widest animate-pulse">
                            {groupScanStatusMsg}
                          </p>
                        </div>
                      )}

                      {/* Camera fallback screen */}
                      {!isGroupCameraActive && !groupScanImage && (
                        <div className="flex flex-col items-center justify-center text-center p-8 text-dark-500 space-y-3">
                          <Camera className="h-10 w-10 text-dark-600" />
                          <div className="space-y-1">
                            <p className="text-xs font-semibold text-white">Scanner Standby Mode</p>
                            <p className="text-[10px] text-dark-400">Initialize webcam streams or select preset templates to run log scan.</p>
                          </div>
                          <button
                            onClick={startGroupCamera}
                            className="px-5 py-2.5 bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold rounded-xl shadow-lg transition"
                          >
                            Start Webcam Scanner
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right column: Controls & outcomes */}
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
                            setIsGroupCheckIn(true); 
                            setGroupSuccessCount(null); 
                            stopGroupCamera();
                            sessionLoggedIds.current = new Set();
                            setSessionLogged([]);
                          }}
                          className={`py-2 rounded-lg text-xs font-bold flex items-center justify-center space-x-1.5 transition cursor-pointer ${
                            isGroupCheckIn 
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
                            setIsGroupCheckIn(false); 
                            setGroupSuccessCount(null); 
                            stopGroupCamera();
                            sessionLoggedIds.current = new Set();
                            setSessionLogged([]);
                          }}
                          className={`py-2 rounded-lg text-xs font-bold flex items-center justify-center space-x-1.5 transition cursor-pointer ${
                            !isGroupCheckIn 
                              ? 'bg-violet-500/10 border border-violet-500/20 text-violet-400 font-extrabold shadow-sm' 
                              : 'text-dark-400 hover:text-white'
                          }`}
                        >
                          <UserMinus className="h-4 w-4" />
                          <span>Clock Out Shift</span>
                        </button>
                      </div>
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
                          Shift Log Transaction Complete!
                        </p>
                        <p className="text-[10px] text-dark-300 leading-relaxed">
                          Successfully saved attendance logs for <strong>{groupSuccessCount} workers</strong>. Time cards logged and photo proofs stored.
                        </p>
                        <button
                          onClick={() => { setGroupSuccessCount(null); if (groupInputSource === 'webcam') startGroupCamera(); }}
                          className="w-full py-2 bg-dark-900 hover:bg-dark-800 border border-dark-800 text-[10px] text-white font-bold rounded-xl transition cursor-pointer"
                        >
                          Scan Next Shift Group
                        </button>
                      </div>
                    )}

                    {/* Auto-Logged Session Feed */}
                    {isGroupCameraActive && (
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
                          <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
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
            ) : (
              /* Manual Entry Form */
              <div className="max-w-xl mx-auto glass-panel p-6 rounded-2xl border border-dark-800/60 space-y-4">
                <div>
                  <h3 className="text-sm font-display font-extrabold text-white flex items-center space-x-2">
                    <Sliders className="h-4.5 w-4.5 text-violet-400" />
                    <span>Supervisor Manual Log Override</span>
                  </h3>
                  <p className="text-[10px] text-dark-400 mt-1">
                    Bypasses spatial matching vectors and locks coordinates validation. Requires administrative approval.
                  </p>
                </div>

                <form onSubmit={handleManualOverrideSubmit} className="space-y-4 text-xs">
                  {groupErrorMsg && (
                    <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-455 text-xs rounded-xl flex items-center space-x-2">
                      <XCircle className="h-4 w-4 flex-shrink-0" />
                      <span>{groupErrorMsg}</span>
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
                        className="w-full bg-dark-950 border border-dark-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-violet-500 cursor-pointer"
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
                        className="w-full bg-dark-950 border border-dark-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-violet-500 cursor-pointer"
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
                      className="w-full bg-dark-950 border border-dark-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-violet-500"
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-dark-400 uppercase">Override Justification Notes</label>
                    <textarea
                      value={manualReason}
                      onChange={(e) => setManualReason(e.target.value)}
                      placeholder="Specify override reasons (e.g. employee left phone, webcam network error, etc.)..."
                      className="w-full bg-dark-950 border border-dark-800 rounded-xl px-3 py-2 text-xs text-white h-20 resize-none focus:outline-none focus:border-violet-500"
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-3 bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs rounded-xl shadow-lg transition cursor-pointer"
                  >
                    Sign Override Card & Save Log
                  </button>
                </form>
              </div>
            )}

            {/* Grid of Results (Single or Multiple Detected Faces) */}
            {scannerMode === 'camera' && groupDetectedFaces.length > 0 && (
              <div className="space-y-4">
                <h4 className="font-display font-extrabold text-sm text-white">Detected Face Output Results ({groupDetectedFaces.length})</h4>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                  {groupDetectedFaces.map((f) => {
                    const isManualReview = f.status === 'Manual Review';
                    const isUnknown = f.empId === 'UNKNOWN';
                    
                    return (
                      <div 
                        key={f.id} 
                        className={`glass-panel p-4 rounded-2xl border transition-all duration-300 flex flex-col justify-between space-y-3 ${
                          f.isOverride 
                            ? 'border-violet-550 bg-violet-950/5' 
                            : isUnknown 
                              ? 'border-rose-500/50 bg-rose-500/5' 
                              : isManualReview 
                                ? 'border-amber-500/50 bg-amber-500/5' 
                                : f.status === 'Already Checked In' || f.status === 'Already Checked Out' || f.status === 'No Active Check-In'
                                  ? 'border-blue-500/50 bg-blue-500/5'
                                  : 'border-emerald-500/40'
                        }`}
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
                            <p className={`text-xs font-extrabold ${
                              isUnknown 
                                ? 'text-rose-455' 
                                : isManualReview 
                                  ? 'text-amber-400' 
                                  : f.status === 'Already Checked In' || f.status === 'Already Checked Out' || f.status === 'No Active Check-In'
                                    ? 'text-blue-400'
                                    : 'text-emerald-400'
                            }`}>
                              {f.confidence}%
                            </p>
                            <p className="text-[8px] text-dark-500 uppercase mt-0.5">Score</p>
                          </div>
                        </div>

                        {/* Status tag */}
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-dark-500 font-medium">Status Match:</span>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full font-bold border text-[8px] uppercase tracking-wider ${
                            f.isOverride
                              ? 'bg-violet-500/10 border-violet-500/20 text-violet-400'
                              : isUnknown
                                ? 'bg-rose-500/10 border-rose-500/20 text-rose-455 animate-pulse'
                                : isManualReview
                                  ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                                  : f.status === 'Already Checked In' || f.status === 'Already Checked Out' || f.status === 'No Active Check-In'
                                    ? 'bg-blue-500/10 border-blue-500/20 text-blue-400'
                                    : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                          }`}>
                            {f.isOverride ? 'Supervisor Override' : f.status}
                          </span>
                        </div>

                        {/* Telemetry data indexes */}
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

                        {/* Supervisor manual override picker */}
                        <div className="space-y-1">
                          <label className="text-[8px] font-bold text-dark-500 uppercase tracking-wider">Manual Identity Picker</label>
                          <select
                            value={f.empId}
                            onChange={(e) => handleOverrideEmployeeId(f.id, e.target.value)}
                            className="w-full bg-dark-950 border border-dark-850 rounded-lg px-2 py-1.5 text-[10px] text-white focus:outline-none focus:border-violet-500 transition cursor-pointer"
                          >
                            <option value="UNKNOWN">Unrecognized Person</option>
                            {employees.map(emp => (
                              <option key={emp.id} value={emp.id}>{emp.name} ({emp.id})</option>
                            ))}
                          </select>
                        </div>

                        {/* Diagnostics toggle details */}
                        {f.biometricsReport && (
                          <div className="border border-dark-850 rounded-lg overflow-hidden text-[9px] mt-1">
                            <button
                              type="button"
                              onClick={() => toggleDiagnostics(f.id)}
                              className="w-full px-2 py-1.5 bg-dark-900/60 flex items-center justify-between text-dark-400 hover:text-white font-bold cursor-pointer"
                            >
                              <span>🔍 Diagnostics</span>
                              <span>{showDiagnostics[f.id] ? '▲' : '▼'}</span>
                            </button>
                            {showDiagnostics[f.id] && (
                              <div className="bg-dark-950 p-2 divide-y divide-dark-900 space-y-1 font-mono">
                                {f.biometricsReport.parameters.slice(0, 5).map((p, idx) => (
                                  <div key={idx} className="flex justify-between py-0.5">
                                    <span className="text-dark-500 truncate max-w-[85px]">{p.name.replace(' (IPD)', '')}</span>
                                    <span className={p.status === 'Match' ? 'text-emerald-400' : 'text-rose-455'}>
                                      {p.status === 'Match' ? '✓' : '✗'}
                                    </span>
                                  </div>
                                )) }
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
      </div>
    </div>
  );
}
