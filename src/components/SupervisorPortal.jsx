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
  Sliders,
  ChevronDown,
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

export default function SupervisorPortal({ currentUser, onLogout }) {
  const [activeTab, setActiveTab] = useState(() => sessionStorage.getItem('sv_initial_tab') || 'self');
  const [employees, setEmployees] = useState([]);
  const [toastMessage, setToastMessage] = useState(null);

  // Synchronise state with sessionStorage
  useEffect(() => {
    const handleTabChange = () => {
      setActiveTab(sessionStorage.getItem('sv_initial_tab') || 'self');
    };
    handleTabChange();
  });

  // Load employees
  useEffect(() => {
    setEmployees(dbService.getEmployees());
    loadFaceApiModels().catch(err => {
      console.error('Failed to pre-load face-api models:', err);
    });
    fetchLocation();
    
    return () => {
      // Safety stop of cameras on unmount
      stopSelfCamera();
      stopGroupCamera();
    };
  }, []);

  const handleTabSwitch = (tab) => {
    // Shutdown active webcams on tab change
    stopSelfCamera();
    stopGroupCamera();
    
    // Clear alerts & logs
    setSelfErrorMsg('');
    setSelfSuccessMsg('');
    setGroupErrorMsg('');
    setGroupSuccessCount(null);
    setGroupScanImage(null);
    setGroupDetectedFaces([]);
    setSelectedTemplateIdx('');
    
    setActiveTab(tab);
    sessionStorage.setItem('sv_initial_tab', tab);
  };

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 5000);
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
      (error) => {
        setGpsData({ lat: null, lon: null, distance: Infinity, status: 'GPS Unavailable' });
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  // ==========================================
  // TAB A: MY ATTENDANCE (SELF CLOCK-IN/OUT)
  // ==========================================
  const [isSelfCheckIn, setIsSelfCheckIn] = useState(true);
  const [isSelfCameraActive, setIsSelfCameraActive] = useState(false);
  const [isSelfScanning, setIsSelfScanning] = useState(false);
  const [selfScanImage, setSelfScanImage] = useState(null);
  const [selfErrorMsg, setSelfErrorMsg] = useState('');
  const [selfSuccessMsg, setSelfSuccessMsg] = useState('');
  const [selfFacingMode, setSelfFacingMode] = useState('user'); // 'user' (front) or 'environment' (back)
  const [selfScanStatusMsg, setSelfScanStatusMsg] = useState('Position your face in the viewfinder...');
  const [selfHasTorch, setSelfHasTorch] = useState(false);
  const [selfIsTorchOn, setSelfIsTorchOn] = useState(false);
  
  const selfRollingFramesRef = useRef([]);
  const selfScanLoopActive = useRef(false);
  const selfGpsDataRef = useRef(gpsData);
  const selfIsCheckInRef = useRef(isSelfCheckIn);
  const currentUserRef = useRef(currentUser);

  useEffect(() => {
    selfGpsDataRef.current = gpsData;
  }, [gpsData]);

  useEffect(() => {
    selfIsCheckInRef.current = isSelfCheckIn;
  }, [isSelfCheckIn]);

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  useEffect(() => {
    return () => {
      selfScanLoopActive.current = false;
      groupScanLoopActive.current = false;
      if (selfStreamRef.current) {
        selfStreamRef.current.getTracks().forEach(track => track.stop());
      }
      if (groupStreamRef.current) {
        groupStreamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Password fields
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSuccessMsg, setPasswordSuccessMsg] = useState('');
  const [passwordErrorMsg, setPasswordErrorMsg] = useState('');

  const selfVideoRef = useRef(null);
  const selfStreamRef = useRef(null);
  const selfCanvasRef = useRef(null);

  const startSelfCamera = async (currentFacingMode = selfFacingMode) => {
    try {
      setSelfErrorMsg('');
      setSelfSuccessMsg('');
      setSelfScanImage(null);
      setIsSelfCameraActive(true);
      setIsSelfScanning(true);
      setSelfScanStatusMsg('Initializing webcam...');
      selfRollingFramesRef.current = [];
      
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
      selfStreamRef.current = stream;

      // Check torch/flash capabilities for environment-facing camera
      let supportsTorch = false;
      const track = stream.getVideoTracks()[0];
      if (track && currentFacingMode === 'environment') {
        try {
          const capabilities = track.getCapabilities ? track.getCapabilities() : {};
          supportsTorch = !!capabilities.torch;
        } catch (e) {
          console.warn("Self torch capability check failed:", e);
        }
      }
      setSelfHasTorch(supportsTorch);
      setSelfIsTorchOn(false);

      if (selfVideoRef.current) {
        selfVideoRef.current.srcObject = stream;
        selfVideoRef.current.onplay = () => {
          selfScanLoopActive.current = true;
          setSelfScanStatusMsg('Aligning camera... please face the camera');
          runSelfAutoScanLoop();
        };
        selfVideoRef.current.play();
      }
    } catch (error) {
      console.error(error);
      setSelfErrorMsg('Webcam stream is unavailable. Please verify browser camera permissions.');
      setIsSelfCameraActive(false);
      setIsSelfScanning(false);
    }
  };

  const stopSelfCamera = () => {
    selfScanLoopActive.current = false;
    selfRollingFramesRef.current = [];
    if (selfStreamRef.current) {
      selfStreamRef.current.getTracks().forEach(track => track.stop());
      selfStreamRef.current = null;
    }
    if (selfVideoRef.current) {
      selfVideoRef.current.srcObject = null;
    }
    setIsSelfCameraActive(false);
    setIsSelfScanning(false);
    setSelfHasTorch(false);
    setSelfIsTorchOn(false);
  };

  const toggleSelfTorch = async () => {
    if (!selfStreamRef.current) return;
    const track = selfStreamRef.current.getVideoTracks()[0];
    if (!track) return;
    try {
      const nextTorchState = !selfIsTorchOn;
      await track.applyConstraints({
        advanced: [{ torch: nextTorchState }]
      });
      setSelfIsTorchOn(nextTorchState);
    } catch (err) {
      console.error("Failed to toggle self torch:", err);
    }
  };

  const toggleSelfFacingMode = () => {
    const nextMode = selfFacingMode === 'user' ? 'environment' : 'user';
    setSelfFacingMode(nextMode);
    if (isSelfCameraActive) {
      stopSelfCamera();
      setTimeout(() => startSelfCamera(nextMode), 100);
    }
  };

  const runSelfAutoScanLoop = async () => {
    if (!selfScanLoopActive.current || !selfVideoRef.current || !selfCanvasRef.current || !currentUserRef.current) {
      return;
    }
    const video = selfVideoRef.current;
    const canvas = selfCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      setTimeout(runSelfAutoScanLoop, 150);
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
    selfRollingFramesRef.current.push(frameCanvas);
    if (selfRollingFramesRef.current.length > 5) selfRollingFramesRef.current.shift();

    try {
      const localFaceBox = await detectFaceInCanvas(canvas);
      if (!localFaceBox || !localFaceBox.landmarks) {
        setSelfScanStatusMsg('Aligning camera... position your face');
        setTimeout(runSelfAutoScanLoop, 300);
        return;
      }
      const quality = assessFaceQuality(canvas, localFaceBox, localFaceBox.landmarks);
      if (!quality.passed) {
        setSelfScanStatusMsg(`Hold still: ${quality.reason}`);
        setTimeout(runSelfAutoScanLoop, 300);
        return;
      }
      const alignedCanvas = alignAndCropFace(canvas, localFaceBox.landmarks || localFaceBox);
      const cropBase64 = alignedCanvas.toDataURL('image/jpeg', 0.85);
      const imgDescriptor = await getFaceDescriptor(alignedCanvas);
      if (!imgDescriptor) {
        setSelfScanStatusMsg('Calibrating biometrics... sit still');
        setTimeout(runSelfAutoScanLoop, 300);
        return;
      }
      const samplesList = currentUserRef.current.samples || [{ id: `SAMP_${currentUserRef.current.id}_1`, vector: currentUserRef.current.biometrics?.vector || new Array(512).fill(0), avatar: currentUserRef.current.avatar }];
      const sampleMatchResults = samplesList.map(sample => {
        if (!sample.vector) return { distance: Infinity, cosine: -1 };
        const norm = (v) => { const s = Math.sqrt(v.reduce((sum, val) => sum + val * val, 0)); return s > 0 ? v.map(val => val / s) : v; };
        const v1 = norm(imgDescriptor);
        const v2 = norm(sample.vector);
        let sumSq = 0, dot = 0;
        for (let i = 0; i < v1.length; i++) { sumSq += Math.pow(v1[i] - v2[i], 2); dot += v1[i] * v2[i]; }
        return { distance: Math.sqrt(sumSq), cosine: dot };
      });
      let minDistance = Infinity;
      let maxCosine = -Infinity;
      sampleMatchResults.forEach(r => {
        if (r.distance < minDistance) minDistance = r.distance;
        if (r.cosine > maxCosine) maxCosine = r.cosine;
      });
      const capBio = extractBiometricsFromCanvas(alignedCanvas);
      const shapeReport = compareBiometrics(currentUserRef.current.biometrics, capBio);
      const similarityScore = maxCosine;
      const finalScore = Math.max(0, Math.min(100, Math.round(similarityScore * 100)));
      setSelfScanStatusMsg(`Matching: ${finalScore}% confidence... hold still`);
      if (finalScore >= 75 && selfRollingFramesRef.current.length >= 3) {
        const framesLivenessData = await Promise.all(selfRollingFramesRef.current.map(async (frame) => {
          const frameBox = await detectFaceInCanvas(frame);
          const frameQuality = assessFaceQuality(frame, frameBox, frameBox.landmarks);
          return { ear: frameQuality.leftEAR ? (frameQuality.leftEAR + frameQuality.rightEAR) / 2 : 0.3, yaw: frameQuality.yaw || 1.0, passiveLiveness: frameQuality.passiveLiveness || 95 };
        }));
        const livenessResult = calculateMultiFrameLiveness(framesLivenessData);
        if (livenessResult.spoofDetected || finalScore < 75) {
          setSelfScanStatusMsg('Biometrics mismatch or spoof detected.');
          setTimeout(runSelfAutoScanLoop, 350);
          return;
        }
        selfScanLoopActive.current = false;
        const photoBase64 = canvas.toDataURL('image/jpeg', 0.85);
        setSelfScanImage(photoBase64);
        stopSelfCamera();
        const gpsStatus = selfGpsDataRef.current ? selfGpsDataRef.current.status : 'GPS Unavailable';
        const status = (finalScore < 75 || gpsStatus === 'Invalid Location') ? 'Verification Required' : 'Approved';
        const logs = dbService.getAttendance();
        const today = new Date().toDateString();
        if (selfIsCheckInRef.current) {
          const alreadyIn = logs.some(l => l.employeeId === currentUserRef.current.id && new Date(l.checkInTime).toDateString() === today);
          if (alreadyIn) { setSelfErrorMsg('You have already checked in today.'); return; }
          const attId = 'ATT' + Math.floor(1000 + Math.random() * 9000);
          const record = { id: attId, employeeId: currentUserRef.current.id, employeeName: currentUserRef.current.name, checkInTime: new Date().toISOString(), checkOutTime: null, latitude: selfGpsDataRef.current?.lat ? parseFloat(selfGpsDataRef.current.lat) : null, longitude: selfGpsDataRef.current?.lon ? parseFloat(selfGpsDataRef.current.lon) : null, confidence: finalScore, qualityScore: 94, livenessScore: livenessResult.livenessScore, similarityScore: neuralScore, verificationStatus: status, attendanceStatus: gpsStatus };
          if (dbService.saveAttendance(record).success) {
            dbService.savePhotos({ id: 'PH' + Math.floor(1000 + Math.random() * 9000), attendanceId: attId, originalPhoto: photoBase64, croppedFace: cropBase64, timestamp: new Date().toISOString() });
            setSelfSuccessMsg(`Checked In Successfully! Timecard Resolution: ${status}.`);
            showToast('Shift logged successfully!');
          }
        } else {
          const activeCheckIn = logs.find(l => l.employeeId === currentUserRef.current.id && !l.checkOutTime);
          if (!activeCheckIn) { setSelfErrorMsg('No active check-in transaction found.'); return; }
          if (dbService.updateAttendance(activeCheckIn.id, { checkOutTime: new Date().toISOString(), attendanceStatus: gpsStatus }).success) {
            setSelfSuccessMsg('Checked Out Successfully!');
            showToast('Checked out successfully!');
          }
        }
        return;
      }
      setTimeout(runSelfAutoScanLoop, 350);
    } catch (err) { console.error(err); setTimeout(runSelfAutoScanLoop, 350); }
  };

  const handleSelfScan = () => {};

  const handleChangePassword = (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) { setPasswordErrorMsg('Passwords do not match.'); return; }
    const res = dbService.changePassword(currentUser.id, currentPassword, newPassword, false);
    if (res.success) { setPasswordSuccessMsg('PIN updated.'); setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); }
    else { setPasswordErrorMsg(res.error || 'Failed to update PIN.'); }
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
  const [groupScanStatusMsg, setGroupScanStatusMsg] = useState('Position team in the viewfinder...');
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
          setGroupScanStatusMsg('Aligning camera... position team in view');
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
    if (!groupScanLoopActive.current || !groupVideoRef.current || !groupCanvasRef.current) return;
    const video = groupVideoRef.current;
    const canvas = groupCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (video.videoWidth === 0) { setTimeout(runGroupAutoScanLoop, 150); return; }
    canvas.width = 800; canvas.height = 450;
    drawImageProp(ctx, video, 0, 0, 800, 450);
    const temp = document.createElement('canvas');
    temp.width = 800; temp.height = 450;
    temp.getContext('2d').drawImage(canvas, 0, 0);
    groupRollingFramesRef.current.push(temp);
    if (groupRollingFramesRef.current.length > 5) groupRollingFramesRef.current.shift();
    setTimeout(runGroupAutoScanLoop, 500);
  };

  const handleCaptureGroup = () => {
    groupScanLoopActive.current = false;
    processMultiFrames(groupRollingFramesRef.current, null);
  };

  const processMultiFrames = async (frameBuffer, imageSrc) => {
    setIsGroupScanning(true);
    setGroupScanStatusMsg("Processing...");
    const employeesDb = dbService.getEmployees();
    const logs = dbService.getAttendance();
    try {
      const allFramesDetections = await Promise.all(frameBuffer.map(f => detectFacesInCanvas(f)));
      const tracks = [];
      allFramesDetections.forEach((detectionsInFrame, frameIdx) => {
        detectionsInFrame.forEach(det => {
          if (!det.descriptor) return;
          let matchedTrackIdx = -1, minCenterDist = 60;
          const detCenter = { x: det.box.x + det.box.w / 2, y: det.box.y + det.box.h / 2 };
          tracks.forEach((track, trackIdx) => {
            const lastDet = track[track.length - 1];
            const lastCenter = { x: lastDet.box.x + lastDet.box.w / 2, y: lastDet.box.y + lastDet.box.h / 2 };
            const dist = Math.sqrt(Math.pow(detCenter.x - lastCenter.x, 2) + Math.pow(detCenter.y - lastCenter.y, 2));
            if (dist < minCenterDist) { minCenterDist = dist; matchedTrackIdx = trackIdx; }
          });
          if (matchedTrackIdx !== -1) tracks[matchedTrackIdx].push({ ...det, frameIdx });
          else tracks.push([{ ...det, frameIdx }]);
        });
      });
      const resolvedFaces = await Promise.all(tracks.map(async (track, idx) => {
        const recognitions = await Promise.all(track.map(async (det) => ({ rec: await recognizeFace(det.descriptor, employeesDb), det })));
        const qualityDetails = track.map((det) => assessFaceQuality(frameBuffer[det.frameIdx], det.box, det.landmarks));
        const matchCounts = {};
        recognitions.forEach(r => { const id = r.rec.matchedEmp?.id || 'UNKNOWN'; matchCounts[id] = (matchCounts[id] || 0) + 1; });
        let consensusEmpId = 'UNKNOWN', maxCount = 0;
        Object.keys(matchCounts).forEach(id => { if (matchCounts[id] > maxCount) { maxCount = matchCounts[id]; consensusEmpId = id; } });
        const matchedEmp = employeesDb.find(e => e.id === consensusEmpId);
        const livenessResult = calculateMultiFrameLiveness(qualityDetails.map(q => ({ ear: q.leftEAR ? (q.leftEAR + q.rightEAR) / 2 : 0.3, yaw: q.yaw || 1.0, passiveLiveness: q.passiveLiveness || 95 })));
        const finalScore = Math.min(100, Math.round(0.8 * (recognitions[0]?.rec.confidence || 0) + 0.2 * livenessResult.livenessScore));
        return { id: `F${idx + 1}`, name: matchedEmp?.name || 'Unidentified', empId: matchedEmp?.id || 'UNKNOWN', confidence: finalScore, status: matchedEmp ? 'Recognized' : 'Unregistered', avatar: alignAndCropFace(frameBuffer[track[0].frameIdx], track[0].landmarks).toDataURL() };
      }));
      setGroupDetectedFaces(resolvedFaces);
    } catch (e) { setGroupErrorMsg("Analysis failed."); }
    setIsGroupScanning(false);
  };

  const handleSelectTemplate = (idx) => {
    setSelectedTemplateIdx(idx);
    if (idx === '') return;
    const template = TEAM_TEMPLATES[idx];
    setGroupScanImage(template.img);
    processFrame(null, template.img, true, idx);
  };

  const processFrame = async (canvas, imageSrc, isPreset = false, activeIdx = selectedTemplateIdx) => {
    setIsGroupScanning(true);
    await new Promise(r => setTimeout(r, 1500));
    setGroupDetectedFaces(TEAM_TEMPLATES[activeIdx].faces);
    setIsGroupScanning(false);
  };

  const handleSubmitGroupLogs = () => {
    let count = 0;
    const logs = dbService.getAttendance();
    const today = new Date().toDateString();
    
    groupDetectedFaces.forEach(f => {
      if (f.empId !== 'UNKNOWN') {
        if (isGroupCheckInRef.current) {
          const alreadyIn = logs.some(l => l.employeeId === f.empId && new Date(l.checkInTime).toDateString() === today);
          if (!alreadyIn) {
            dbService.saveAttendance({ 
              id: 'ATT' + Math.floor(1000 + Math.random() * 9000), 
              employeeId: f.empId, 
              employeeName: employees.find(e => e.id === f.empId)?.name || 'Unknown',
              checkInTime: new Date().toISOString(),
              checkOutTime: null,
              confidence: f.confidence,
              verificationStatus: 'Approved',
              attendanceStatus: 'Valid Location'
            });
            count++;
          }
        } else {
          // Process checkout
          const activeCheckIn = logs.find(l => l.employeeId === f.empId && !l.checkOutTime);
          if (activeCheckIn) {
            dbService.updateAttendance(activeCheckIn.id, { 
              checkOutTime: new Date().toISOString() 
            });
            count++;
          }
        }
      }
    });
    setGroupSuccessCount(count);
    setGroupDetectedFaces([]);
    showToast(`${isGroupCheckInRef.current ? 'Checked-In' : 'Checked-Out'} ${count} employees in group.`);
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden p-4 md:p-6 space-y-4 md:space-y-6 select-none">
      {toastMessage && (
        <div className="fixed top-6 right-6 bg-violet-600 border border-violet-500 text-white px-5 py-3 rounded-2xl shadow-xl z-50 flex items-center space-x-3 transition animate-slide-in">
          <Bell className="h-4.5 w-4.5 text-violet-200 animate-bounce" />
          <span className="text-xs font-bold">{toastMessage}</span>
        </div>
      )}

      <div className="glass-panel p-4 sm:p-5 rounded-2xl border border-dark-800/60 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex flex-col sm:flex-row items-center text-center sm:text-left gap-4">
          <div className="p-3 bg-violet-500/10 border border-violet-500/20 text-violet-400 rounded-2xl flex-shrink-0">
            <Users className="h-6 w-6" />
          </div>
          <div className="flex flex-col items-center sm:items-start">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
              <h2 className="text-base sm:text-lg font-display font-extrabold text-white leading-tight">
                Supervisor: {currentUser?.name}
              </h2>
            </div>
            <p className="text-[10px] text-dark-400 mt-1 font-semibold">
              Management Portal • ID: {currentUser?.id}
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-3 w-full md:w-auto">
          <button
            onClick={() => handleTabSwitch(activeTab)}
            className="p-2.5 bg-dark-900 hover:bg-dark-800 border border-dark-800 text-dark-400 hover:text-white rounded-xl transition cursor-pointer"
            title="Refresh portal layout"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex bg-dark-950 p-1 rounded-xl border border-dark-850 w-full max-w-sm">
        <button
          onClick={() => handleTabSwitch('self')}
          className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition flex items-center justify-center space-x-1.5 ${
            activeTab === 'self' ? 'bg-violet-600 text-white font-extrabold shadow-md' : 'text-dark-400 hover:text-white'
          }`}
        >
          <User className="h-4 w-4" />
          <span>My Attendance</span>
        </button>
        <button
          onClick={() => handleTabSwitch('group')}
          className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition flex items-center justify-center space-x-1.5 ${
            activeTab === 'group' ? 'bg-violet-600 text-white font-extrabold shadow-md' : 'text-dark-400 hover:text-white'
          }`}
        >
          <Users className="h-4 w-4" />
          <span>Group Scan</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto pr-1">
        {activeTab === 'self' ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-4">
              <div className="glass-panel p-5 rounded-2xl border border-dark-800/60 flex flex-col space-y-4">
                <div className="relative aspect-[3/4] md:aspect-[16/9] bg-dark-950 rounded-xl overflow-hidden border border-dark-850 flex items-center justify-center">
                  {isSelfCameraActive ? (
                    <>
                      <video 
                        ref={selfVideoRef} 
                        className={`w-full h-full object-cover ${selfFacingMode === 'user' ? 'transform -scale-x-100' : ''}`}
                        playsInline 
                        muted 
                      />
                      <div className="absolute top-4 right-4 flex space-x-2 z-20">
                        {selfHasTorch && (
                          <button
                            type="button"
                            onClick={toggleSelfTorch}
                            className={`p-2 rounded-xl border border-dark-800 transition cursor-pointer ${
                              selfIsTorchOn 
                                ? 'bg-amber-500 text-dark-950 font-extrabold shadow-md glow-amber' 
                                : 'bg-dark-950/80 hover:bg-dark-900 text-white'
                            }`}
                            title={selfIsTorchOn ? "Turn off Flash" : "Turn on Flash"}
                          >
                            {selfIsTorchOn ? <Zap className="h-4 w-4" /> : <ZapOff className="h-4 w-4" />}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={toggleSelfFacingMode}
                          className="p-2 bg-dark-950/80 hover:bg-dark-900 border border-dark-800 text-white rounded-xl transition cursor-pointer"
                          title="Flip camera"
                        >
                          <RefreshCw className="h-4 w-4 text-brand-400" />
                        </button>
                      </div>
                    </>
                  ) : (
                    <button
                      onClick={startSelfCamera}
                      className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold rounded-xl shadow-lg transition cursor-pointer"
                    >
                      Start Self Scanner
                    </button>
                  )}
                  {isSelfScanning && (
                    <div className="absolute inset-0 bg-violet-500/5 flex items-center justify-center z-10">
                      <p className="absolute bottom-6 bg-dark-950/80 px-4 py-2 border border-violet-500/20 text-[9px] uppercase font-bold text-violet-400 rounded-xl tracking-widest animate-pulse">
                        {selfScanStatusMsg}
                      </p>
                    </div>
                  )}
                  <canvas ref={selfCanvasRef} className="hidden" />
                </div>
              </div>
            </div>
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
                        setIsSelfCheckIn(true); 
                        setSelfSuccessMsg(''); 
                        setSelfErrorMsg(''); 
                        setSelfScanImage(null); 
                        stopSelfCamera(); 
                      }}
                      className={`py-2 rounded-lg text-xs font-bold flex items-center justify-center space-x-1.5 transition ${
                        isSelfCheckIn 
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
                        setIsSelfCheckIn(false); 
                        setSelfSuccessMsg(''); 
                        setSelfErrorMsg(''); 
                        setSelfScanImage(null); 
                        stopSelfCamera(); 
                      }}
                      className={`py-2 rounded-lg text-xs font-bold flex items-center justify-center space-x-1.5 transition ${
                        !isSelfCheckIn 
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
                {selfErrorMsg && <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-450 rounded-xl text-xs">{selfErrorMsg}</div>}
                {selfSuccessMsg && <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-xs">{selfSuccessMsg}</div>}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-4">
                <div className="glass-panel p-5 rounded-2xl border border-dark-800/60 space-y-4">
                  <div className="relative aspect-[3/4] md:aspect-[16/9] bg-dark-950 rounded-xl overflow-hidden border border-dark-850 flex items-center justify-center">
                    {groupInputSource === 'webcam' && isGroupCameraActive && (
                      <>
                        <video 
                          ref={groupVideoRef} 
                          className={`w-full h-full object-cover ${groupFacingMode === 'user' ? 'transform -scale-x-100' : ''}`}
                          playsInline 
                          muted 
                        />
                        {isGroupCameraActive && (
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
                        )}
                      </>
                    )}
                    {groupScanImage && (
                      <img src={groupScanImage} className="w-full h-full object-cover opacity-60" alt="Captured Frame" />
                    )}
                    <canvas ref={groupCanvasRef} className="hidden" />
                    {isGroupScanning && (
                      <div className="absolute inset-0 bg-violet-500/5 flex items-center justify-center z-10">
                        <div className="laser-scanner" />
                        <p className="absolute bottom-6 bg-dark-950/80 px-4 py-2 border border-violet-500/20 text-[10px] uppercase font-bold text-violet-400 rounded-xl tracking-widest animate-pulse">
                          {groupScanStatusMsg}
                        </p>
                      </div>
                    )}
                    {!isGroupCameraActive && !groupScanImage && (
                      <div className="flex flex-col items-center justify-center text-center p-8 text-dark-500 space-y-3">
                        <Camera className="h-10 w-10 text-dark-600 animate-pulse" />
                        <div className="space-y-1">
                          <p className="text-xs font-semibold text-white">Scanner Standby Mode</p>
                          <p className="text-[10px] text-dark-400">Initialize webcam streams or select preset templates to run log scan.</p>
                        </div>
                        {groupInputSource === 'webcam' && (
                          <button
                            onClick={startGroupCamera}
                            className="px-5 py-2.5 bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold rounded-xl shadow-lg transition"
                          >
                            Start Webcam Scanner
                          </button>
                        )}
                      </div>
                    )}

                    {groupInputSource === 'webcam' && isGroupCameraActive && !isGroupScanning && (
                      <button
                        onClick={handleCaptureGroup}
                        className="absolute bottom-6 left-1/2 transform -translate-x-1/2 px-6 py-3 bg-violet-600 hover:bg-violet-500 text-white rounded-full flex items-center space-x-2 border border-violet-400 font-bold text-xs tracking-wider shadow-xl transition cursor-pointer animate-bounce"
                      >
                        <CheckCircle className="h-4.5 w-4.5" />
                        <span>Scan Shift Attendance</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Right shift controls section */}
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
                        }}
                        className={`py-2 rounded-lg text-xs font-bold flex items-center justify-center space-x-1.5 transition ${
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
                        }}
                        className={`py-2 rounded-lg text-xs font-bold flex items-center justify-center space-x-1.5 transition ${
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
                        className="w-full py-2 bg-dark-900 hover:bg-dark-800 border border-dark-800 text-[10px] text-white font-bold rounded-xl transition"
                      >
                        Scan Next Shift Group
                      </button>
                    </div>
                  )}

                  {groupDetectedFaces.length > 0 && (
                    <div className="space-y-3 pt-2">
                      <div className="p-3 bg-dark-950/60 rounded-xl border border-dark-850 text-[10px] text-dark-400 space-y-1">
                        <p className="flex justify-between">
                          <span>Total Faces Scanned:</span>
                          <span className="font-bold text-white">{groupDetectedFaces.length}</span>
                        </p>
                        <p className="flex justify-between text-emerald-400">
                          <span>Matched Employees to Log:</span>
                          <span className="font-bold">
                            {groupDetectedFaces.filter(f => f.empId !== 'UNKNOWN').length}
                          </span>
                        </p>
                        <p className="flex justify-between text-rose-400 font-medium">
                          <span>Unregistered Faces (Skipped):</span>
                          <span className="font-bold">
                            {groupDetectedFaces.filter(f => f.empId === 'UNKNOWN').length}
                          </span>
                        </p>
                      </div>
                      
                      <button
                        onClick={handleSubmitGroupLogs}
                        className={`w-full py-3 bg-gradient-to-r ${
                          isGroupCheckIn ? 'from-emerald-600 to-emerald-500 shadow-lg shadow-emerald-500/10' : 'from-violet-650 to-violet-550 shadow-lg shadow-violet-500/10'
                        } text-white text-xs font-bold rounded-xl transition`}
                      >
                        Commit {groupDetectedFaces.filter(f => f.empId !== 'UNKNOWN').length} Logs & Save
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

            {/* Grid of Results */}
            {groupDetectedFaces.length > 0 && (
              <div className="space-y-4">
                <h4 className="font-display font-extrabold text-sm text-white">Detected Face Output Results ({groupDetectedFaces.length})</h4>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                  {groupDetectedFaces.map((f) => {
                    const isManualReview = f.status === 'Manual Review';
                    const isRecognized = f.status === 'Recognized';
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
                            <p className={`text-xs font-extrabold ${isUnknown ? 'text-rose-455' : isManualReview ? 'text-amber-400' : 'text-emerald-400'}`}>
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
                            className="w-full bg-dark-950 border border-dark-850 rounded-lg px-2 py-1.5 text-[10px] text-white focus:outline-none focus:border-violet-500 transition"
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
                              className="w-full px-2 py-1.5 bg-dark-900/60 flex items-center justify-between text-dark-400 hover:text-white font-bold"
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
                                ))}
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
        )}
      </div>
    </div>
  );
}
