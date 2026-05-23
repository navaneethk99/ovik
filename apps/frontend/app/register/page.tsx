"use client";

import React, { useRef, useState, useEffect } from "react";
import Link from "next/link";

const defaultBackendURL = "http://localhost:8080";

function backendURL() {
  return process.env.NEXT_PUBLIC_BACKEND_URL || defaultBackendURL;
}

export default function Register() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [name, setName] = useState("");
  const [position, setPosition] = useState("");
  const [compensation, setCompensation] = useState("");
  const [age, setAge] = useState("");
  const [address, setAddress] = useState("");
  const [panCard, setPanCard] = useState("");
  const [aadhaarCard, setAadhaarCard] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [dateOfJoining, setDateOfJoining] = useState("");
  const [emergencyContact, setEmergencyContact] = useState("");

  const [isCapturing, setIsCapturing] = useState(false);
  const [message, setMessage] = useState<{
    text: string;
    type: "success" | "error" | "info";
  } | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [frontendEnabled, setFrontendEnabled] = useState<boolean>(true);
  const [checkingStatus, setCheckingStatus] = useState<boolean>(true);

  // New upload states
  const [imageSource, setImageSource] = useState<"camera" | "upload">("camera");
  const [uploadedBase64, setUploadedBase64] = useState<string | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [isDragOver, setIsDragOver] = useState(false);

  const checkControlStatus = async () => {
    try {
      const res = await fetch(`${backendURL()}/control/status`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setFrontendEnabled(data.frontend);
      }
    } catch (e) {
      console.error("Failed to fetch control status:", e);
    } finally {
      setCheckingStatus(false);
    }
  };

  useEffect(() => {
    checkControlStatus();
    const interval = setInterval(checkControlStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let activeStream: MediaStream | null = null;

    async function startCamera() {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: 1280, height: 720 },
        });
        activeStream = s;
        setStream(s);
        if (videoRef.current) {
          videoRef.current.srcObject = s;
        }
      } catch (err) {
        console.error("Error accessing camera:", err);
        setMessage({
          text: "Could not access camera. You can upload a photo instead.",
          type: "info",
        });
      }
    }

    if (imageSource === "camera") {
      startCamera();
    } else {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        setStream(null);
      }
    }

    return () => {
      if (activeStream) {
        activeStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [imageSource]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setMessage({ text: "Please select a valid image file (JPEG/PNG).", type: "error" });
      return;
    }

    setFileName(file.name);
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      setFilePreview(result);
      const base64 = result.split(",")[1];
      setUploadedBase64(base64);
      setMessage(null);
    };
    reader.readAsDataURL(file);
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
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setMessage({ text: "Please select a valid image file (JPEG/PNG).", type: "error" });
      return;
    }

    setFileName(file.name);
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      setFilePreview(result);
      const base64 = result.split(",")[1];
      setUploadedBase64(base64);
      setMessage(null);
    };
    reader.readAsDataURL(file);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setMessage({ text: "Please enter a name.", type: "error" });
      return;
    }

    let base64Image = "";

    if (imageSource === "camera") {
      if (!videoRef.current || !canvasRef.current) {
        setMessage({ text: "Camera is not ready yet.", type: "error" });
        return;
      }
      const canvas = canvasRef.current;
      const video = videoRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext("2d");
      if (context) {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = canvas.toDataURL("image/jpeg", 0.9);
        base64Image = imageData.split(",")[1];
      } else {
        setMessage({ text: "Could not initialize canvas context.", type: "error" });
        return;
      }
    } else {
      if (!uploadedBase64) {
        setMessage({ text: "Please select or drag an image first.", type: "error" });
        return;
      }
      base64Image = uploadedBase64;
    }

    setIsCapturing(true);
    setMessage({ text: "Registering employee...", type: "info" });

    try {
      const response = await fetch(`${backendURL()}/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: name.trim(),
          image: base64Image,
          position: position.trim(),
          compensation: compensation.trim(),
          age: age ? parseInt(age, 10) : 0,
          address: address.trim(),
          pan_card: panCard.trim(),
          aadhaar_card: aadhaarCard.trim(),
          email: email.trim(),
          phone: phone.trim(),
          date_of_joining: dateOfJoining.trim(),
          emergency_contact: emergencyContact.trim(),
        }),
      });

      if (response.ok) {
        setMessage({
          text: `Successfully registered ${name}!`,
          type: "success",
        });
        setName("");
        setPosition("");
        setCompensation("");
        setAge("");
        setAddress("");
        setPanCard("");
        setAadhaarCard("");
        setEmail("");
        setPhone("");
        setDateOfJoining("");
        setEmergencyContact("");
        setUploadedBase64(null);
        setFilePreview(null);
        setFileName("");
      } else {
        const data = await response.json();
        setMessage({
          text: `Failed to register: ${data.error || response.statusText}`,
          type: "error",
        });
      }
    } catch (err) {
      console.error("Registration error:", err);
      setMessage({
        text: "Failed to connect to backend server.",
        type: "error",
      });
    } finally {
      setIsCapturing(false);
    }
  };

  if (!checkingStatus && !frontendEnabled) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f8faf9] dark:bg-[#07100f] p-6 text-center w-full">
        <div className="max-w-md rounded-3xl border border-slate-200 dark:border-teal-200/10 bg-white dark:bg-white/5 p-8 backdrop-blur-md shadow-2xl dark:shadow-none">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-yellow-500/10 border border-yellow-500/20 text-yellow-400">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-8 h-8"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
              />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-emerald-50 mb-2">
            Frontend Interface Disabled
          </h2>
          <p className="text-sm text-slate-500 dark:text-emerald-100/60 mb-6">
            The frontend has been disabled by the administrator. Please use the
            System Controller to reactivate it.
          </p>
          <Link
            href="/system-control"
            className="inline-flex w-full justify-center rounded-xl bg-teal-600 dark:bg-teal-500 px-4 py-2.5 text-xs font-bold text-white dark:text-[#07100f] hover:bg-teal-700 dark:hover:bg-teal-400 transition-all active:scale-[0.98]"
          >
            Go to System Controller
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 lg:p-12">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-teal-600 dark:text-teal-300">
          Register Employee Profile
        </h1>
        <p className="mt-2 text-slate-500 dark:text-emerald-100/60">
          Capture face data and record comprehensive employee details.
        </p>
      </header>

      <form
        onSubmit={handleRegister}
        className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start"
      >
        {/* Left Column: Camera and Submit Controls (col-span-5) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Segmented Control Mode Switcher */}
          <div className="flex p-1 bg-slate-100 dark:bg-black/40 rounded-2xl border border-slate-200 dark:border-teal-200/10">
            <button
              type="button"
              onClick={() => setImageSource("camera")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-bold rounded-xl transition-all active:scale-[0.98] ${
                imageSource === "camera"
                  ? "bg-teal-500 text-[#07100f] shadow-lg shadow-teal-500/10"
                  : "text-slate-600 dark:text-teal-400/70 hover:text-slate-800 dark:hover:text-teal-300"
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
              </svg>
              Use Camera
            </button>
            <button
              type="button"
              onClick={() => setImageSource("upload")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-bold rounded-xl transition-all active:scale-[0.98] ${
                imageSource === "upload"
                  ? "bg-teal-500 text-[#07100f] shadow-lg shadow-teal-500/10"
                  : "text-slate-600 dark:text-teal-400/70 hover:text-slate-800 dark:hover:text-teal-300"
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 8.25H7.5a2.25 2.25 0 0 0-2.25 2.25v9a2.25 2.25 0 0 0 2.25 2.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25H15m0-3-3-3m0 0-3 3m3-3V15" />
              </svg>
              Upload File
            </button>
          </div>

          <div className="relative aspect-video overflow-hidden rounded-3xl border border-slate-200 dark:border-teal-200/10 bg-slate-100 dark:bg-black/40 shadow-2xl dark:shadow-none">
            {imageSource === "camera" ? (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="h-full w-full object-cover -scale-x-100"
                />
                <canvas ref={canvasRef} className="hidden" />

                {stream && (
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    {/* Outer frame overlay details */}
                    <div className="absolute inset-4 border border-teal-500/10 dark:border-teal-400/10 rounded-2xl"></div>

                    {/* Crosshairs in the corners */}
                    <div className="absolute top-6 left-6 w-3 h-3 border-t-2 border-l-2 border-teal-500/40 dark:border-teal-400/40"></div>
                    <div className="absolute top-6 right-6 w-3 h-3 border-t-2 border-r-2 border-teal-500/40 dark:border-teal-400/40"></div>
                    <div className="absolute bottom-6 left-6 w-3 h-3 border-b-2 border-l-2 border-teal-500/40 dark:border-teal-400/40"></div>
                    <div className="absolute bottom-6 right-6 w-3 h-3 border-b-2 border-r-2 border-teal-500/40 dark:border-teal-400/40"></div>

                    {/* Center Face Guide Oval */}
                    <div className="w-[140px] h-[180px] sm:w-[170px] sm:h-[210px] border-2 border-dashed border-teal-500/40 dark:border-teal-400/40 rounded-[50%] flex flex-col items-center justify-center relative bg-teal-500/[0.01] dark:bg-teal-400/[0.02]">
                      {/* Subtle interior guides */}
                      <div className="absolute top-[35%] w-[80%] border-t border-teal-500/20 dark:border-teal-400/20"></div>{" "}
                      {/* Eye line */}
                      <div className="absolute left-[50%] h-[70%] border-l border-teal-500/20 dark:border-teal-400/20"></div>{" "}
                      {/* Center line */}
                      {/* Glowing active ring */}
                      <div className="absolute inset-0 rounded-[50%] border border-teal-500/10 dark:border-teal-400/10 animate-pulse"></div>
                    </div>

                    {/* Subtitle helper */}
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white/90 dark:bg-[#07100f]/80 backdrop-blur-md px-3 py-1 rounded-full border border-teal-500/20 dark:border-teal-400/20 shadow-sm">
                      <span className="text-[9px] uppercase font-bold tracking-wider text-teal-600 dark:text-teal-400/95">
                        Align Face Here
                      </span>
                    </div>
                  </div>
                )}

                {!stream && !message && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-teal-500 dark:border-teal-400 border-t-transparent"></div>
                  </div>
                )}
              </>
            ) : (
              <div 
                className="h-full w-full relative flex items-center justify-center animate-fadeIn"
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                {filePreview ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={filePreview}
                      alt="Uploaded face profile"
                      className="h-full w-full object-cover"
                    />
                    
                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                      {/* Outer frame overlay details */}
                      <div className="absolute inset-4 border border-teal-500/10 dark:border-teal-400/10 rounded-2xl"></div>

                      {/* Crosshairs in the corners */}
                      <div className="absolute top-6 left-6 w-3 h-3 border-t-2 border-l-2 border-teal-500/40 dark:border-teal-400/40"></div>
                      <div className="absolute top-6 right-6 w-3 h-3 border-t-2 border-r-2 border-teal-500/40 dark:border-teal-400/40"></div>
                      <div className="absolute bottom-6 left-6 w-3 h-3 border-b-2 border-l-2 border-teal-500/40 dark:border-teal-400/40"></div>
                      <div className="absolute bottom-6 right-6 w-3 h-3 border-b-2 border-r-2 border-teal-500/40 dark:border-teal-400/40"></div>

                      {/* Center Face Guide Oval */}
                      <div className="w-[140px] h-[180px] sm:w-[170px] sm:h-[210px] border-2 border-dashed border-teal-500/40 dark:border-teal-400/40 rounded-[50%] flex flex-col items-center justify-center relative bg-teal-500/[0.01] dark:bg-teal-400/[0.02]">
                        <div className="absolute top-[35%] w-[80%] border-t border-teal-500/20 dark:border-teal-400/20"></div>
                        <div className="absolute left-[50%] h-[70%] border-l border-teal-500/20 dark:border-teal-400/20"></div>
                        <div className="absolute inset-0 rounded-[50%] border border-teal-500/10 dark:border-teal-400/10 animate-pulse"></div>
                      </div>

                      {/* Subtitle helper */}
                      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white/90 dark:bg-[#07100f]/80 backdrop-blur-md px-3 py-1 rounded-full border border-teal-500/20 dark:border-teal-400/20 shadow-sm">
                        <span className="text-[9px] uppercase font-bold tracking-wider text-teal-600 dark:text-teal-400/95">
                          Face Alignment Preview
                        </span>
                      </div>
                    </div>

                    {/* Delete button */}
                    <button
                      type="button"
                      onClick={() => {
                        setFilePreview(null);
                        setUploadedBase64(null);
                        setFileName("");
                      }}
                      className="absolute top-4 right-4 bg-red-500 hover:bg-red-600 text-white rounded-full p-2 shadow-lg transition-all hover:scale-105 active:scale-95 z-10"
                      title="Remove image"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                      </svg>
                    </button>
                    
                    {/* Filename indicator */}
                    <div className="absolute top-4 left-4 bg-slate-900/80 backdrop-blur-sm text-[10px] text-white px-2.5 py-1 rounded-md border border-white/10 max-w-[180px] truncate">
                      {fileName}
                    </div>
                  </>
                ) : (
                  <label className={`flex flex-col items-center justify-center w-full h-full cursor-pointer transition-all p-6 text-center border-2 border-dashed rounded-3xl ${
                    isDragOver 
                      ? "border-teal-500 bg-teal-500/10" 
                      : "border-slate-300 dark:border-teal-500/20 bg-slate-50 dark:bg-[#07100f]/20 hover:bg-slate-200/50 dark:hover:bg-black/60"
                  }`}>
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      <svg className="w-10 h-10 mb-3 text-teal-500 dark:text-teal-400 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
                      </svg>
                      <p className="mb-2 text-sm text-slate-700 dark:text-slate-200 font-semibold">
                        Click to upload or drag & drop
                      </p>
                      <p className="text-xs text-slate-500 dark:text-emerald-100/40">
                        PNG, JPG or JPEG (Recommended 1:1 or 4:3)
                      </p>
                    </div>
                    <input
                      type="file"
                      accept="image/jpeg, image/png, image/jpg"
                      className="hidden"
                      onChange={handleFileChange}
                    />
                  </label>
                )}
              </div>
            )}
          </div>

          {message && (
            <div
              className={`rounded-2xl p-4 text-xs font-medium border ${
                message.type === "success"
                  ? "bg-emerald-500/10 dark:bg-emerald-400/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 dark:border-emerald-400/20"
                  : message.type === "error"
                    ? "bg-red-500/10 dark:bg-red-400/10 text-red-600 dark:text-red-400 border-red-500/20 dark:border-red-400/20"
                    : "bg-teal-500/10 dark:bg-teal-400/10 text-teal-700 dark:text-teal-300 border-teal-500/20 dark:border-teal-400/20"
              }`}
            >
              {message.text}
            </div>
          )}

          <div className="rounded-3xl border border-slate-200 dark:border-teal-200/10 bg-white dark:bg-white/5 p-6 backdrop-blur-sm shadow-sm dark:shadow-none">
            <h3 className="text-xs font-bold uppercase tracking-wider text-teal-600 dark:text-teal-400/70 mb-3">
              Enrolment Guidance
            </h3>
            <ul className="space-y-2 text-xs text-slate-500 dark:text-emerald-100/50">
              <li className="flex items-start gap-2">
                <span className="text-teal-500 dark:text-teal-400 font-bold">
                  •
                </span>
                <span>
                  {imageSource === "camera" 
                    ? "Ensure the camera is centered and face is clearly visible."
                    : "Upload a clear headshot photo where face is fully visible."}
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-teal-500 dark:text-teal-400 font-bold">
                  •
                </span>
                <span>
                  Avoid obstructions such as hats, dark glasses, or masks.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-teal-500 dark:text-teal-400 font-bold">
                  •
                </span>
                <span>
                  Fill in all required fields accurately before enrolling.
                </span>
              </li>
            </ul>
          </div>

          <button
            type="submit"
            disabled={isCapturing || (imageSource === "camera" ? !stream : !uploadedBase64)}
            className="w-full rounded-xl bg-teal-500 px-6 py-3.5 text-xs font-bold text-[#07100f] transition-all hover:bg-teal-400 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(45,212,191,0.2)]"
          >
            {isCapturing
              ? "Registering..."
              : imageSource === "camera"
                ? "Capture & Enroll Employee"
                : "Upload & Enroll Employee"}
          </button>
        </div>

        {/* Right Column: Detailed Forms (col-span-7) */}
        <div className="lg:col-span-7 rounded-3xl border border-slate-200 dark:border-teal-200/10 bg-white dark:bg-white/5 p-6 md:p-8 backdrop-blur-sm space-y-6 shadow-sm dark:shadow-none">
          {/* Section 1: Identity & Credentials */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-teal-700 dark:text-teal-400/90 mb-4 pb-2 border-b border-slate-100 dark:border-teal-500/10">
              Personal Information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="name"
                  className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-teal-400/60 mb-1"
                >
                  Full Name *
                </label>
                <input
                  type="text"
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-teal-200/10 bg-slate-50 dark:bg-black/40 px-3 py-2 text-xs text-slate-800 dark:text-emerald-50 placeholder-slate-400 dark:placeholder-emerald-100/30 focus:border-teal-500 dark:focus:border-teal-400/50 focus:outline-none focus:ring-1 focus:ring-teal-500 dark:focus:ring-teal-400/50 transition-all"
                  required
                />
              </div>

              <div>
                <label
                  htmlFor="age"
                  className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-teal-400/60 mb-1"
                >
                  Age
                </label>
                <input
                  type="number"
                  id="age"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  min="18"
                  max="100"
                  className="w-full rounded-lg border border-slate-200 dark:border-teal-200/10 bg-slate-50 dark:bg-black/40 px-3 py-2 text-xs text-slate-800 dark:text-emerald-50 placeholder-slate-400 dark:placeholder-emerald-100/30 focus:border-teal-500 dark:focus:border-teal-400/50 focus:outline-none focus:ring-1 focus:ring-teal-500 dark:focus:ring-teal-400/50 transition-all"
                />
              </div>

              <div>
                <label
                  htmlFor="email"
                  className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-teal-400/60 mb-1"
                >
                  Email Address
                </label>
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-teal-200/10 bg-slate-50 dark:bg-black/40 px-3 py-2 text-xs text-slate-800 dark:text-emerald-50 placeholder-slate-400 dark:placeholder-emerald-100/30 focus:border-teal-500 dark:focus:border-teal-400/50 focus:outline-none focus:ring-1 focus:ring-teal-500 dark:focus:ring-teal-400/50 transition-all"
                />
              </div>

              <div>
                <label
                  htmlFor="phone"
                  className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-teal-400/60 mb-1"
                >
                  Phone Number
                </label>
                <input
                  type="tel"
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-teal-200/10 bg-slate-50 dark:bg-black/40 px-3 py-2 text-xs text-slate-800 dark:text-emerald-50 placeholder-slate-400 dark:placeholder-emerald-100/30 focus:border-teal-500 dark:focus:border-teal-400/50 focus:outline-none focus:ring-1 focus:ring-teal-500 dark:focus:ring-teal-400/50 transition-all"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Employment Profile */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-teal-700 dark:text-teal-400/90 mb-4 pb-2 border-b border-slate-100 dark:border-teal-500/10">
              Employment Details
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="position"
                  className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-teal-400/60 mb-1"
                >
                  Job Position
                </label>
                <input
                  type="text"
                  id="position"
                  value={position}
                  onChange={(e) => setPosition(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-teal-200/10 bg-slate-50 dark:bg-black/40 px-3 py-2 text-xs text-slate-800 dark:text-emerald-50 placeholder-slate-400 dark:placeholder-emerald-100/30 focus:border-teal-500 dark:focus:border-teal-400/50 focus:outline-none focus:ring-1 focus:ring-teal-500 dark:focus:ring-teal-400/50 transition-all"
                />
              </div>

              <div>
                <label
                  htmlFor="compensation"
                  className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-teal-400/60 mb-1"
                >
                  Compensation
                </label>
                <input
                  type="text"
                  id="compensation"
                  value={compensation}
                  onChange={(e) => setCompensation(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-teal-200/10 bg-slate-50 dark:bg-black/40 px-3 py-2 text-xs text-slate-800 dark:text-emerald-50 placeholder-slate-400 dark:placeholder-emerald-100/30 focus:border-teal-500 dark:focus:border-teal-400/50 focus:outline-none focus:ring-1 focus:ring-teal-500 dark:focus:ring-teal-400/50 transition-all"
                />
              </div>

              <div>
                <label
                  htmlFor="dateOfJoining"
                  className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-teal-400/60 mb-1"
                >
                  Date of Joining
                </label>
                <input
                  type="date"
                  id="dateOfJoining"
                  value={dateOfJoining}
                  onChange={(e) => setDateOfJoining(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-teal-200/10 bg-slate-50 dark:bg-black/40 px-3 py-2 text-xs text-slate-800 dark:text-emerald-50 placeholder-slate-400 dark:placeholder-emerald-100/30 focus:border-teal-500 dark:focus:border-teal-400/50 focus:outline-none focus:ring-1 focus:ring-teal-500 dark:focus:ring-teal-400/50 transition-all dark:[color-scheme:dark]"
                />
              </div>

              <div>
                <label
                  htmlFor="emergencyContact"
                  className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-teal-400/60 mb-1"
                >
                  Emergency Contact
                </label>
                <input
                  type="text"
                  id="emergencyContact"
                  value={emergencyContact}
                  onChange={(e) => setEmergencyContact(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-teal-200/10 bg-slate-50 dark:bg-black/40 px-3 py-2 text-xs text-slate-800 dark:text-emerald-50 placeholder-slate-400 dark:placeholder-emerald-100/30 focus:border-teal-500 dark:focus:border-teal-400/50 focus:outline-none focus:ring-1 focus:ring-teal-500 dark:focus:ring-teal-400/50 transition-all"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Legal & Address */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-teal-700 dark:text-teal-400/90 mb-4 pb-2 border-b border-slate-100 dark:border-teal-500/10">
              Identity & Address Verification
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="panCard"
                  className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-teal-400/60 mb-1"
                >
                  PAN Card Number
                </label>
                <input
                  type="text"
                  id="panCard"
                  value={panCard}
                  onChange={(e) => setPanCard(e.target.value)}
                  maxLength={10}
                  className="w-full rounded-lg border border-slate-200 dark:border-teal-200/10 bg-slate-50 dark:bg-black/40 px-3 py-2 text-xs text-slate-800 dark:text-emerald-50 placeholder-slate-400 dark:placeholder-emerald-100/30 focus:border-teal-500 dark:focus:border-teal-400/50 focus:outline-none focus:ring-1 focus:ring-teal-500 dark:focus:ring-teal-400/50 transition-all uppercase"
                />
              </div>

              <div>
                <label
                  htmlFor="aadhaarCard"
                  className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-teal-400/60 mb-1"
                >
                  Aadhaar Card Number
                </label>
                <input
                  type="text"
                  id="aadhaarCard"
                  value={aadhaarCard}
                  onChange={(e) => setAadhaarCard(e.target.value)}
                  maxLength={14}
                  className="w-full rounded-lg border border-slate-200 dark:border-teal-200/10 bg-slate-50 dark:bg-black/40 px-3 py-2 text-xs text-slate-800 dark:text-emerald-50 placeholder-slate-400 dark:placeholder-emerald-100/30 focus:border-teal-500 dark:focus:border-teal-400/50 focus:outline-none focus:ring-1 focus:ring-teal-500 dark:focus:ring-teal-400/50 transition-all"
                />
              </div>

              <div className="col-span-1 md:col-span-2">
                <label
                  htmlFor="address"
                  className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-teal-400/60 mb-1"
                >
                  Residential Address
                </label>
                <textarea
                  id="address"
                  rows={2}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-teal-200/10 bg-slate-50 dark:bg-black/40 px-3 py-2 text-xs text-slate-800 dark:text-emerald-50 placeholder-slate-400 dark:placeholder-emerald-100/30 focus:border-teal-500 dark:focus:border-teal-400/50 focus:outline-none focus:ring-1 focus:ring-teal-500 dark:focus:ring-teal-400/50 transition-all resize-none"
                />
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
