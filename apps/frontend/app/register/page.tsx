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
          text: "Could not access camera. Please ensure you have given permission.",
          type: "error",
        });
      }
    }

    startCamera();

    return () => {
      if (activeStream) {
        activeStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setMessage({ text: "Please enter a name.", type: "error" });
      return;
    }

    if (!videoRef.current || !canvasRef.current) return;

    setIsCapturing(true);
    setMessage({ text: "Capturing and registering...", type: "info" });

    const canvas = canvasRef.current;
    const video = videoRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (context) {
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = canvas.toDataURL("image/jpeg", 0.9);

      // Remove the prefix "data:image/jpeg;base64,"
      const base64Image = imageData.split(",")[1];

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
          <div className="relative aspect-video overflow-hidden rounded-3xl border border-slate-200 dark:border-teal-200/10 bg-slate-100 dark:bg-black/40 shadow-2xl dark:shadow-none">
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
                  Ensure the camera is centered and face is clearly visible.
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
                  Fill in all required fields accurately before capturing.
                </span>
              </li>
            </ul>
          </div>

          <button
            type="submit"
            disabled={isCapturing || !stream}
            className="w-full rounded-xl bg-teal-500 px-6 py-3.5 text-xs font-bold text-[#07100f] transition-all hover:bg-teal-400 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(45,212,191,0.2)]"
          >
            {isCapturing
              ? "Registering & Uploading..."
              : "Capture & Enroll Employee"}
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
