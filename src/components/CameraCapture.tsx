import React, { useRef, useState, useEffect } from "react";
import { Camera, Upload, Image as ImageIcon, AlertCircle, RefreshCw } from "lucide-react";

interface CameraCaptureProps {
  onCapture: (base64Image: string) => void;
  isLoading: boolean;
}

export default function CameraCapture({ onCapture, isLoading }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);

  // Initialize and request camera
  const startCamera = async () => {
    setCameraError(null);
    try {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });

      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      setCameraActive(true);
    } catch (err: any) {
      console.warn("Camera access failed:", err);
      setCameraError(
        "Camera access not available. You can still upload a photo of any city landmark using the dropzone below!"
      );
      setCameraActive(false);
    }
  };

  useEffect(() => {
    startCamera();
    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // Capture frame from webcam stream
  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    if (ctx) {
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      // Draw the video frame to the canvas
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      // Export as high quality JPEG base64
      const base64Data = canvas.toDataURL("image/jpeg", 0.9);
      onCapture(base64Data);
    }
  };

  // Handle uploaded files (drag-and-drop or manual selection)
  const processFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      alert("Please select a valid image file.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      if (result) {
        onCapture(result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files[0]) {
      processFile(files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = e.dataTransfer.files;
    if (files && files[0]) {
      processFile(files[0]);
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="w-full space-y-6" id="camera-capture-container">
      {/* Live Video Viewer or Drag Area */}
      <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 shadow-inner flex items-center justify-center">
        {cameraActive && !cameraError ? (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="h-full w-full object-cover"
              id="camera-video-preview"
            />
            {/* Custom AR Sight overlay */}
            <div className="pointer-events-none absolute inset-0 border-2 border-dashed border-sky-400/30 m-8 rounded-lg flex items-center justify-center">
              <div className="w-12 h-12 border-t-2 border-l-2 border-sky-400 absolute top-0 left-0"></div>
              <div className="w-12 h-12 border-t-2 border-r-2 border-sky-400 absolute top-0 right-0"></div>
              <div className="w-12 h-12 border-b-2 border-l-2 border-sky-400 absolute bottom-0 left-0"></div>
              <div className="w-12 h-12 border-b-2 border-r-2 border-sky-400 absolute bottom-0 right-0"></div>
              <div className="w-8 h-[2px] bg-sky-400/50 absolute"></div>
              <div className="h-8 w-[2px] bg-sky-400/50 absolute"></div>
              <p className="text-xs font-mono text-sky-400/80 uppercase tracking-widest absolute bottom-4">
                AR HUD Active
              </p>
            </div>

            {/* Futuristic Scanning line animation */}
            <div className="pointer-events-none absolute left-0 right-0 h-1 bg-gradient-to-r from-transparent via-sky-400 to-transparent shadow-[0_0_12px_rgba(56,189,248,0.8)] animate-bounce" />

            {/* Bottom Shutter Controls overlay */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4 z-10">
              <button
                type="button"
                id="shutter-button"
                onClick={capturePhoto}
                disabled={isLoading}
                className="group flex h-16 w-16 items-center justify-center rounded-full border-4 border-white bg-red-500 shadow-xl hover:bg-red-600 disabled:opacity-50 transition-transform active:scale-95 duration-150 cursor-pointer"
                title="Capture Landmark"
              >
                <div className="h-8 w-8 rounded-full bg-white transition-all group-hover:scale-90" />
              </button>
            </div>
          </>
        ) : (
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={triggerFileSelect}
            className={`flex h-full w-full flex-col items-center justify-center gap-4 p-8 transition-all duration-300 cursor-pointer border-2 border-dashed ${
              isDragOver
                ? "border-sky-500 bg-slate-900/40 text-sky-400 scale-[0.99]"
                : "border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700"
            }`}
          >
            <div className="rounded-full bg-slate-900 p-4 border border-slate-800 shadow-md">
              <Upload className={`h-8 w-8 ${isDragOver ? "text-sky-400 animate-pulse" : "text-slate-400"}`} />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-white">
                Drag & drop landmark photo here
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Supports JPG, PNG (up to 12MB)
              </p>
            </div>
            <button
              type="button"
              className="rounded-full bg-sky-500 px-5 py-2 text-xs font-semibold text-white shadow-lg shadow-sky-500/20 hover:bg-sky-400 transition-all cursor-pointer"
            >
              Browse Local Files
            </button>
          </div>
        )}

        {/* Hidden capturing canvas */}
        <canvas ref={canvasRef} className="hidden" />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
          id="camera-file-input"
        />
      </div>

      {/* Helper options below stream */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-4">
        {cameraActive ? (
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <p className="text-xs font-mono text-slate-500 uppercase tracking-wider">
              Live Sight Feed Online
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-slate-500">
            <ImageIcon className="h-4 w-4" />
            <span className="text-xs font-mono uppercase tracking-wider">
              Photo Upload Mode
            </span>
          </div>
        )}

        <div className="flex gap-2">
          {cameraActive ? (
            <button
              type="button"
              onClick={triggerFileSelect}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 transition-all cursor-pointer shadow-sm"
            >
              <Upload className="h-3.5 w-3.5" /> Upload Instead
            </button>
          ) : (
            <button
              type="button"
              onClick={startCamera}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 transition-all cursor-pointer shadow-sm"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Retry Camera
            </button>
          )}
        </div>
      </div>

      {cameraError && (
        <div className="flex items-start gap-3 rounded-xl bg-amber-50 border border-amber-200 p-4 text-amber-800">
          <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="text-sm font-semibold">Camera Advisory</h4>
            <p className="text-xs leading-relaxed text-amber-700">{cameraError}</p>
          </div>
        </div>
      )}
    </div>
  );
}
