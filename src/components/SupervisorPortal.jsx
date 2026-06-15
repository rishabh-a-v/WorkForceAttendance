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
  RefreshCw,
  Zap,
  ZapOff,
  LogOut,
  Search,
  CheckCircle2,
  AlertCircle,
  ArrowLeft
} from 'lucide-react';
import { dbService, compressImageBase64 } from '../db/dbService';
import { 
  recognizeFace, 
  detectFacesInCanvas,
  loadFaceApiModels,
  getNormalFrontCameraDeviceId,
  cropFaceFromCanvas
} from '../utils/faceEngine';

const generateRandomId = (prefix) => {
  return prefix + Math.floor(100000 + Math.random() * 900000);
};

const getTimestamp = () => Date.now();

export default function SupervisorPortal({ currentUser, onLogout }) {
  const [employees, setEmployees] = useState(() => dbService.getEmployees());
  const [currentView, setCurrentView] = useState('dashboard'); // 'dashboard' | 'job_start' | 'job_end'

  // GPS Geolocation States
  const [gpsData, setGpsData] = useState(null);
  const [gpsLoading, setGpsLoading] = useState(false);

  // Job Start Fields
  const [siteName, setSiteName] = useState('');
  const [jobNumber, setJobNumber] = useState('');
  const [jobStarted, setJobStarted] = useState(false);
  const [startTime, setStartTime] = useState('');
  const [entryDate, setEntryDate] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Group Camera States
  const [isGroupCameraActive, setIsGroupCameraActive] = useState(false);
  const [groupScanImage, setGroupScanImage] = useState(null);
  const [groupFacingMode, setGroupFacingMode] = useState('environment');
  const [groupErrorMsg, setGroupErrorMsg] = useState('');
  const [groupDetectedFaces, setGroupDetectedFaces] = useState([]);
  const [groupSuccessMsg, setGroupSuccessMsg] = useState('');
  const [isGroupScanning, setIsGroupScanning] = useState(false);
  const [groupScanStatusMsg, setGroupScanStatusMsg] = useState('');
  const [groupHasTorch, setGroupHasTorch] = useState(false);
  const [groupIsTorchOn, setGroupIsTorchOn] = useState(false);

  const groupStreamRef = useRef(null);
  const groupVideoRef = useRef(null);
  const groupCanvasRef = useRef(null);

  // Modals for Unknown Face Handling
  const [activeFaceCardId, setActiveFaceCardId] = useState(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [newEmpName, setNewEmpName] = useState('');
  const [newEmpMobile, setNewEmpMobile] = useState('');
  const [registerError, setRegisterError] = useState('');

  // Job End States
  const [searchJobNumber, setSearchJobNumber] = useState('');
  const [activeSessionRecords, setActiveSessionRecords] = useState([]);
  const [searchAttempted, setSearchAttempted] = useState(false);
  const [jobEndSessionActive, setJobEndSessionActive] = useState(false);

  // Geolocation trigger
  const fetchLocation = () => {
    setGpsLoading(true);
    setGpsData(null);

    const fetchIpLocationFallback = (originalError) => {
      console.warn('IP Geolocation fallback:', originalError);
      fetch('https://freeipapi.com/api/json')
        .then(res => res.json())
        .then(data => {
          if (data.latitude !== undefined && data.longitude !== undefined) {
            setGpsData({
              lat: parseFloat(data.latitude).toFixed(6),
              lon: parseFloat(data.longitude).toFixed(6),
              status: 'GPS Captured (IP Fallback)'
            });
          } else {
            throw new Error('Invalid coordinates format');
          }
          setGpsLoading(false);
        })
        .catch(err => {
          console.warn('IP API fallback failed, trying ipinfo...', err);
          fetch('https://ipinfo.io/json')
            .then(res => res.json())
            .then(data => {
              if (data.loc) {
                const [lat, lon] = data.loc.split(',');
                setGpsData({
                  lat: parseFloat(lat).toFixed(6),
                  lon: parseFloat(lon).toFixed(6),
                  status: 'GPS Captured (IP Fallback)'
                });
              } else {
                setGpsData({ lat: null, lon: null, status: 'GPS Permission Denied' });
              }
              setGpsLoading(false);
            })
            .catch(() => {
              setGpsData({ lat: null, lon: null, status: 'GPS Error / Unavailable' });
              setGpsLoading(false);
            });
        });
    };

    if (!navigator.geolocation) {
      fetchIpLocationFallback('Geolocation API not supported');
      return;
    }

    try {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setGpsData({
            lat: position.coords.latitude.toFixed(6),
            lon: position.coords.longitude.toFixed(6),
            status: 'GPS Captured'
          });
          setGpsLoading(false);
        },
        (error) => {
          fetchIpLocationFallback(error.message);
        },
        { enableHighAccuracy: true, timeout: 6000 }
      );
    } catch (e) {
      console.warn("Synchronous Geolocation call failed, falling back to IP:", e);
      fetchIpLocationFallback(e.message || 'Insecure context or location exception');
    }
  };

  const stopGroupCamera = () => {
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

  // Sync DB locally on interval
  useEffect(() => {
    loadFaceApiModels().catch(err => console.error('Failed to pre-load face models:', err));
    setTimeout(() => {
      fetchLocation();
    }, 0);
    
    const syncData = async () => {
      await dbService.syncFromServer();
      setEmployees(dbService.getEmployees());
    };
    syncData();
    const interval = setInterval(syncData, 5000);
    return () => {
      clearInterval(interval);
      stopGroupCamera();
    };
  }, []);

  // Camera Handlers
  const startGroupCamera = async (facing = groupFacingMode) => {
    try {
      setGroupErrorMsg('');
      setGroupScanImage(null);
      setGroupDetectedFaces([]);
      setGroupSuccessMsg('');
      setIsGroupCameraActive(true);
      setIsGroupScanning(false);

      const constraints = {
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      };

      if (facing === 'user') {
        const devId = await getNormalFrontCameraDeviceId();
        if (devId) {
          constraints.video.deviceId = { exact: devId };
        } else {
          constraints.video.facingMode = 'user';
        }
      } else {
        constraints.video.facingMode = facing;
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      groupStreamRef.current = stream;

      const track = stream.getVideoTracks()[0];
      let supportsTorch = false;
      if (track && facing === 'environment') {
        try {
          const caps = track.getCapabilities ? track.getCapabilities() : {};
          supportsTorch = !!caps.torch;
        } catch (e) {
          console.warn("Torch check failed:", e);
        }
      }
      setGroupHasTorch(supportsTorch);
      setGroupIsTorchOn(false);

      if (groupVideoRef.current) {
        groupVideoRef.current.srcObject = stream;
        groupVideoRef.current.play();
      }
    } catch (err) {
      console.error(err);
      setGroupErrorMsg('Webcam is unavailable. Please check permissions or upload an image instead.');
      setIsGroupCameraActive(false);
    }
  };

  const toggleGroupTorch = async () => {
    if (!groupStreamRef.current) return;
    const track = groupStreamRef.current.getVideoTracks()[0];
    if (!track) return;
    try {
      const nextTorch = !groupIsTorchOn;
      await track.applyConstraints({
        advanced: [{ torch: nextTorch }]
      });
      setGroupIsTorchOn(nextTorch);
    } catch (e) {
      console.warn("Could not toggle torch:", e);
    }
  };

  const switchGroupCamera = () => {
    const nextMode = groupFacingMode === 'environment' ? 'user' : 'environment';
    setGroupFacingMode(nextMode);
    if (isGroupCameraActive) {
      stopGroupCamera();
      startGroupCamera(nextMode);
    }
  };

  const captureGroupPhoto = () => {
    if (!groupVideoRef.current || !groupCanvasRef.current) return;
    const video = groupVideoRef.current;
    const canvas = groupCanvasRef.current;
    const ctx = canvas.getContext('2d');

    const videoW = video.videoWidth || 640;
    const videoH = video.videoHeight || 480;
    canvas.width = videoW;
    canvas.height = videoH;

    // Draw frame
    ctx.save();
    ctx.drawImage(video, 0, 0, videoW, videoH);
    ctx.restore();

    const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
    setGroupScanImage(dataUrl);
    stopGroupCamera();
    processGroupPhoto(canvas);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);

      const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
      setGroupScanImage(dataUrl);
      processGroupPhoto(canvas);
    };
    img.src = URL.createObjectURL(file);
  };

  const processGroupPhoto = async (canvas) => {
    setIsGroupScanning(true);
    setGroupScanStatusMsg('Detecting all visible faces...');
    setGroupErrorMsg('');

    try {
      await loadFaceApiModels();
      const detections = await detectFacesInCanvas(canvas);

      if (!detections || detections.length === 0 || detections[0].descriptor === null) {
        setGroupDetectedFaces([]);
        setGroupErrorMsg('No faces detected in the image. Please retake the photo or upload a clearer group image.');
        setIsGroupScanning(false);
        return;
      }

      setGroupScanStatusMsg(`Matching ${detections.length} faces against employee database...`);
      const employeesDb = dbService.getEmployees();
      const searchDb = currentView === 'job_end'
        ? employeesDb.filter(emp => activeSessionRecords.some(r => r.employeeName === emp.name || r.employeePhone === emp.mobile))
        : employeesDb;

      const faceCards = await Promise.all(detections.map(async (det, idx) => {
        const matchResult = await recognizeFace(det.descriptor, searchDb);
        const matchedEmp = matchResult.matchedEmp;
        const confidenceScore = matchedEmp ? Math.round(matchResult.confidence * 100) : 0;
        
        let status = 'Unknown Employee';
        if (matchedEmp && confidenceScore >= 75) {
          status = 'Recognized';
        }

        const faceCropBase64 = cropFaceFromCanvas(canvas, det.box);

        return {
          id: `face_${idx + 1}_${getTimestamp()}`,
          box: det.box,
          descriptor: det.descriptor,
          avatar: faceCropBase64,
          matchedEmp: status === 'Recognized' ? matchedEmp : null,
          confidence: confidenceScore,
          status,
          approved: false // Attendance should NOT be automatically marked
        };
      }));

      setGroupDetectedFaces(faceCards);
      setIsGroupScanning(false);
    } catch (err) {
      console.error(err);
      setGroupErrorMsg('Facial recognition processing failed. Please try again.');
      setIsGroupScanning(false);
    }
  };

  // Card Approval Handlers
  const handleApproveFace = (faceId) => {
    setGroupDetectedFaces(prev => prev.map(f => f.id === faceId ? { ...f, approved: true } : f));
  };

  const handleRejectFace = (faceId) => {
    setGroupDetectedFaces(prev => prev.map(f => f.id === faceId ? { ...f, approved: false } : f));
  };

  const handleApproveAll = () => {
    setGroupDetectedFaces(prev => prev.map(f => ({ ...f, approved: true })));
  };

  const handleRejectAll = () => {
    setGroupDetectedFaces(prev => prev.map(f => ({ ...f, approved: false })));
  };

  // Inline Handlers for Unknown Face
  const openAssignModal = (faceId) => {
    setActiveFaceCardId(faceId);
    setShowAssignModal(true);
  };

  const openRegisterModal = (faceId) => {
    setActiveFaceCardId(faceId);
    setNewEmpName('');
    setNewEmpMobile('');
    setRegisterError('');
    setShowRegisterModal(true);
  };

  const handleAssignConfirm = (employee) => {
    setGroupDetectedFaces(prev => prev.map(f => {
      if (f.id === activeFaceCardId) {
        return {
          ...f,
          matchedEmp: employee,
          status: 'Recognized',
          confidence: 100,
          approved: true // Automatically approve on assign
        };
      }
      return f;
    }));
    setShowAssignModal(false);
  };

  const handleRegisterConfirm = async (e) => {
    e.preventDefault();
    setRegisterError('');

    if (!newEmpName.trim() || !newEmpMobile.trim()) {
      setRegisterError('All fields are required.');
      return;
    }

    const currentFace = groupDetectedFaces.find(f => f.id === activeFaceCardId);
    if (!currentFace) return;

    setIsGroupScanning(true);
    setGroupScanStatusMsg('Registering new employee in database...');

    try {
      // 1. Upload profile image to Drive
      const uploadRes = await dbService.uploadPhoto(currentFace.avatar, `emp_profile_${newEmpName.replace(/\s+/g, '_')}_${getTimestamp()}.jpg`);
      const profileUrl = uploadRes?.url || currentFace.avatar;

      // 2. Save employee profile
      const newEmployee = {
        id: generateRandomId('EMP'),
        name: newEmpName.trim(),
        mobile: newEmpMobile.trim(),
        avatar: profileUrl,
        biometrics: { vector: Array.from(currentFace.descriptor) },
        registeredAt: new Date().toISOString()
      };

      const saveRes = await dbService.saveEmployee(newEmployee);
      if (!saveRes.success) {
        setRegisterError(saveRes.error || 'Registration failed.');
        setIsGroupScanning(false);
        return;
      }

      // Update state employees list
      setEmployees(dbService.getEmployees());

      // Assign to the card
      setGroupDetectedFaces(prev => prev.map(f => {
        if (f.id === activeFaceCardId) {
          return {
            ...f,
            matchedEmp: newEmployee,
            status: 'Recognized',
            confidence: 100,
            approved: true
          };
        }
        return f;
      }));

      dbService.logAction(
        'Inline Employee Registration',
        currentUser.name,
        null,
        JSON.stringify(newEmployee),
        `Registered and biometric-trained employee ${newEmployee.name} during group start session.`
      );

      setShowRegisterModal(false);
    } catch (err) {
      console.error(err);
      setRegisterError('Failed to register employee.');
    } finally {
      setIsGroupScanning(false);
    }
  };

  // Submit Job Start Attendance
  const handleJobStartSubmit = async () => {
    const approvedFaces = groupDetectedFaces.filter(f => f.approved && f.matchedEmp);
    if (approvedFaces.length === 0) {
      alert('You must approve at least one recognized employee to submit attendance.');
      return;
    }

    setIsSubmitting(true);
    setGroupScanStatusMsg('Uploading scan images and saving records...');

    try {
      // 1. Compress and upload original group photo once
      const compressedGroupPhoto = await compressImageBase64(groupScanImage, 60000);
      const uploadGroupRes = await dbService.uploadPhoto(compressedGroupPhoto, `group_start_${jobNumber}_${getTimestamp()}.jpg`);
      const groupPhotoUrl = uploadGroupRes?.url || '';

      const attendanceDb = dbService.getAttendance();

      // 2. Save attendance entry for each approved face
      let successCount = 0;
      for (const face of approvedFaces) {
        // Prevent duplicate attendance for the same employee in the same job session
        const isDuplicate = attendanceDb.some(a => 
          a.employeeName === face.matchedEmp.name && 
          a.jobNumber === jobNumber && 
          !a.endTime
        );
        if (isDuplicate) {
          continue; // Skip duplicates silently
        }

        // Upload face crop
        const uploadCropRes = await dbService.uploadPhoto(face.avatar, `crop_face_${face.matchedEmp.id}_${getTimestamp()}.jpg`);
        const faceCropUrl = uploadCropRes?.url || '';

        const record = {
          id: generateRandomId('ATT'),
          entryDate: entryDate,
          supervisorName: currentUser.name,
          supervisorPhone: currentUser.phone,
          branch: currentUser.branch,
          siteName: siteName.trim(),
          jobNumber: jobNumber.trim() || 'N/A',
          employeeName: face.matchedEmp.name,
          employeePhone: face.matchedEmp.mobile,
          startTime: startTime,
          endTime: null,
          startLatitude: gpsData?.lat ? parseFloat(gpsData.lat) : null,
          startLongitude: gpsData?.lon ? parseFloat(gpsData.lon) : null,
          endLatitude: null,
          endLongitude: null,
          groupPhotoUrl: groupPhotoUrl,
          faceImageUrl: faceCropUrl,
          confidence: parseFloat((face.confidence / 100).toFixed(2)),
          approved: true,
          attendanceStatus: 'Present'
        };

        const res = dbService.saveAttendance(record);
        if (res.success) {
          successCount++;
        }
      }

      dbService.logAction(
        'Group Photo Attendance Processing',
        currentUser.name,
        null,
        JSON.stringify({ siteName, jobNumber, approvedCount: approvedFaces.length, successCount }),
        `Approved ${successCount} attendance marks under Job ${jobNumber || 'N/A'}.`
      );

      setGroupSuccessMsg(`Successfully marked attendance for ${successCount} employees!`);
      setTimeout(() => {
        resetJobStartForm();
        setCurrentView('dashboard');
      }, 2000);
    } catch (err) {
      console.error(err);
      setGroupErrorMsg('Failed to save attendance records. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetJobStartForm = () => {
    setSiteName('');
    setJobNumber('');
    setJobStarted(false);
    setStartTime('');
    setEntryDate('');
    setGroupScanImage(null);
    setGroupDetectedFaces([]);
    setGroupSuccessMsg('');
    setGroupErrorMsg('');
  };

  // Job End Attendance Handlers
  const handleJobSearch = () => {
    setSearchAttempted(true);
    if (!searchJobNumber.trim()) return;

    const allAttendance = dbService.getAttendance();
    const activeSession = allAttendance.filter(a => 
      a.jobNumber === searchJobNumber.trim() && 
      !a.endTime
    );
    if (activeSession.length > 0) {
      setSiteName(activeSession[0].siteName);
      setJobNumber(activeSession[0].jobNumber);
      setActiveSessionRecords(activeSession);
      setJobEndSessionActive(true);
      startGroupCamera('environment');
    } else {
      setActiveSessionRecords([]);
    }
  };

  const handleJobEndSubmit = async () => {
    const approvedCheckoutFaces = groupDetectedFaces.filter(f => f.approved && f.matchedEmp);
    if (approvedCheckoutFaces.length === 0) {
      alert('You must approve at least one matched employee for checkout.');
      return;
    }

    setIsSubmitting(true);
    setGroupScanStatusMsg('Saving checkout records and updating databases...');

    try {
      const endTimestamp = new Date().toISOString();
      const endLat = gpsData?.lat ? parseFloat(gpsData.lat) : null;
      const endLon = gpsData?.lon ? parseFloat(gpsData.lon) : null;

      let successCount = 0;
      for (const face of approvedCheckoutFaces) {
        const activeRecord = activeSessionRecords.find(r => 
          r.employeeName === face.matchedEmp.name || 
          r.employeePhone === face.matchedEmp.mobile
        );
        if (activeRecord) {
          const updateRes = dbService.updateAttendance(activeRecord.id, {
            endTime: endTimestamp,
            endLatitude: endLat,
            endLongitude: endLon,
            attendanceStatus: 'Completed'
          });
          if (updateRes.success) {
            successCount++;
          }
        }
      }

      dbService.logAction(
        'Job Session Checkouts',
        currentUser.name,
        null,
        JSON.stringify({ jobNumber, siteName, checkedOutCount: successCount }),
        `Checked out ${successCount} employees under Job ${jobNumber || 'N/A'}.`
      );

      setGroupSuccessMsg(`Successfully checked out ${successCount} employees!`);
      setTimeout(() => {
        resetJobEndForm();
        setCurrentView('dashboard');
      }, 2000);
    } catch (err) {
      console.error(err);
      setGroupErrorMsg('Failed to end attendance session. Please check your connection.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetJobEndForm = () => {
    stopGroupCamera();
    setSearchJobNumber('');
    setJobNumber('');
    setSiteName('');
    setActiveSessionRecords([]);
    setSearchAttempted(false);
    setJobEndSessionActive(false);
    setGroupScanImage(null);
    setGroupDetectedFaces([]);
    setGroupSuccessMsg('');
    setGroupErrorMsg('');
  };

  const getActiveJobs = () => {
    const allAttendance = dbService.getAttendance();
    const supervisorOpenRecords = allAttendance.filter(a => 
      a.supervisorName === currentUser.name && !a.endTime
    );
    
    // Group by jobNumber
    const jobsMap = {};
    supervisorOpenRecords.forEach(rec => {
      const jobNum = rec.jobNumber || 'N/A';
      if (!jobsMap[jobNum]) {
        jobsMap[jobNum] = {
          jobNumber: jobNum,
          siteName: rec.siteName || 'N/A',
          employeeCount: 0,
          startTime: rec.startTime,
          entryDate: rec.entryDate,
          records: []
        };
      }
      jobsMap[jobNum].employeeCount += 1;
      jobsMap[jobNum].records.push(rec);
    });
    
    return Object.values(jobsMap);
  };

  /* eslint-disable react-hooks/refs */
  const renderBiometricCapture = () => {
    return (
      <div className="space-y-6">
        {/* Info panel */}
        <div className={`p-4 border rounded-2xl flex items-start space-x-3 ${
          currentView === 'job_end' 
            ? 'bg-rose-500/8 border-rose-500/20' 
            : 'bg-emerald-500/8 border-emerald-500/20'
        }`}>
          <CheckCircle2 className={`h-5 w-5 flex-shrink-0 mt-0.5 ${currentView === 'job_end' ? 'text-rose-400' : 'text-emerald-400'}`} />
          <div className="text-xs leading-relaxed">
            <span className="font-bold text-white block">
              {currentView === 'job_end' ? 'Job End Verification' : 'Job Start Verification'}
            </span>
            <span className="text-dark-350 block mt-0.5">Site: {siteName} | Job: {jobNumber || 'N/A'}</span>
            {currentView === 'job_end' ? (
              <span className="text-dark-350 block mt-0.5 font-mono">Active Checked In: {activeSessionRecords.length} employees</span>
            ) : (
              <span className="text-dark-350 block mt-0.5 font-mono">Start Time: {startTime}</span>
            )}
          </div>
        </div>

        {/* Media Capture Interface */}
        {!groupScanImage && (
          <div className="glass-panel rounded-3xl border border-dark-800/80 p-5 space-y-4 shadow-xl flex flex-col items-center">
            <h3 className="text-xs font-bold text-dark-400 uppercase tracking-widest mb-1">Webcam Capture</h3>
            
            {isGroupCameraActive ? (
              <div className="w-full max-w-lg aspect-video bg-black rounded-2xl overflow-hidden border border-dark-800 relative shadow-inner">
                <video
                  ref={groupVideoRef}
                  className="w-full h-full object-cover transform scale-x-[-1]"
                  playsInline
                  muted
                />
                
                {/* Action control badges */}
                <div className="absolute top-3 right-3 flex items-center space-x-2">
                  {groupHasTorch && (
                    <button
                      onClick={toggleGroupTorch}
                      className={`p-2 rounded-xl transition ${groupIsTorchOn ? 'bg-amber-400 text-black' : 'bg-dark-900/80 text-white hover:bg-dark-850'}`}
                      title="Toggle Flashlight"
                    >
                      {groupIsTorchOn ? <ZapOff className="h-4 w-4" /> : <Zap className="h-4 w-4" />}
                    </button>
                  )}
                  <button
                    onClick={switchGroupCamera}
                    className="p-2 rounded-xl bg-dark-900/80 text-white hover:bg-dark-850 transition"
                    title="Switch Camera"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="w-full max-w-lg aspect-video bg-dark-950 rounded-2xl flex flex-col items-center justify-center border border-dashed border-dark-800 text-dark-500">
                <Video className="h-12 w-12 text-dark-600 mb-2" />
                <span className="text-xs italic">Webcam stream inactive</span>
              </div>
            )}

            {/* Buttons */}
            <div className="w-full max-w-md flex flex-col sm:flex-row gap-3 pt-2">
              {isGroupCameraActive ? (
                <button
                  onClick={captureGroupPhoto}
                  className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-lg flex items-center justify-center space-x-2 transition cursor-pointer"
                >
                  <Camera className="h-4 w-4" />
                  <span>Capture Group Photo</span>
                </button>
              ) : (
                <button
                  onClick={() => startGroupCamera(groupFacingMode)}
                  className="flex-1 py-3 bg-dark-900 hover:bg-dark-850 border border-dark-800 text-white font-bold text-xs rounded-xl flex items-center justify-center space-x-2 transition cursor-pointer"
                >
                  <Video className="h-4 w-4 text-emerald-400" />
                  <span>Activate Camera Stream</span>
                </button>
              )}

              {/* Fallback image upload */}
              <div className="flex-1 relative">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <button className="w-full py-3 bg-dark-900 hover:bg-dark-850 border border-dark-800 text-dark-300 hover:text-white font-bold text-xs rounded-xl flex items-center justify-center space-x-2 transition pointer-events-none">
                  <Camera className="h-4 w-4 text-violet-400" />
                  <span>Upload Image File</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Scanning status loading feedback */}
        {isGroupScanning && (
          <div className="p-8 text-center glass-panel rounded-3xl border border-dark-800 shadow-xl space-y-4 animate-pulse">
            <RefreshCw className="h-8 w-8 text-violet-500 animate-spin mx-auto" />
            <div className="space-y-1.5">
              <span className="font-bold text-xs text-white block">Analyzing Group Photo</span>
              <span className="text-[10px] text-dark-450 block">{groupScanStatusMsg}</span>
            </div>
          </div>
        )}

        {/* Success Alert */}
        {groupSuccessMsg && (
          <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-emerald-400 text-xs flex items-start space-x-2.5 leading-relaxed">
            <CheckCircle2 className="h-5 w-5 flex-shrink-0 mt-0.5 text-emerald-400" />
            <div className="flex-1">
              <span className="font-bold text-emerald-300 block">Success</span>
              <span className="block mt-0.5">{groupSuccessMsg}</span>
            </div>
          </div>
        )}

        {/* Error Alert */}
        {groupErrorMsg && (
          <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-400 text-xs flex items-start space-x-2.5 leading-relaxed">
            <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5 text-rose-500" />
            <div className="flex-1">
              <span className="font-bold text-rose-300 block">Processing Issue</span>
              <span className="block mt-0.5">{groupErrorMsg}</span>
              <button
                onClick={() => {
                  setGroupErrorMsg('');
                  setGroupScanImage(null);
                  startGroupCamera(groupFacingMode);
                }}
                className="text-[10px] text-rose-300 hover:underline mt-2 font-bold block cursor-pointer"
              >
                Try capturing or uploading again
              </button>
            </div>
          </div>
        )}

        {/* Captured Photo Frame & Card Match Feed */}
        {groupScanImage && !isGroupScanning && !groupErrorMsg && (
          <div className="space-y-6">
            {/* Image Preview */}
            <div className="glass-panel rounded-3xl border border-dark-800/80 p-4 shadow-xl flex flex-col items-center">
              <img
                src={groupScanImage}
                alt="Captured Group Scan"
                className="w-full max-w-lg rounded-2xl border border-dark-850 object-contain max-h-72 shadow-md"
              />
              <button
                onClick={() => {
                  setGroupScanImage(null);
                  setGroupDetectedFaces([]);
                  startGroupCamera(groupFacingMode);
                }}
                className="text-[10px] text-dark-500 hover:text-white transition mt-3 font-semibold flex items-center space-x-1 cursor-pointer"
              >
                <RefreshCw className="h-3 w-3" />
                <span>Retake Group Photo</span>
              </button>
            </div>

            {/* Face List Header Controls */}
            {groupDetectedFaces.length > 0 && (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-dark-900/50 p-4 border border-dark-850 rounded-2xl">
                  <div>
                    <h2 className="text-sm font-black text-white">Detected Faces ({groupDetectedFaces.length})</h2>
                    <p className="text-[10px] text-dark-400">Review and approve attendance marks manually</p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={handleApproveAll}
                      className="px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-[10px] font-bold rounded-lg border border-emerald-500/20 transition cursor-pointer"
                    >
                      Approve All
                    </button>
                    <button
                      onClick={handleRejectAll}
                      className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-[10px] font-bold rounded-lg border border-rose-500/20 transition cursor-pointer"
                    >
                      Reject All
                    </button>
                  </div>
                </div>

                {/* Card Feed Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {groupDetectedFaces.map(face => (
                    <div 
                      key={face.id}
                      className={`glass-panel rounded-2xl border p-4 flex items-start space-x-4 shadow-md transition ${face.approved ? 'border-emerald-500/50 bg-emerald-500/4' : 'border-dark-800'}`}
                    >
                      {/* Face Crop Thumbnail */}
                      <img
                        src={face.avatar}
                        alt="Face crop"
                        className="h-16 w-16 rounded-xl border border-dark-800 bg-dark-950 object-cover flex-shrink-0"
                      />
                      
                      {/* Metadata Details */}
                      <div className="flex-1 min-w-0 space-y-1.5 text-left">
                        {face.matchedEmp ? (
                          <>
                            <div className="truncate font-bold text-xs text-white">{face.matchedEmp.name}</div>
                            <div className="truncate text-[10px] text-dark-450 font-medium">Mob: {face.matchedEmp.mobile}</div>
                            <div className="flex items-center space-x-2">
                              <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[9px] font-bold">Recognized</span>
                              <span className="text-[9px] text-dark-500 font-mono">Conf: {face.confidence}%</span>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="font-bold text-xs text-amber-400">Unknown Employee</div>
                            <div className="flex items-center space-x-2 mt-1">
                              <span className="px-2 py-0.5 rounded bg-dark-800 text-dark-400 text-[9px] font-bold">
                                {face.status === 'Not Checked In' ? 'Not Checked In' : 'Unrecognized'}
                              </span>
                            </div>
                          </>
                        )}

                        {/* Interactive controls */}
                        <div className="pt-2 flex flex-wrap gap-2">
                          {face.matchedEmp ? (
                            <>
                              {face.approved ? (
                                <button
                                  onClick={() => handleRejectFace(face.id)}
                                  className="px-2.5 py-1 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 text-[10px] font-bold rounded-lg transition flex items-center space-x-1 cursor-pointer"
                                >
                                  <XCircle className="h-3 w-3" />
                                  <span>Reject</span>
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleApproveFace(face.id)}
                                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold rounded-lg transition flex items-center space-x-1 cursor-pointer"
                                >
                                  <Check className="h-3 w-3" />
                                  <span>Approve</span>
                                </button>
                              )}
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => openAssignModal(face.id)}
                                className="px-2 py-1 bg-dark-900 hover:bg-dark-850 border border-dark-800 text-violet-400 text-[9px] font-bold rounded-lg transition cursor-pointer"
                              >
                                Assign Existing
                              </button>
                              {currentView !== 'job_end' && (
                                <button
                                  onClick={() => openRegisterModal(face.id)}
                                  className="px-2 py-1 bg-violet-600/10 hover:bg-violet-600/20 border border-violet-500/20 text-violet-300 text-[9px] font-bold rounded-lg transition cursor-pointer"
                                >
                                  Register New
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Save session trigger */}
                <button
                  onClick={currentView === 'job_end' ? handleJobEndSubmit : handleJobStartSubmit}
                  disabled={isSubmitting || groupDetectedFaces.filter(f => f.approved).length === 0}
                  className={`w-full py-4 bg-gradient-to-r text-white font-extrabold text-sm rounded-2xl shadow-lg flex items-center justify-center space-x-2 transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${
                    currentView === 'job_end' 
                      ? 'from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500' 
                      : 'from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500'
                  }`}
                >
                  {isSubmitting ? (
                    <RefreshCw className="h-5 w-5 animate-spin" />
                  ) : (
                    <span>
                      {currentView === 'job_end' 
                        ? `End Attendance & Check Out (${groupDetectedFaces.filter(f => f.approved).length} Employees)`
                        : `Save Attendance & Start Job (${groupDetectedFaces.filter(f => f.approved).length} Employees)`
                      }
                    </span>
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };
  /* eslint-enable react-hooks/refs */

  return (
    <div className="flex-1 flex flex-col overflow-y-auto px-4 py-6 md:p-8 select-none relative" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>
      
      {/* ─── SCREEN 2: ATTENDANCE DASHBOARD ─── */}
      {currentView === 'dashboard' && (
        <div className="max-w-xl mx-auto w-full space-y-8 py-8 animate-in fade-in duration-200">
          {/* Supervisor Card Header */}
          <div className="glass-panel rounded-3xl border border-dark-800/80 p-6 flex flex-col items-center text-center space-y-4 shadow-xl">
            <div className="p-3 bg-violet-500/10 border border-violet-500/20 rounded-2xl text-violet-400">
              <Users className="h-10 w-10" />
            </div>
            <div>
              <h2 className="text-xs font-bold text-violet-400 uppercase tracking-widest">Active Session</h2>
              <h1 className="text-2xl font-black text-white tracking-tight mt-1">Welcome, {currentUser.name}</h1>
              <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 mt-3 text-xs text-dark-450 font-medium">
                <span className="flex items-center space-x-1">
                  <MapPin className="h-3.5 w-3.5 text-dark-500" />
                  <span>Branch: {currentUser.branch}</span>
                </span>
                <span className="flex items-center space-x-1">
                  <Clock className="h-3.5 w-3.5 text-dark-500" />
                  <span>Mob: {currentUser.phone}</span>
                </span>
              </div>
            </div>
          </div>

          {/* Action Menu */}
          <div className="space-y-4">
            <button
              onClick={() => {
                fetchLocation();
                setCurrentView('job_start');
              }}
              className="w-full py-5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-sm rounded-2xl shadow-lg flex items-center justify-center space-x-3 transition active:scale-[0.98] cursor-pointer"
            >
              <UserCheck className="h-5 w-5" />
              <span>Job Start Attendance</span>
            </button>

            <button
              onClick={() => {
                fetchLocation();
                setCurrentView('job_end');
              }}
              className="w-full py-5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-extrabold text-sm rounded-2xl shadow-lg flex items-center justify-center space-x-3 transition active:scale-[0.98] cursor-pointer"
            >
              <UserMinus className="h-5 w-5" />
              <span>Job End Attendance</span>
            </button>

            <button
              onClick={onLogout}
              className="w-full py-4 bg-dark-900 hover:bg-dark-850 border border-dark-800 text-dark-300 hover:text-white font-bold text-xs rounded-xl flex items-center justify-center space-x-2 transition cursor-pointer"
            >
              <LogOut className="h-4 w-4" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      )}

      {/* ─── SCREEN 3: JOB START ATTENDANCE ─── */}
      {currentView === 'job_start' && (
        <div className="max-w-3xl mx-auto w-full space-y-6 animate-in slide-in-from-bottom duration-300">
          {/* Header */}
          <div className="flex items-center space-x-3">
            <button
              onClick={() => {
                stopGroupCamera();
                resetJobStartForm();
                setCurrentView('dashboard');
              }}
              className="p-2 bg-dark-900 border border-dark-800 rounded-xl text-dark-300 hover:text-white transition cursor-pointer"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-xl font-black text-white">Job Start Attendance</h1>
              <p className="text-xs text-dark-450">Capture group photograph to clock-in employees</p>
            </div>
          </div>

          {!jobStarted ? (
            /* Setup Site & Job Info */
            <div className="glass-panel rounded-3xl border border-dark-800/80 p-5 sm:p-6 space-y-5 shadow-xl">
              <div className="space-y-4 text-xs">
                {/* Site Name Input */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-dark-400 uppercase tracking-wider">
                    Site / Customer Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Enter worksite or client name"
                    value={siteName}
                    onChange={(e) => setSiteName(e.target.value)}
                    className="w-full bg-dark-950 border border-dark-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                    required
                  />
                </div>

                {/* Job Number Input */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-dark-400 uppercase tracking-wider">
                    Job Number (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="Enter Job or Work Order ID"
                    value={jobNumber}
                    onChange={(e) => setJobNumber(e.target.value)}
                    className="w-full bg-dark-950 border border-dark-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                {/* Display Captured Location */}
                <div className="p-3 bg-dark-950 border border-dark-850 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-dark-450 uppercase tracking-wider">GPS Coordinates</span>
                    <button
                      type="button"
                      onClick={fetchLocation}
                      disabled={gpsLoading}
                      className="text-[10px] text-emerald-400 hover:text-emerald-300 font-bold flex items-center space-x-1 cursor-pointer"
                    >
                      <RefreshCw className={`h-3 w-3 ${gpsLoading ? 'animate-spin' : ''}`} />
                      <span>{gpsLoading ? 'Locating...' : 'Refresh'}</span>
                    </button>
                  </div>
                  {gpsData ? (
                    <div className="text-[11px] text-dark-300 space-y-0.5 font-mono">
                      <div>Latitude: {gpsData.lat || 'Unavailable'}</div>
                      <div>Longitude: {gpsData.lon || 'Unavailable'}</div>
                      <div className="text-[9px] text-dark-500 mt-1">{gpsData.status}</div>
                    </div>
                  ) : (
                    <div className="text-xs text-dark-500 italic">No GPS coordinates captured. Click refresh to authorize location.</div>
                  )}
                </div>
              </div>

              {/* Start Attendance Trigger */}
              <button
                onClick={() => {
                  if (!siteName.trim()) {
                    alert('Site / Customer Name is required.');
                    return;
                  }
                  setStartTime(new Date().toLocaleTimeString());
                  setEntryDate(new Date().toISOString().split('T')[0]);
                  setJobStarted(true);
                  startGroupCamera('environment');
                }}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-lg transition active:scale-[0.98] cursor-pointer"
              >
                Start Attendance
              </button>
            </div>
          ) : (
            renderBiometricCapture()
          )}
        </div>
      )}

      {/* ─── SCREEN 4: JOB END ATTENDANCE ─── */}
      {currentView === 'job_end' && (
        <div className={`mx-auto w-full space-y-6 animate-in slide-in-from-bottom duration-300 ${
          jobEndSessionActive ? 'max-w-3xl' : 'max-w-xl'
        }`}>
          {/* Header */}
          <div className="flex items-center space-x-3">
            <button
              onClick={() => {
                if (jobEndSessionActive) {
                  stopGroupCamera();
                  setGroupScanImage(null);
                  setGroupDetectedFaces([]);
                  setJobEndSessionActive(false);
                } else {
                  setSearchJobNumber('');
                  setActiveSessionRecords([]);
                  setSearchAttempted(false);
                  setCurrentView('dashboard');
                }
              }}
              className="p-2 bg-dark-900 border border-dark-800 rounded-xl text-dark-300 hover:text-white transition cursor-pointer"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-xl font-black text-white">Job End Attendance</h1>
              <p className="text-xs text-dark-450">
                {jobEndSessionActive 
                  ? 'Capture group photograph to clock-out employees' 
                  : 'Close the attendance session and record departure timestamps'
                }
              </p>
            </div>
          </div>

          {jobEndSessionActive ? (
            renderBiometricCapture()
          ) : (
            <>
              {/* Active Jobs List */}
              <div className="space-y-3">
                <h2 className="text-[10px] font-bold text-dark-450 uppercase tracking-wider">
                  Active Jobs under your supervision
                </h2>
                
                {getActiveJobs().length > 0 ? (
                  <div className="grid grid-cols-1 gap-3">
                    {getActiveJobs().map((job) => (
                      <button
                        key={job.jobNumber}
                        onClick={() => {
                          setSiteName(job.siteName);
                          setJobNumber(job.jobNumber);
                          setSearchJobNumber(job.jobNumber);
                          setActiveSessionRecords(job.records);
                          setSearchAttempted(true);
                          setJobEndSessionActive(true);
                          startGroupCamera('environment');
                        }}
                        className={`w-full text-left glass-panel rounded-2xl border transition p-4 flex items-center justify-between hover:scale-[1.01] active:scale-[0.99] cursor-pointer ${
                          searchJobNumber === job.jobNumber 
                            ? 'border-violet-500/80 bg-violet-500/8 shadow-violet-500/5' 
                            : 'border-dark-800/80 hover:border-dark-700 bg-dark-900/40'
                        }`}
                      >
                        <div className="space-y-1">
                          <span className="text-xs font-black text-white block">
                            {job.siteName}
                          </span>
                          <span className="text-[10px] text-dark-450 font-mono block">
                            Job #: {job.jobNumber}
                          </span>
                          <span className="text-[9px] text-violet-400 font-bold block">
                            Started: {job.entryDate} at {job.startTime}
                          </span>
                        </div>
                        <div className="text-right flex flex-col items-end space-y-1.5">
                          <span className="px-2.5 py-1 rounded-full bg-violet-500/10 text-violet-400 text-[9px] font-black uppercase tracking-wider">
                            {job.employeeCount} Checked In
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 bg-dark-900/40 border border-dark-850 rounded-2xl text-center">
                    <span className="text-[10px] text-dark-500 italic">
                      No active jobs found under your name.
                    </span>
                  </div>
                )}
              </div>

              {/* Form and search */}
              <div className="glass-panel rounded-3xl border border-dark-800/80 p-5 sm:p-6 space-y-5 shadow-xl">
                <div className="space-y-4 text-xs">
                  {/* Job Number Search */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-dark-400 uppercase tracking-wider">
                      Job Number <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-dark-500 pointer-events-none" />
                      <input
                        type="text"
                        placeholder="Enter Job or Work Order ID to search"
                        value={searchJobNumber}
                        onChange={(e) => setSearchJobNumber(e.target.value)}
                        className="w-full bg-dark-950 border border-dark-800 rounded-xl pl-10 pr-4 py-3 text-xs text-white focus:outline-none focus:border-violet-500"
                        required
                      />
                    </div>
                  </div>

                  <button
                    onClick={handleJobSearch}
                    className="w-full py-3 bg-dark-900 hover:bg-dark-850 border border-dark-800 text-white font-bold text-xs rounded-xl flex items-center justify-center space-x-2 transition cursor-pointer"
                  >
                    <Search className="h-4 w-4" />
                    <span>Search & Load Active Session</span>
                  </button>
                </div>
              </div>

              {/* Session Load Results */}
              {searchAttempted && activeSessionRecords.length === 0 && (
                <div className="p-6 bg-rose-500/5 border border-rose-500/10 rounded-3xl text-center shadow-md space-y-2">
                  <AlertCircle className="h-8 w-8 text-rose-500 mx-auto" />
                  <h3 className="font-bold text-xs text-rose-400">No Session Found</h3>
                  <p className="text-[10px] text-dark-450 max-w-xs mx-auto leading-relaxed">
                    There are no active attendance records registered under Job Number **{searchJobNumber}**.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ─── MODAL 1: ASSIGN EXISTING EMPLOYEE ─── */}
      {showAssignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="glass-panel w-full max-w-md rounded-3xl border border-dark-800 p-6 space-y-5 shadow-2xl relative">
            <h2 className="text-sm font-black text-white">Assign Existing Employee</h2>
            <p className="text-[10px] text-dark-450 leading-relaxed mt-1">
              Select an employee from the system directory to link to this detected face.
            </p>

            <div className="max-h-64 overflow-y-auto divide-y divide-dark-850 pr-1 space-y-2">
              {(() => {
                const candidates = currentView === 'job_end'
                  ? employees.filter(emp => activeSessionRecords.some(r => r.employeeName === emp.name || r.employeePhone === emp.mobile))
                  : employees;
                const filtered = candidates.filter(emp => !groupDetectedFaces.some(f => f.matchedEmp && f.matchedEmp.id === emp.id));
                return filtered.length > 0 ? (
                  filtered.map(emp => (
                    <button
                      key={emp.id}
                      onClick={() => handleAssignConfirm(emp)}
                      className="w-full py-2.5 text-left flex items-center space-x-3 hover:bg-dark-900/50 px-2 rounded-xl transition cursor-pointer"
                    >
                      <img
                        src={emp.avatar}
                        alt={emp.name}
                        className="h-10 w-10 rounded-lg object-cover border border-dark-850 flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <span className="font-bold text-xs text-white block truncate">{emp.name}</span>
                        <span className="text-[10px] text-dark-500 block">Mob: {emp.mobile}</span>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="text-center py-4 text-xs text-dark-500 italic">No employees found.</div>
                );
              })()}
            </div>

            <button
              onClick={() => setShowAssignModal(false)}
              className="w-full py-2.5 bg-dark-900 hover:bg-dark-850 text-dark-300 font-bold text-xs rounded-xl transition cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ─── MODAL 2: REGISTER NEW EMPLOYEE ─── */}
      {showRegisterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="glass-panel w-full max-w-md rounded-3xl border border-dark-800 p-6 space-y-5 shadow-2xl relative">
            <h2 className="text-sm font-black text-white">Register New Employee</h2>
            <p className="text-[10px] text-dark-450 leading-relaxed mt-1">
              Enter employee profile details. The detected face crop will be trained and used as their biometric profile.
            </p>

            {registerError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-[10px] leading-relaxed">
                {registerError}
              </div>
            )}

            <form onSubmit={handleRegisterConfirm} className="space-y-4 text-xs text-left">
              {/* Name Input */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-dark-400 uppercase tracking-wider">Employee Name</label>
                <input
                  type="text"
                  placeholder="e.g. John Doe"
                  value={newEmpName}
                  onChange={(e) => setNewEmpName(e.target.value)}
                  className="w-full bg-dark-950 border border-dark-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-violet-500"
                  required
                />
              </div>

              {/* Mobile Input */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-dark-400 uppercase tracking-wider">Mobile Number</label>
                <input
                  type="tel"
                  placeholder="e.g. 9876543210"
                  value={newEmpMobile}
                  onChange={(e) => setNewEmpMobile(e.target.value)}
                  className="w-full bg-dark-950 border border-dark-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-violet-500"
                  required
                />
              </div>

              {/* Submit / Cancel Actions */}
              <div className="flex space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowRegisterModal(false)}
                  className="flex-1 py-2.5 bg-dark-900 hover:bg-dark-850 text-dark-300 font-bold text-xs rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs rounded-xl shadow-md transition cursor-pointer"
                >
                  Save Profile
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Hidden utility canvas for webcam draws */}
      <canvas ref={groupCanvasRef} className="hidden" />
    </div>
  );
}
