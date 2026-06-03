import React, { useState, useEffect, useRef } from 'react';
import { 
  UserPlus, 
  Search, 
  Camera, 
  Trash2, 
  User, 
  Phone, 
  Briefcase, 
  CheckCircle2, 
  ShieldAlert,
  XCircle,
  Video,
  RefreshCw,
  Zap,
  ZapOff
} from 'lucide-react';
import { dbService } from '../db/dbService';
import { generateBiometrics, extractBiometricsFromCanvas, trainEmployeeFace, cropFaceFromCanvas, detectFaceInCanvas, detectFaceInFile, getFaceDescriptor, assessFaceQuality, alignAndCropFace, getNormalFrontCameraDeviceId } from '../utils/faceEngine';

export default function RegisterEmployee() {
  const [employees, setEmployees] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Registration Form State
  const [liveBiometrics, setLiveBiometrics] = useState(null);
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [department, setDepartment] = useState('Packing');
  const [designation, setDesignation] = useState('');
  const [password, setPassword] = useState('123456');
  const [empRole, setEmpRole] = useState('employee'); // 'employee' | 'supervisor'
  const [facingMode, setFacingMode] = useState('user'); // 'user' (front) or 'environment' (back)
  const [sampleFacingMode, setSampleFacingMode] = useState('user'); // 'user' (front) or 'environment' (back)
  
  // Camera & Image Capture States
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [capturedImages, setCapturedImages] = useState([]); // Base64 cropped images
  const [capturedVectors, setCapturedVectors] = useState([]); // Grayscale vector features
  const [capturedBiometrics, setCapturedBiometrics] = useState([]); // Anatomical metrics
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  
  // Continuous Enrollment states
  const [selectedEmpForSamples, setSelectedEmpForSamples] = useState(null);
  const [sampleErrorMsg, setSampleErrorMsg] = useState('');
  const [isSampleCameraActive, setIsSampleCameraActive] = useState(false);
  const sampleVideoRef = useRef(null);
  const sampleCanvasRef = useRef(null);
  const sampleStreamRef = useRef(null);
  
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const canvasRef = useRef(null);

  // Torch/flash states for primary and sample cameras
  const [hasTorch, setHasTorch] = useState(false);
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [hasSampleTorch, setHasSampleTorch] = useState(false);
  const [isSampleTorchOn, setIsSampleTorchOn] = useState(false);

  useEffect(() => {
    setEmployees(dbService.getEmployees());
    // Auto-generate employee ID
    setId('EMP' + Math.floor(100 + Math.random() * 900));

    // Cleanup: stop all camera streams when navigating away
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      if (sampleStreamRef.current) {
        sampleStreamRef.current.getTracks().forEach(track => track.stop());
        sampleStreamRef.current = null;
      }
    };
  }, []);

  // Stop sample camera whenever the Biometric Sample Manager modal is closed
  useEffect(() => {
    if (!selectedEmpForSamples) {
      if (sampleStreamRef.current) {
        sampleStreamRef.current.getTracks().forEach(track => track.stop());
        sampleStreamRef.current = null;
      }
      setIsSampleCameraActive(false);
    }
  }, [selectedEmpForSamples]);

  useEffect(() => {
    if (capturedBiometrics.length === 3) {
      // Calculate averaged biometrics for display on the enrollment page!
      const avg = {
        pupilDistance: Math.round(capturedBiometrics.reduce((sum, b) => sum + b.pupilDistance, 0) / 3),
        noseRidgeAngle: Math.round(capturedBiometrics.reduce((sum, b) => sum + b.noseRidgeAngle, 0) / 3),
        faceAspect: parseFloat((capturedBiometrics.reduce((sum, b) => sum + b.faceAspect, 0) / 3).toFixed(2)),
        jawlineCurvature: parseFloat((capturedBiometrics.reduce((sum, b) => sum + b.jawlineCurvature, 0) / 3).toFixed(2)),
        chromaSpectral: Math.round(capturedBiometrics.reduce((sum, b) => sum + b.chromaSpectral, 0) / 3),
        livenessScore: Math.round(capturedBiometrics.reduce((sum, b) => sum + b.livenessScore, 0) / 3),
        eyebrowArch: parseFloat((capturedBiometrics.reduce((sum, b) => sum + (b.eyebrowArch || 1.25), 0) / 3).toFixed(2)),
        mouthWidth: Math.round(capturedBiometrics.reduce((sum, b) => sum + (b.mouthWidth || 40), 0) / 3),
        skinMelanin: Math.round(capturedBiometrics.reduce((sum, b) => sum + (b.skinMelanin || 120), 0) / 3),
        foreheadContrast: parseFloat((capturedBiometrics.reduce((sum, b) => sum + (b.foreheadContrast || 0.08), 0) / 3).toFixed(3)),
        faceSymmetry: parseFloat((capturedBiometrics.reduce((sum, b) => sum + (b.faceSymmetry || 0.88), 0) / 3).toFixed(2))
      };
      setLiveBiometrics(avg);
    } else {
      setLiveBiometrics(null);
    }
  }, [capturedBiometrics]);

  const handleStartCamera = async (currentFacingMode = facingMode) => {
    try {
      setErrorMsg('');
      setIsCameraActive(true);
      
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
        videoRef.current.play();
      }
    } catch (error) {
      console.error('Camera stream error:', error);
      setErrorMsg('Unable to access webcam. Please check your camera permissions.');
      setIsCameraActive(false);
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

  const capturePhoto = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
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
    
    setErrorMsg('');
    const localFaceBox = await detectFaceInCanvas(canvas);
    
    const quality = assessFaceQuality(canvas, localFaceBox, localFaceBox.landmarks);
    if (!quality.passed) {
      setErrorMsg(`Quality Check Failed: ${quality.reason}`);
      return;
    }
    
    const alignedCanvas = alignAndCropFace(canvas, localFaceBox.landmarks || localFaceBox);
    const cropBase64 = alignedCanvas.toDataURL('image/jpeg', 0.85);

    const imgVector = await getFaceDescriptor(alignedCanvas);
    if (!imgVector) {
      setErrorMsg('No clear face detected in this snap. Please realign and try again.');
      return;
    }
    const imgBio = extractBiometricsFromCanvas(alignedCanvas);
    
    const newImages = [...capturedImages, cropBase64];
    const newVectors = [...capturedVectors, imgVector];
    const newBiometrics = [...capturedBiometrics, imgBio];
    
    setCapturedImages(newImages);
    setCapturedVectors(newVectors);
    setCapturedBiometrics(newBiometrics);
    
    if (newImages.length >= 3) {
      handleStopCamera();
    }
  };

  const handleResetReference = () => {
    setCapturedImages([]);
    setCapturedVectors([]);
    setCapturedBiometrics([]);
    setLiveBiometrics(null);
  };

  const handleRetakeSnap = (idx) => {
    const newImages = [...capturedImages];
    const newVectors = [...capturedVectors];
    const newBiometrics = [...capturedBiometrics];
    
    newImages.splice(idx, 1);
    newVectors.splice(idx, 1);
    newBiometrics.splice(idx, 1);
    
    setCapturedImages(newImages);
    setCapturedVectors(newVectors);
    setCapturedBiometrics(newBiometrics);
    
    // Auto restart camera if it is not active so they can snap the replacement photo
    if (!isCameraActive) {
      handleStartCamera();
    }
  };

  const handleRegister = (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    
    if (!id || !name || !mobile || !designation) {
      setErrorMsg('All demographic fields are required.');
      return;
    }
    
    if (capturedImages.length < 3) {
      setErrorMsg('Minimum 3 face reference images are required for facial recognition matching.');
      return;
    }

    const samples = capturedImages.map((img, idx) => ({
      id: `SAMP_${id}_${idx + 1}`,
      vector: capturedVectors[idx],
      avatar: img,
      quality: { blur: 18.0, brightness: 120, contrast: 50, eyeVisible: true, headYaw: 1.0, headPitch: 1.0, isPartial: false, passed: true },
      registeredAt: new Date().toISOString()
    }));

    // Call the training function to get centroid vectors and averaged parameters
    const trainedBiometrics = trainEmployeeFace(capturedVectors, capturedBiometrics);

    const newEmployee = {
      id,
      name,
      mobile,
      department,
      designation,
      password,
      role: empRole,
      avatar: capturedImages[0], // First crop acts as avatar
      registeredPhotos: capturedImages,
      biometrics: trainedBiometrics,
      samples,
      registeredAt: new Date().toISOString()
    };

    const res = dbService.saveEmployee(newEmployee);
    if (!res.success) {
      setErrorMsg(res.error);
    } else {
      setSuccessMsg(`Employee ${name} registered successfully!`);
      // Reset form
      setName('');
      setMobile('');
      setDesignation('');
      setPassword('123456');
      handleResetReference();
      setId('EMP' + Math.floor(100 + Math.random() * 900));
      setEmployees(dbService.getEmployees());
    }
  };

  const handleDeleteEmployee = (empId) => {
    if (confirm("Are you sure you want to de-register this employee and wipe their biometric templates?")) {
      const res = dbService.deleteEmployee(empId);
      if (res.success) {
        setEmployees(dbService.getEmployees());
        setSuccessMsg("Employee profile successfully de-registered and wiped.");
      } else {
        setErrorMsg(res.error);
      }
    }
  };

  const startSampleCamera = async (currentFacingMode = sampleFacingMode) => {
    try {
      setSampleErrorMsg('');
      setIsSampleCameraActive(true);
      
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
      sampleStreamRef.current = stream;

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
      setHasSampleTorch(supportsTorch);
      setIsSampleTorchOn(false);

      if (sampleVideoRef.current) {
        sampleVideoRef.current.srcObject = stream;
        sampleVideoRef.current.play();
      }
    } catch (e) {
      console.error(e);
      setSampleErrorMsg('Unable to access webcam.');
      setIsSampleCameraActive(false);
    }
  };

  const toggleSampleFacingMode = () => {
    const nextMode = sampleFacingMode === 'user' ? 'environment' : 'user';
    setSampleFacingMode(nextMode);
    if (isSampleCameraActive) {
      stopSampleCamera();
      setTimeout(() => {
        startSampleCamera(nextMode);
      }, 100);
    }
  };

  const stopSampleCamera = () => {
    if (sampleStreamRef.current) {
      sampleStreamRef.current.getTracks().forEach(t => t.stop());
      sampleStreamRef.current = null;
    }
    if (sampleVideoRef.current) {
      sampleVideoRef.current.srcObject = null;
    }
    setIsSampleCameraActive(false);
    setHasSampleTorch(false);
    setIsSampleTorchOn(false);
  };

  const toggleSampleTorch = async () => {
    if (!sampleStreamRef.current) return;
    const track = sampleStreamRef.current.getVideoTracks()[0];
    if (!track) return;
    try {
      const nextTorchState = !isSampleTorchOn;
      await track.applyConstraints({
        advanced: [{ torch: nextTorchState }]
      });
      setIsSampleTorchOn(nextTorchState);
    } catch (err) {
      console.error("Failed to toggle torch:", err);
    }
  };

  const captureSamplePhoto = async () => {
    if (!sampleVideoRef.current || !sampleCanvasRef.current || !selectedEmpForSamples) return;
    const video = sampleVideoRef.current;
    const canvas = sampleCanvasRef.current;
    const ctx = canvas.getContext('2d');
    
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

    const localFaceBox = await detectFaceInCanvas(canvas);
    const quality = assessFaceQuality(canvas, localFaceBox, localFaceBox.landmarks);
    if (!quality.passed) {
      setSampleErrorMsg(`Quality Check Failed: ${quality.reason}`);
      return;
    }

    const alignedCanvas = alignAndCropFace(canvas, localFaceBox.landmarks || localFaceBox);
    const cropBase64 = alignedCanvas.toDataURL('image/jpeg', 0.85);
    const imgVector = await getFaceDescriptor(alignedCanvas);

    if (!imgVector) {
      setSampleErrorMsg('Failed to extract face descriptors. Please try again.');
      return;
    }

    const newSample = {
      id: `SAMP_${selectedEmpForSamples.id}_${Date.now()}`,
      vector: imgVector,
      avatar: cropBase64,
      quality: {
        blur: parseFloat(quality.blur.toFixed(2)),
        brightness: Math.round(quality.brightness),
        contrast: Math.round(quality.contrast),
        eyeVisible: true,
        headYaw: parseFloat(quality.yaw.toFixed(2)),
        headPitch: parseFloat(quality.pitch.toFixed(2)),
        isPartial: false,
        passed: true
      },
      registeredAt: new Date().toISOString()
    };

    const res = dbService.addEmployeeSample(selectedEmpForSamples.id, newSample);
    if (res.success) {
      setSelectedEmpForSamples(res.employee);
      setEmployees(dbService.getEmployees());
      setSampleErrorMsg('');
      stopSampleCamera();
    } else {
      setSampleErrorMsg(res.error);
    }
  };

  const deleteSample = (sampleId) => {
    if (!selectedEmpForSamples) return;
    const res = dbService.deleteEmployeeSample(selectedEmpForSamples.id, sampleId);
    if (res.success) {
      setSelectedEmpForSamples(res.employee);
      setEmployees(dbService.getEmployees());
    } else {
      setSampleErrorMsg(res.error);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMsg('');
    setSuccessMsg('');

    const reader = new FileReader();
    reader.onload = async (event) => {
      const img = new Image();
      img.onload = async () => {
        try {
          // Downscale to ≤600px — TinyFaceDetector works best at modest resolutions
          const maxDim = 600;
          let w = img.width;
          let h = img.height;
          if (w > maxDim || h > maxDim) {
            if (w > h) { h = Math.round((h * maxDim) / w); w = maxDim; }
            else        { w = Math.round((w * maxDim) / h); h = maxDim; }
          }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);

          // Use the file-optimised detector (progressive thresholds, larger input sizes)
          const faceBox = await detectFaceInFile(canvas);

          // Align & crop using landmarks when available; fallback to centre-crop
          const alignedCanvas = alignAndCropFace(canvas, faceBox.landmarks || faceBox);
          const cropBase64 = alignedCanvas.toDataURL('image/jpeg', 0.85);

          // Extract 128-dim descriptor — this is the core quality signal
          const imgVector = await getFaceDescriptor(alignedCanvas);
          if (!imgVector) {
            setErrorMsg('Could not extract facial features from this image. Please use a clearer front-facing portrait and try again.');
            return;
          }
          const imgBio = extractBiometricsFromCanvas(alignedCanvas);

          setCapturedImages(prev => [...prev, cropBase64]);
          setCapturedVectors(prev => [...prev, imgVector]);
          setCapturedBiometrics(prev => [...prev, imgBio]);

          if (!faceBox.detected) {
            setErrorMsg(prev => prev ? prev : 'ⓘ Face auto-detection was uncertain — image enrolled using centre-crop fallback. For best accuracy use a clear front-facing portrait.');
          }
        } catch (err) {
          console.error('File parsing error:', err);
          setErrorMsg(`Failed to process image file: ${err.message || err}`);
        }
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSampleFileUpload = async (e) => {
    if (!selectedEmpForSamples) return;
    const file = e.target.files?.[0];
    if (!file) return;

    setSampleErrorMsg('');

    const reader = new FileReader();
    reader.onload = async (event) => {
      const img = new Image();
      img.onload = async () => {
        try {
          // Downscale to ≤600px
          const maxDim = 600;
          let w = img.width;
          let h = img.height;
          if (w > maxDim || h > maxDim) {
            if (w > h) { h = Math.round((h * maxDim) / w); w = maxDim; }
            else        { w = Math.round((w * maxDim) / h); h = maxDim; }
          }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);

          // Use the file-optimised detector
          const faceBox = await detectFaceInFile(canvas);

          // Align & crop
          const alignedCanvas = alignAndCropFace(canvas, faceBox.landmarks || faceBox);
          const cropBase64 = alignedCanvas.toDataURL('image/jpeg', 0.85);

          // Extract descriptor
          const imgVector = await getFaceDescriptor(alignedCanvas);
          if (!imgVector) {
            setSampleErrorMsg('Failed to extract face descriptors from this image. Please use a clearer portrait.');
            return;
          }

          const newSample = {
            id: `SAMP_${selectedEmpForSamples.id}_${Date.now()}`,
            vector: imgVector,
            avatar: cropBase64,
            quality: {
              blur: 18.0,
              brightness: 120,
              contrast: 50,
              eyeVisible: faceBox.detected,
              headYaw: 1.0,
              headPitch: 1.0,
              isPartial: false,
              passed: true
            },
            registeredAt: new Date().toISOString()
          };

          const res = dbService.addEmployeeSample(selectedEmpForSamples.id, newSample);
          if (res.success) {
            setSelectedEmpForSamples(res.employee);
            setSampleErrorMsg('');
            setEmployees(dbService.getEmployees());
            if (!faceBox.detected) {
              setSampleErrorMsg('ⓘ Auto-detection was uncertain — sample enrolled using centre-crop fallback.');
            }
          } else {
            setSampleErrorMsg(res.error);
          }
        } catch (err) {
          console.error('Sample file parsing error:', err);
          setSampleErrorMsg(`Failed to process sample image file: ${err.message || err}`);
        }
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const filteredEmployees = employees.filter(e => 
    e.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.department.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
      {/* Left Panel: Employee Registration Form */}
      <div className="glass-panel p-6 rounded-2xl border border-dark-800/60 flex flex-col justify-between">
        <div>
          <h2 className="text-xl font-display font-extrabold text-white flex items-center space-x-2.5">
            <UserPlus className="h-5.5 w-5.5 text-brand-400" />
            <span>Register New Employee</span>
          </h2>
          <p className="text-xs text-dark-400 mt-1">
            Enroll details and capture 3 distinct face coordinates to compile facial recognition embeddings.
          </p>

          <form onSubmit={handleRegister} className="space-y-4 mt-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-dark-400">Employee ID</label>
                <input
                  type="text"
                  value={id}
                  disabled
                  className="bg-dark-900 border border-dark-800 rounded-xl px-4 py-2.5 text-xs font-bold text-dark-500 cursor-not-allowed"
                />
              </div>

              <div className="flex flex-col space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-dark-400">Full Name</label>
                <input
                  type="text"
                  placeholder="e.g. John Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="custom-input text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-dark-400">Mobile Number</label>
                <input
                  type="text"
                  placeholder="e.g. +91 99999 88888"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  className="custom-input text-xs"
                />
              </div>

              <div className="flex flex-col space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-dark-400">Designation</label>
                <input
                  type="text"
                  placeholder="e.g. Loader Operator"
                  value={designation}
                  onChange={(e) => setDesignation(e.target.value)}
                  className="custom-input text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-dark-400">Department</label>
                <select
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="bg-dark-950 border border-dark-800 rounded-xl px-4 py-2.5 text-xs text-dark-300 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/20 transition-all duration-200"
                >
                  <option value="Packing">Packing</option>
                  <option value="Warehouse">Warehouse</option>
                  <option value="Operations">Operations</option>
                  <option value="Quality">Quality Control</option>
                </select>
              </div>

              <div className="flex flex-col space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-dark-400">System Role</label>
                <select
                  value={empRole}
                  onChange={(e) => setEmpRole(e.target.value)}
                  className="bg-dark-950 border border-dark-800 rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/20 transition-all duration-200"
                  style={{ color: empRole === 'supervisor' ? '#a78bfa' : '#94a3b8' }}
                >
                  <option value="employee">👤 Employee</option>
                  <option value="supervisor">👥 Supervisor</option>
                </select>
              </div>
            </div>

            <div className="flex flex-col space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-dark-400">Login Password / PIN</label>
              <input
                type="text"
                placeholder="e.g. 123456"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="custom-input text-xs"
                required
              />
            </div>

            {/* Facial Capture Module */}
            <div className="border border-dark-800/80 rounded-2xl bg-dark-950/20 p-4 space-y-3.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-dark-300 flex items-center">
                  <Camera className="h-4 w-4 mr-1.5 text-brand-400" />
                  Facial Capture Reference ({capturedImages.length}/3)
                </span>
                {capturedImages.length > 0 && (
                  <button
                    type="button"
                    onClick={handleResetReference}
                    className="text-[10px] text-rose-400 font-bold hover:underline"
                  >
                    Reset reference
                  </button>
                )}
              </div>

              {/* Camera Area */}
              {isCameraActive ? (
                <div className="relative aspect-[3/4] md:aspect-video rounded-xl overflow-hidden border border-dark-800 bg-black flex items-center justify-center">
                  <video 
                    ref={videoRef} 
                    className={`w-full h-full object-cover ${facingMode === 'user' ? 'transform -scale-x-100' : ''}`}
                    playsInline 
                    muted 
                  />
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

                  {/* Visual guide removed. Detection runs automatically on capture. */}
                  
                  {/* Capture Button */}
                  <button
                    type="button"
                    onClick={capturePhoto}
                    className="absolute bottom-4 px-5 py-2.5 bg-brand-600 hover:bg-brand-500 border border-brand-400/20 text-white text-xs font-bold rounded-xl flex items-center space-x-1.5 shadow-lg glow-blue transition duration-150"
                  >
                    <Video className="h-4 w-4 animate-pulse" />
                    <span>Snap Image {capturedImages.length + 1}</span>
                  </button>
                </div>
              ) : (
                capturedImages.length < 3 && (
                  <div className="h-36 rounded-xl border border-dashed border-dark-800 bg-dark-900/10 flex flex-col items-center justify-center text-center p-4 space-y-2">
                    <Camera className="h-7 w-7 text-dark-500" />
                    <div className="flex flex-row items-center space-x-3">
                      <button
                        type="button"
                        onClick={handleStartCamera}
                        className="px-4 py-2 bg-brand-600 hover:bg-brand-500 border border-brand-500 rounded-xl text-xs font-bold text-white transition cursor-pointer shadow-md glow-blue"
                      >
                        Start Camera
                      </button>
                      <span className="text-[10px] text-dark-500 font-bold">OR</span>
                      <label className="px-4 py-2 bg-dark-900 hover:bg-dark-850 border border-dark-800 rounded-xl text-xs font-bold text-brand-400 transition cursor-pointer flex items-center">
                        <span>Upload File</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleFileUpload}
                          className="hidden"
                        />
                      </label>
                    </div>
                    <p className="text-[9px] text-dark-500 leading-normal">Webcam or clear portrait image files (JPG, PNG) can be used.</p>
                  </div>
                )
              )}

              {/* Capture progress preview with retake capability */}
              <div className="grid grid-cols-3 gap-3">
                {capturedImages.map((img, i) => (
                  <div key={i} className="relative aspect-square bg-dark-900 rounded-xl overflow-hidden border border-dark-800 group">
                    <img src={img} className="w-full h-full object-cover" alt={`Face ${i+1}`} />
                    <span className="absolute bottom-1 left-1 bg-emerald-500 text-white text-[9px] px-1.5 py-0.5 rounded-full font-bold z-10">
                      Snap {i+1}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRetakeSnap(i)}
                      className="absolute inset-0 bg-black/75 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center text-rose-400 font-extrabold text-[10px] tracking-wider transition duration-150 rounded-xl cursor-pointer"
                    >
                      <span>Retake Snap</span>
                    </button>
                  </div>
                ))}
                {Array.from({ length: 3 - capturedImages.length }).map((_, i) => (
                  <div key={i} className="aspect-square bg-dark-950/40 rounded-xl border border-dashed border-dark-900 flex items-center justify-center text-dark-700 text-xs">
                    Slot {capturedImages.length + i + 1}
                  </div>
                ))}
              </div>

              {liveBiometrics && (
                <div className="bg-brand-500/5 border border-brand-500/20 p-3.5 rounded-xl space-y-2 mt-4 animate-in fade-in duration-200 text-xs">
                  <p className="text-[10px] font-bold text-brand-400 uppercase tracking-wider flex items-center">
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                    Facial Biometrics Calibrated
                  </p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[10px] text-dark-300">
                    <div className="flex justify-between">
                      <span className="text-dark-500">IPD Index:</span>
                      <span className="font-bold text-white">{liveBiometrics.pupilDistance} mm</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-dark-500">Nose Bridge Angle:</span>
                      <span className="font-bold text-white">{liveBiometrics.noseRidgeAngle}°</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-dark-500">Face Width Ratio:</span>
                      <span className="font-bold text-white">{liveBiometrics.faceAspect.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-dark-500">Jawline Arc Contour:</span>
                      <span className="font-bold text-white">{liveBiometrics.jawlineCurvature.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-dark-500">Eyebrow Arch Profile:</span>
                      <span className="font-bold text-white">{liveBiometrics.eyebrowArch ? liveBiometrics.eyebrowArch.toFixed(2) : '1.25'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-dark-500">Mouth Width Ratio:</span>
                      <span className="font-bold text-white">{liveBiometrics.mouthWidth || '40'} mm</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-dark-500">Skin Melanin Depth:</span>
                      <span className="font-bold text-white">{liveBiometrics.skinMelanin || '120'} index</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-dark-500">Forehead Contrast:</span>
                      <span className="font-bold text-white">{liveBiometrics.foreheadContrast ? liveBiometrics.foreheadContrast.toFixed(3) : '0.080'}</span>
                    </div>
                    <div className="flex justify-between font-bold col-span-2 border-t border-dark-900/60 pt-2 mt-1">
                      <span className="text-dark-400">Horizontal Symmetry:</span>
                      <span className="text-brand-400">{liveBiometrics.faceSymmetry ? (liveBiometrics.faceSymmetry * 100).toFixed(0) : '88'}%</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Notifications */}
            {errorMsg && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs rounded-xl flex items-center space-x-2">
                <XCircle className="h-4.5 w-4.5 flex-shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}
            
            {successMsg && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs rounded-xl flex items-center space-x-2">
                <CheckCircle2 className="h-4.5 w-4.5 flex-shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}

            <button
              type="submit"
              className="w-full py-3 bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 text-white text-xs font-bold rounded-xl shadow-lg glow-blue transition duration-200"
            >
              Finalize & Enroll Employee Profile
            </button>
          </form>
        </div>
      </div>

      {/* Right Panel: Employee Registry Directory */}
      <div className="glass-panel p-6 rounded-2xl border border-dark-800/60 flex flex-col justify-between h-[550px] lg:h-full overflow-hidden">
        <div className="flex flex-col space-y-4 h-full overflow-hidden">
          <div>
            <h2 className="text-xl font-display font-extrabold text-white flex items-center space-x-2.5">
              <User className="h-5.5 w-5.5 text-brand-400" />
              <span>Shift Registry Directory</span>
            </h2>
            <p className="text-xs text-dark-400 mt-1">
              Active directory of enrolled workforce packers, warehouse staff, and operators.
            </p>
          </div>

          {/* Search Box */}
          <div className="relative">
            <Search className="absolute left-3.5 top-3 h-4 w-4 text-dark-500" />
            <input
              type="text"
              placeholder="Search by ID, name, or department..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-dark-950/60 border border-dark-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-dark-100 focus:outline-none focus:border-brand-500"
            />
          </div>

          {/* Directory List Container */}
          <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
            {filteredEmployees.map((emp) => (
              <div 
                key={emp.id}
                className="bg-dark-900/20 p-3.5 rounded-xl border border-dark-850 hover:border-dark-700/60 transition duration-150 flex items-center justify-between"
              >
                <div className="flex items-center space-x-3.5 min-w-0">
                  <div className="relative flex-shrink-0">
                    <img 
                      src={emp.avatar} 
                      className="w-10 h-10 rounded-full border border-dark-800 object-cover" 
                      alt={emp.name} 
                    />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs font-bold text-white leading-tight truncate">{emp.name}</h4>
                    <p className="text-[10px] text-dark-400 font-medium mt-0.5 truncate">{emp.designation}</p>
                    <div className="flex items-center space-x-2 mt-1.5">
                      <span className="text-[9px] uppercase tracking-wider bg-brand-500/10 border border-brand-500/20 text-brand-400 px-2 py-0.5 rounded-md font-bold">
                        {emp.department}
                      </span>
                      <span className="text-[9px] text-dark-500 font-medium">
                        ID: {emp.id}
                      </span>
                    </div>
                  </div>
                </div>
                
                <div className="text-right flex-shrink-0 space-y-2 flex flex-col items-end justify-between">
                  <div className="text-right space-y-1">
                    <p className="text-[10px] text-dark-400 font-bold">{emp.mobile}</p>
                    <p className="text-[9px] text-dark-500 font-semibold">Registered: {new Date(emp.registeredAt).toLocaleDateString()}</p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => setSelectedEmpForSamples(emp)}
                      className="p-1.5 bg-brand-600/10 hover:bg-brand-600/20 border border-brand-500/10 hover:border-brand-500/30 text-brand-400 rounded-lg transition"
                      title="Manage face biometric samples"
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteEmployee(emp.id)}
                      className="p-1.5 bg-rose-600/10 hover:bg-rose-600/20 border border-rose-500/10 hover:border-rose-500/30 text-rose-400 rounded-lg transition"
                      title="Delete employee profile"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
            
            {filteredEmployees.length === 0 && (
              <p className="text-xs text-dark-500 text-center py-12">No registered employees match your query.</p>
            )}
          </div>
        </div>

        {/* Hidden capturing canvas */}
        <canvas ref={canvasRef} className="hidden" />
      </div>

      {/* Biometric Samples Manager Modal */}
      {selectedEmpForSamples && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-dark-950 border border-dark-800 w-full max-w-2xl rounded-3xl p-6 flex flex-col space-y-5 shadow-2xl animate-in fade-in zoom-in-95 duration-200 text-xs max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-dark-900 pb-3">
              <div>
                <h3 className="font-display font-extrabold text-sm text-white">
                  Biometric Face Sample Manager
                </h3>
                <p className="text-[10px] text-dark-400 mt-0.5">
                  Continuous Enrollment for {selectedEmpForSamples.name} ({selectedEmpForSamples.id})
                </p>
              </div>
              <button
                onClick={() => { setSelectedEmpForSamples(null); stopSampleCamera(); setSampleErrorMsg(''); }}
                className="text-xs text-dark-500 hover:text-white font-bold"
              >
                Close (ESC)
              </button>
            </div>

            {sampleErrorMsg && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[10px] rounded-xl flex items-center space-x-2">
                <XCircle className="h-4 w-4 flex-shrink-0" />
                <span>{sampleErrorMsg}</span>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left Column: Active Camera Capture to add new sample */}
              <div className="space-y-4">
                <h4 className="font-bold text-[10px] uppercase text-brand-400 tracking-wider">Add New Facial Sample</h4>
                {isSampleCameraActive ? (
                  <div className="relative aspect-square rounded-2xl overflow-hidden border border-dark-800 bg-black flex items-center justify-center">
                    <video
                      ref={sampleVideoRef}
                      className={`w-full h-full object-cover animate-in fade-in ${sampleFacingMode === 'user' ? 'transform -scale-x-100' : ''}`}
                      playsInline
                      muted
                    />
                    <div className="absolute top-4 right-4 flex space-x-2 z-20">
                      {hasSampleTorch && (
                        <button
                          type="button"
                          onClick={toggleSampleTorch}
                          className={`p-2 rounded-xl border border-dark-800 transition cursor-pointer ${
                            isSampleTorchOn 
                              ? 'bg-amber-500 text-dark-950 font-extrabold shadow-md glow-amber' 
                              : 'bg-dark-950/80 hover:bg-dark-900 text-white'
                          }`}
                          title={isSampleTorchOn ? "Turn off Flash" : "Turn on Flash"}
                        >
                          {isSampleTorchOn ? <Zap className="h-4 w-4" /> : <ZapOff className="h-4 w-4" />}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={toggleSampleFacingMode}
                        className="p-2 bg-dark-950/80 hover:bg-dark-900 border border-dark-800 text-white rounded-xl transition cursor-pointer"
                        title="Flip camera"
                      >
                        <RefreshCw className="h-4 w-4 text-brand-400" />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={captureSamplePhoto}
                      className="absolute bottom-4 left-1/2 transform -translate-x-1/2 px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white font-bold rounded-xl flex items-center space-x-1.5 shadow-lg shadow-brand-600/30"
                    >
                      <Camera className="h-4 w-4" />
                      <span>Capture & Verify Sample</span>
                    </button>
                  </div>
                ) : (
                  <div className="aspect-square rounded-2xl border border-dashed border-dark-800 bg-dark-900/20 flex flex-col items-center justify-center text-center p-6 space-y-3">
                    <Camera className="h-8 w-8 text-dark-500" />
                    <div className="flex flex-col items-center space-y-2">
                      <button
                        type="button"
                        onClick={startSampleCamera}
                        className="px-4 py-2 bg-brand-600 hover:bg-brand-500 border border-brand-500 rounded-xl text-xs font-bold text-white transition cursor-pointer shadow-md glow-blue"
                      >
                        Turn On Camera
                      </button>
                      <span className="text-[10px] text-dark-500 font-bold">OR</span>
                      <label className="px-4 py-2 bg-dark-900 hover:bg-dark-850 border border-dark-800 rounded-xl text-xs font-bold text-brand-400 transition cursor-pointer flex items-center justify-center">
                        <span>Upload Sample File</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleSampleFileUpload}
                          className="hidden"
                        />
                      </label>
                    </div>
                    <p className="text-[9px] text-dark-500 leading-relaxed max-w-[200px]">
                      Capture or upload additional face samples in different angles or lighting to improve recognition accuracy.
                    </p>
                  </div>
                )}
                <canvas ref={sampleCanvasRef} className="hidden" />
              </div>

              {/* Right Column: List of existing biometric samples */}
              <div className="space-y-4 flex flex-col overflow-hidden">
                <h4 className="font-bold text-[10px] uppercase text-dark-400 tracking-wider">Active Enrollment Samples ({selectedEmpForSamples.samples?.length || 0})</h4>
                <div className="flex-1 overflow-y-auto space-y-3 max-h-72 pr-1">
                  {selectedEmpForSamples.samples?.map((samp, index) => (
                    <div
                      key={samp.id}
                      className="bg-dark-900/40 p-3 rounded-2xl border border-dark-850 flex items-center justify-between"
                    >
                      <div className="flex items-center space-x-3">
                        <img
                          src={samp.avatar}
                          className="w-12 h-12 rounded-xl object-cover border border-dark-800 bg-dark-950"
                          alt="Sample Thumbnail"
                        />
                        <div className="space-y-0.5">
                          <p className="font-bold text-white text-[10px]">Sample #{index + 1}</p>
                          <p className="text-[9px] text-dark-500">Added: {new Date(samp.registeredAt).toLocaleDateString()}</p>
                          <div className="flex flex-wrap gap-1 mt-1 text-[8px] font-mono text-emerald-400">
                            <span>B: {samp.quality?.brightness || 120}</span>
                            <span className="text-dark-600">•</span>
                            <span>C: {samp.quality?.contrast || 45}</span>
                            <span className="text-dark-600">•</span>
                            <span>Blur: {samp.quality?.blur || 18.0}</span>
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => deleteSample(samp.id)}
                        disabled={selectedEmpForSamples.samples.length <= 1}
                        className="p-1.5 bg-rose-600/10 hover:bg-rose-600/20 border border-rose-500/10 text-rose-400 rounded-lg transition disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                        title="Delete this sample"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
