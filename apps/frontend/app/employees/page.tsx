"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";

type EmployeeRecord = {
  id: number;
  name: string;
  position: string | null;
  compensation: string | null;
  age: number | null;
  address: string | null;
  pan_card: string | null;
  aadhaar_card: string | null;
  email: string | null;
  phone: string | null;
  date_of_joining: string | null;
  emergency_contact: string | null;
  created_at: string;
};

const defaultBackendURL = "http://localhost:8080";

function backendURL() {
  return (
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    process.env.NEXT_PUBLIC_NEXT_PUBLIC_BACKEND_URL ||
    defaultBackendURL
  );
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeRecord | null>(null);
  const [imgError, setImgError] = useState<boolean>(false);
  const [imgCacheBust, setImgCacheBust] = useState<number>(Date.now());
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [frontendEnabled, setFrontendEnabled] = useState<boolean>(true);
  const [checkingStatus, setCheckingStatus] = useState<boolean>(true);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [deleteConfirmIds, setDeleteConfirmIds] = useState<number[] | null>(null);
  const [sortField, setSortField] = useState<"name" | "position" | "date_of_joining" | "id">("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  // Retake photo modal state
  const [retakeEmployee, setRetakeEmployee] = useState<EmployeeRecord | null>(null);
  const [retakeSource, setRetakeSource] = useState<"camera" | "upload">("camera");
  const [retakeStream, setRetakeStream] = useState<MediaStream | null>(null);
  const [retakeBase64, setRetakeBase64] = useState<string | null>(null);
  const [retakePreview, setRetakePreview] = useState<string | null>(null);
  const [retakeFileName, setRetakeFileName] = useState<string>("");
  const [retakeDragOver, setRetakeDragOver] = useState(false);
  const [retakeUploading, setRetakeUploading] = useState(false);
  const [retakeMessage, setRetakeMessage] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null);
  const retakeVideoRef = useRef<HTMLVideoElement>(null);
  const retakeCanvasRef = useRef<HTMLCanvasElement>(null);

  const handleSort = (field: "name" | "position" | "date_of_joining" | "id") => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  const renderSortIcon = (field: "name" | "position" | "date_of_joining" | "id") => {
    if (sortField !== field) {
      return <span className="ml-1 opacity-20 hover:opacity-100 transition-opacity">↕</span>;
    }
    return <span className="ml-1 text-teal-400 font-bold">{sortOrder === "asc" ? "▲" : "▼"}</span>;
  };

  // Manage retake camera stream lifecycle
  useEffect(() => {
    let active: MediaStream | null = null;
    if (retakeEmployee && retakeSource === "camera") {
      navigator.mediaDevices
        .getUserMedia({ video: { facingMode: "user", width: 1280, height: 720 } })
        .then((s) => {
          active = s;
          setRetakeStream(s);
          if (retakeVideoRef.current) retakeVideoRef.current.srcObject = s;
        })
        .catch(() => {
          setRetakeMessage({ text: "Camera unavailable. Please use Upload instead.", type: "info" });
          setRetakeSource("upload");
        });
    } else {
      if (retakeStream) {
        retakeStream.getTracks().forEach((t) => t.stop());
        setRetakeStream(null);
      }
    }
    return () => {
      if (active) active.getTracks().forEach((t) => t.stop());
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retakeEmployee, retakeSource]);

  const handleRetakeCapture = () => {
    const video = retakeVideoRef.current;
    const canvas = retakeCanvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const dataURL = canvas.toDataURL("image/jpeg", 0.92);
    setRetakePreview(dataURL);
    setRetakeBase64(dataURL.split(",")[1]);
    setRetakeMessage(null);
  };

  const processRetakeFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      setRetakeMessage({ text: "Please select a valid image file (JPEG/PNG).", type: "error" });
      return;
    }
    setRetakeFileName(file.name);
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      setRetakePreview(result);
      setRetakeBase64(result.split(",")[1]);
      setRetakeMessage(null);
    };
    reader.readAsDataURL(file);
  };

  const handleRetakeFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processRetakeFile(file);
  };

  const handleRetakeDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setRetakeDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processRetakeFile(file);
  };

  const openRetakeModal = (emp: EmployeeRecord) => {
    setRetakeEmployee(emp);
    setRetakeSource("camera");
    setRetakeBase64(null);
    setRetakePreview(null);
    setRetakeFileName("");
    setRetakeMessage(null);
    setRetakeUploading(false);
  };

  const closeRetakeModal = () => {
    if (retakeStream) retakeStream.getTracks().forEach((t) => t.stop());
    setRetakeStream(null);
    setRetakeEmployee(null);
    setRetakeBase64(null);
    setRetakePreview(null);
    setRetakeMessage(null);
  };

  const handleRetakeSubmit = async () => {
    if (!retakeEmployee || !retakeBase64) return;
    setRetakeUploading(true);
    try {
      const res = await fetch(`${backendURL()}/employees/photo`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: retakeEmployee.name, image: retakeBase64 }),
      });
      if (res.ok) {
        setRetakeMessage({ text: "Photo updated successfully!", type: "success" });
        setImgError(false);
        setImgCacheBust(Date.now());
        setTimeout(() => closeRetakeModal(), 1200);
      } else {
        const err = await res.json();
        setRetakeMessage({ text: err.error || "Upload failed. Please try again.", type: "error" });
      }
    } catch {
      setRetakeMessage({ text: "Network error. Is the backend running?", type: "error" });
    } finally {
      setRetakeUploading(false);
    }
  };

  const checkControlStatus = async () => {
    try {
      const res = await fetch(`${backendURL()}/control/status`, { cache: "no-store" });
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

  const fetchEmployees = async () => {
    try {
      const response = await fetch(`${backendURL()}/employees`, {
        cache: "no-store",
      });

      if (response.ok) {
        const data = await response.json();
        setEmployees(data as EmployeeRecord[]);
      }
    } catch (error) {
      console.error("Failed to fetch employees:", error);
    } finally {
      setLoading(false);
    }
  };

  const executeDelete = async (ids: number[]) => {
    try {
      const response = await fetch(`${backendURL()}/employees`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ids }),
      });
      if (response.ok) {
        setSelectedIds((prev) => prev.filter((id) => !ids.includes(id)));
        await fetchEmployees();
      } else {
        const errorData = await response.json();
        console.error("Failed to delete employees:", errorData.error || response.statusText);
      }
    } catch (e) {
      console.error("Failed to delete employees:", e);
    }
  };

  useEffect(() => {
    checkControlStatus();
    fetchEmployees();
    const interval = setInterval(checkControlStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const filteredEmployees = employees.filter((emp) => {
    const query = searchQuery.toLowerCase();
    const matchesName = emp.name.toLowerCase().includes(query);
    const matchesPosition = emp.position?.toLowerCase().includes(query) || false;
    const matchesEmail = emp.email?.toLowerCase().includes(query) || false;
    const matchesPhone = emp.phone?.toLowerCase().includes(query) || false;

    return matchesName || matchesPosition || matchesEmail || matchesPhone;
  });

  const sortedEmployees = [...filteredEmployees].sort((a, b) => {
    let valA: any;
    let valB: any;

    switch (sortField) {
      case "name":
        valA = a.name.toLowerCase();
        valB = b.name.toLowerCase();
        break;
      case "position":
        valA = (a.position || "").toLowerCase();
        valB = (b.position || "").toLowerCase();
        break;
      case "id":
        valA = a.id;
        valB = b.id;
        break;
      case "date_of_joining":
      default:
        valA = a.date_of_joining || "";
        valB = b.date_of_joining || "";
        break;
    }

    if (valA < valB) return sortOrder === "asc" ? -1 : 1;
    if (valA > valB) return sortOrder === "asc" ? 1 : -1;
    return 0;
  });

  const allSelected =
    filteredEmployees.length > 0 &&
    filteredEmployees.every((emp) => selectedIds.includes(emp.id));

  if (!checkingStatus && !frontendEnabled) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f8faf9] dark:bg-[#07100f] p-6 text-center w-full">
        <div className="max-w-md rounded-3xl border border-slate-200 dark:border-teal-200/10 bg-white dark:bg-white/5 p-8 backdrop-blur-md shadow-2xl dark:shadow-none">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-yellow-500/10 border border-yellow-500/20 text-yellow-400">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-emerald-50 mb-2">Frontend Interface Disabled</h2>
          <p className="text-sm text-slate-500 dark:text-emerald-100/60 mb-6">
            The frontend has been disabled by the administrator. Please use the System Controller to reactivate it.
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
    <div className="p-6 lg:p-8">
      <header className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Employees Directory</h1>
          <p className="text-xs text-slate-500 dark:text-emerald-100/60 mt-0.5">
            View, search, and manage registered employees and their face profiles.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {selectedIds.length > 0 && (
            <button
              onClick={() => setDeleteConfirmIds(selectedIds)}
              className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-500 dark:text-red-400 hover:bg-red-500/20 hover:border-red-500/50 transition-all active:scale-[0.98]"
            >
              Delete Selected ({selectedIds.length})
            </button>
          )}
          <div className="relative w-48 md:w-64">
            <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400 dark:text-emerald-100/30">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.603 10.602z" />
              </svg>
            </div>
            <input
              type="text"
              placeholder="Search name, position, email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="rounded-lg border border-slate-200 dark:border-teal-200/10 bg-white dark:bg-black/20 pl-8 pr-7 py-1.5 text-xs text-slate-800 dark:text-emerald-50 placeholder-slate-400 dark:placeholder-emerald-100/30 focus:border-teal-500 dark:focus:border-teal-400/50 focus:outline-none focus:ring-1 focus:ring-teal-500 dark:focus:ring-teal-400/50 transition-all w-full"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 dark:text-emerald-100/30 hover:text-slate-600 dark:hover:text-emerald-100/60"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3 h-3">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          <button
            onClick={fetchEmployees}
            className="rounded-lg border border-slate-200 dark:border-teal-200/10 bg-white dark:bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-emerald-50 hover:bg-slate-50 dark:hover:bg-white/10 transition-colors"
          >
            Refresh
          </button>
        </div>
      </header>

      {/* Summary Row */}
      <div className="flex gap-4 mb-6">
        <div className="rounded-xl border border-slate-200 dark:border-teal-200/10 bg-white dark:bg-white/5 px-4 py-2 flex items-center gap-2 shadow-sm dark:shadow-none">
          <span className="text-xs text-teal-600 dark:text-teal-400/80">Total Employees:</span>
          <span className="text-sm font-bold">{employees.length}</span>
        </div>
        {employees.length > 0 && (
          <div className="rounded-xl border border-slate-200 dark:border-teal-200/10 bg-white dark:bg-white/5 px-4 py-2 flex items-center gap-2 truncate max-w-xs md:max-w-md shadow-sm dark:shadow-none">
            <span className="text-xs text-teal-600 dark:text-teal-400/80">Newest Employee:</span>
            <span className="text-xs font-bold truncate">{employees[0].name}</span>
          </div>
        )}
      </div>

      <section className="rounded-2xl border border-slate-200 dark:border-teal-200/10 bg-white dark:bg-white/5 shadow-sm dark:shadow-none overflow-hidden">
        {loading && employees.length === 0 ? (
          <div className="p-12 text-center">
            <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-teal-600 dark:border-teal-400 border-t-transparent mb-2"></div>
            <p className="text-xs text-slate-500 dark:text-emerald-100/50">Loading employee list...</p>
          </div>
        ) : filteredEmployees.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-xs text-slate-500 dark:text-emerald-100/50">
              No employees found in the directory.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse font-mono text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-teal-200/10 bg-slate-50 dark:bg-black/40 text-[10px] uppercase tracking-wider text-slate-500 dark:text-teal-400/70">
                  <th className="px-3 py-2.5 w-8">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedIds(filteredEmployees.map((emp) => emp.id));
                        } else {
                          setSelectedIds([]);
                        }
                      }}
                      className="rounded border-slate-300 dark:border-teal-200/20 bg-white dark:bg-black/40 text-teal-650 focus:ring-0 focus:ring-offset-0 focus:outline-none cursor-pointer w-3.5 h-3.5 accent-teal-600 dark:accent-teal-500"
                    />
                  </th>
                  <th
                    onClick={() => handleSort("id")}
                    className="px-3 py-2.5 font-semibold cursor-pointer select-none hover:text-teal-650 dark:hover:text-teal-300 transition-colors w-16"
                  >
                    ID {renderSortIcon("id")}
                  </th>
                  <th className="px-3 py-2.5 font-semibold w-12">Photo</th>
                  <th
                    onClick={() => handleSort("name")}
                    className="px-3 py-2.5 font-semibold cursor-pointer select-none hover:text-teal-650 dark:hover:text-teal-300 transition-colors"
                  >
                    Employee Name {renderSortIcon("name")}
                  </th>
                  <th
                    onClick={() => handleSort("position")}
                    className="px-3 py-2.5 font-semibold cursor-pointer select-none hover:text-teal-650 dark:hover:text-teal-300 transition-colors"
                  >
                    Position {renderSortIcon("position")}
                  </th>
                  <th className="px-3 py-2.5 font-semibold">Phone</th>
                  <th className="px-3 py-2.5 font-semibold">Email</th>
                  <th
                    onClick={() => handleSort("date_of_joining")}
                    className="px-3 py-2.5 font-semibold cursor-pointer select-none hover:text-teal-650 dark:hover:text-teal-300 transition-colors"
                  >
                    Joining Date {renderSortIcon("date_of_joining")}
                  </th>
                  <th className="px-3 py-2.5 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-teal-200/5">
                {sortedEmployees.map((emp) => {
                  const isChecked = selectedIds.includes(emp.id);
                  return (
                    <tr
                      key={emp.id}
                      className={`${isChecked ? "bg-teal-500/[0.04] dark:bg-teal-500/5 hover:bg-teal-500/[0.08] dark:hover:bg-teal-500/10" : "hover:bg-slate-50 dark:hover:bg-white/5"} transition-colors border-b border-slate-100 dark:border-teal-200/5`}
                    >
                      <td className="px-3 py-2.5 w-8">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedIds([...selectedIds, emp.id]);
                            } else {
                              setSelectedIds(selectedIds.filter((id) => id !== emp.id));
                            }
                          }}
                          className="rounded border-slate-300 dark:border-teal-200/20 bg-white dark:bg-black/40 text-teal-600 focus:ring-0 focus:ring-offset-0 focus:outline-none cursor-pointer w-3.5 h-3.5 accent-teal-650 dark:accent-teal-50"
                        />
                      </td>
                      <td className="px-3 py-2.5 text-slate-400 dark:text-emerald-100/30">
                        {emp.id}
                      </td>
                      <td className="px-3 py-2.5">
                        <button
                          onClick={() => {
                            setImgError(false);
                            setSelectedEmployee(emp);
                          }}
                          className="h-7 w-7 rounded-full overflow-hidden border border-slate-200 dark:border-teal-200/20 bg-slate-100 dark:bg-black/40 flex items-center justify-center hover:scale-105 transition-transform"
                          title="View profile photo"
                        >
                          <img
                            src={`${backendURL()}/recogniser/known_faces/${encodeURIComponent(emp.name)}`}
                            alt={emp.name}
                            className="h-full w-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%2364748b'%3E%3Cpath d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'/%3E%3C/svg%3E";
                            }}
                          />
                        </button>
                      </td>
                      <td className="px-3 py-2.5">
                        <button
                          onClick={() => {
                            setImgError(false);
                            setSelectedEmployee(emp);
                          }}
                          className="font-bold text-teal-600 dark:text-teal-400 hover:text-teal-755 dark:hover:text-teal-300 hover:underline text-left"
                        >
                          {emp.name}
                        </button>
                      </td>
                      <td className="px-3 py-2.5 text-slate-705 dark:text-emerald-150 font-sans">
                        {emp.position || "—"}
                      </td>
                      <td className="px-3 py-2.5 text-slate-600 dark:text-emerald-100/70">
                        {emp.phone || "—"}
                      </td>
                      <td className="px-3 py-2.5 text-slate-600 dark:text-emerald-100/70 lowercase font-sans">
                        {emp.email || "—"}
                      </td>
                      <td className="px-3 py-2.5 text-slate-600 dark:text-emerald-100/70">
                        {emp.date_of_joining || "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <button
                          onClick={() => setDeleteConfirmIds([emp.id])}
                          className="rounded p-1 text-slate-400 hover:text-red-650 hover:bg-red-50 dark:text-emerald-100/40 dark:hover:text-red-400 dark:hover:bg-red-500/10 transition-colors"
                          title="Delete employee"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5 inline">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Detailed Employee Modal Overlay */}
      {selectedEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-fade-in" onClick={() => setSelectedEmployee(null)}>
          <div
            className="w-full max-w-2xl rounded-3xl border border-slate-200 dark:border-teal-200/20 bg-white dark:bg-[#0c1b18] p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-teal-200/10 pb-3 mb-4">
              <h3 className="font-bold text-slate-800 dark:text-emerald-50 text-sm">
                Employee Profile Details
              </h3>
              <button
                onClick={() => setSelectedEmployee(null)}
                className="text-xs text-teal-650 hover:text-teal-800 dark:text-teal-400 dark:hover:text-teal-300 transition-colors font-bold"
              >
                Close
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Profile Image Column */}
              <div className="flex flex-col items-center gap-3">
                <div className="relative aspect-square w-full max-w-[180px] overflow-hidden rounded-2xl border border-slate-200 dark:border-teal-200/10 bg-slate-50 dark:bg-black/40 flex items-center justify-center">
                  {!imgError ? (
                    <img
                      src={`${backendURL()}/recogniser/known_faces/${encodeURIComponent(selectedEmployee.name)}?t=${imgCacheBust}`}
                      alt={selectedEmployee.name}
                      className="h-full w-full object-cover"
                      onError={() => setImgError(true)}
                    />
                  ) : (
                    <div className="text-center p-4">
                      <span className="text-red-505 font-bold text-sm block mb-1">!</span>
                      <p className="text-[10px] text-slate-500 dark:text-emerald-100/50">
                        No image found.
                      </p>
                    </div>
                  )}
                </div>
                <p className="text-[10px] text-slate-400 dark:text-emerald-100/40 text-center font-mono">
                  ID: {selectedEmployee.id}
                </p>
                <div className="w-full text-center">
                  <span className="inline-flex items-center rounded-full bg-teal-50 dark:bg-teal-400/10 px-3 py-1 text-xs font-semibold text-teal-700 dark:text-teal-400 border border-teal-200 dark:border-teal-400/20">
                    Active Employee
                  </span>
                </div>
              </div>

              {/* Data Columns */}
              <div className="md:col-span-2 space-y-4 text-xs font-sans">
                {/* Personal Information */}
                <div>
                  <h4 className="font-bold text-teal-650 dark:text-teal-400 uppercase tracking-wider text-[10px] mb-2 border-b border-slate-100 dark:border-teal-200/5 pb-1 font-mono">
                    Personal Information
                  </h4>
                  <div className="grid grid-cols-2 gap-y-2 gap-x-4">
                    <div>
                      <span className="text-[10px] text-slate-400 dark:text-emerald-100/40 block">Full Name</span>
                      <span className="font-semibold text-slate-800 dark:text-emerald-50">{selectedEmployee.name}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 dark:text-emerald-100/40 block">Age</span>
                      <span className="font-semibold text-slate-800 dark:text-emerald-50">{selectedEmployee.age || "—"}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 dark:text-emerald-100/40 block">Email Address</span>
                      <span className="font-semibold text-slate-800 dark:text-emerald-50 lowercase break-all">{selectedEmployee.email || "—"}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 dark:text-emerald-100/40 block">Phone Number</span>
                      <span className="font-semibold text-slate-800 dark:text-emerald-50">{selectedEmployee.phone || "—"}</span>
                    </div>
                  </div>
                  <div className="mt-2">
                    <span className="text-[10px] text-slate-400 dark:text-emerald-100/40 block">Residential Address</span>
                    <span className="font-semibold text-slate-800 dark:text-emerald-55">{selectedEmployee.address || "—"}</span>
                  </div>
                </div>

                {/* Employment Details */}
                <div>
                  <h4 className="font-bold text-teal-650 dark:text-teal-400 uppercase tracking-wider text-[10px] mb-2 border-b border-slate-100 dark:border-teal-200/5 pb-1 font-mono">
                    Employment Details
                  </h4>
                  <div className="grid grid-cols-2 gap-y-2 gap-x-4">
                    <div>
                      <span className="text-[10px] text-slate-400 dark:text-emerald-100/40 block">Position</span>
                      <span className="font-semibold text-slate-800 dark:text-emerald-50">{selectedEmployee.position || "—"}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 dark:text-emerald-100/40 block">Salary / Compensation</span>
                      <span className="font-semibold text-slate-800 dark:text-emerald-50">{selectedEmployee.compensation || "—"}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 dark:text-emerald-100/40 block">Date of Joining</span>
                      <span className="font-semibold text-slate-800 dark:text-emerald-50">{selectedEmployee.date_of_joining || "—"}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 dark:text-emerald-100/40 block">Emergency Contact</span>
                      <span className="font-semibold text-slate-800 dark:text-emerald-50">{selectedEmployee.emergency_contact || "—"}</span>
                    </div>
                  </div>
                </div>

                {/* Verification Documents */}
                <div>
                  <h4 className="font-bold text-teal-650 dark:text-teal-400 uppercase tracking-wider text-[10px] mb-2 border-b border-slate-100 dark:border-teal-200/5 pb-1 font-mono">
                    Identity Verification
                  </h4>
                  <div className="grid grid-cols-2 gap-y-2 gap-x-4">
                    <div>
                      <span className="text-[10px] text-slate-400 dark:text-emerald-100/40 block font-mono">PAN Card Number</span>
                      <span className="font-semibold text-slate-800 dark:text-emerald-50 uppercase font-mono">{selectedEmployee.pan_card || "—"}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 dark:text-emerald-100/40 block font-mono">Aadhaar Card Number</span>
                      <span className="font-semibold text-slate-800 dark:text-emerald-50 font-mono">{selectedEmployee.aadhaar_card || "—"}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3 border-t border-slate-100 dark:border-teal-200/10 pt-4">
              <button
                onClick={() => setDeleteConfirmIds([selectedEmployee.id])}
                className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2 text-xs font-semibold text-red-500 dark:text-red-400 hover:bg-red-500/20 transition-all active:scale-[0.98]"
              >
                Delete Profile
              </button>
              <button
                onClick={() => openRetakeModal(selectedEmployee)}
                className="rounded-xl border border-teal-500/20 bg-teal-500/10 px-4 py-2 text-xs font-semibold text-teal-600 dark:text-teal-400 hover:bg-teal-500/20 transition-all active:scale-[0.98]"
              >
                📷 Retake Photo
              </button>
              <button
                onClick={() => setSelectedEmployee(null)}
                className="rounded-xl bg-teal-650 dark:bg-teal-500 px-6 py-2 text-xs font-bold text-white dark:text-[#07100f] hover:bg-teal-700 dark:hover:bg-teal-400 transition-all active:scale-[0.98]"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmIds && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-fade-in" onClick={() => setDeleteConfirmIds(null)}>
          <div
            className="w-full max-w-sm rounded-3xl border border-red-200 dark:border-red-500/20 bg-white dark:bg-[#160d0d] p-6 shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-red-100 dark:border-red-500/10 pb-3 mb-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-500/10 border border-red-500/20 text-red-550">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              </div>
              <h3 className="font-bold text-slate-805 dark:text-red-100 text-sm">
                Confirm Deletion
              </h3>
            </div>

            <p className="text-xs text-slate-600 dark:text-red-200/70 mb-6 leading-relaxed">
              Are you sure you want to delete {deleteConfirmIds.length} employee{deleteConfirmIds.length > 1 ? "s" : ""}? Deletion removes database entries and all registered face library folders. This action is irreversible.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirmIds(null)}
                className="flex-1 rounded-xl border border-slate-200 dark:border-teal-200/10 bg-white dark:bg-white/5 px-4 py-2 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-white/10 transition-colors text-slate-705 dark:text-emerald-100/70"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  executeDelete(deleteConfirmIds);
                  setDeleteConfirmIds(null);
                  setSelectedEmployee(null);
                }}
                className="flex-1 rounded-xl bg-red-650 dark:bg-red-500 px-4 py-2 text-xs font-bold text-white hover:bg-red-700 dark:hover:bg-red-400 transition-all active:scale-[0.98]"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Retake Photo Modal ──────────────────────────────────────── */}
      {retakeEmployee && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={closeRetakeModal}
        >
          <div
            className="w-full max-w-lg rounded-3xl border border-slate-200 dark:border-teal-200/20 bg-white dark:bg-[#0c1b18] p-6 shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-teal-200/10 pb-3 mb-4">
              <div>
                <h3 className="font-bold text-slate-800 dark:text-emerald-50 text-sm">Retake Profile Photo</h3>
                <p className="text-[10px] text-slate-400 dark:text-emerald-100/40 mt-0.5">{retakeEmployee.name}</p>
              </div>
              <button onClick={closeRetakeModal} className="text-xs text-teal-600 hover:text-teal-800 dark:text-teal-400 dark:hover:text-teal-300 font-bold">
                Close
              </button>
            </div>

            {/* Source tabs */}
            <div className="flex rounded-xl bg-slate-100 dark:bg-black/30 p-1 mb-4 gap-1">
              {(["camera", "upload"] as const).map((src) => (
                <button
                  key={src}
                  onClick={() => { setRetakeSource(src); setRetakeBase64(null); setRetakePreview(null); setRetakeMessage(null); }}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    retakeSource === src
                      ? "bg-teal-500 dark:bg-teal-400 text-white dark:text-[#07100f] shadow"
                      : "text-slate-500 dark:text-emerald-100/50 hover:text-slate-700 dark:hover:text-emerald-100/70"
                  }`}
                >
                  {src === "camera" ? "📷 Use Camera" : "📁 Upload File"}
                </button>
              ))}
            </div>

            {/* Viewport */}
            <div className="relative w-full aspect-[4/3] rounded-2xl overflow-hidden border border-slate-200 dark:border-teal-200/10 bg-slate-50 dark:bg-black/40 mb-4">
              {retakeSource === "camera" ? (
                <>
                  {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                  <video
                    ref={retakeVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="h-full w-full object-cover"
                  />
                  {/* Face oval overlay */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-[140px] h-[180px] border-2 border-dashed border-teal-400/60 rounded-[50%] relative">
                      <div className="absolute inset-0 rounded-[50%] border border-teal-400/20 animate-pulse" />
                    </div>
                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-sm px-3 py-1 rounded-full">
                      <span className="text-[9px] uppercase tracking-wider text-teal-400 font-bold">Align Face Here</span>
                    </div>
                  </div>
                  {/* Show preview overlay when captured */}
                  {retakePreview && (
                    <div className="absolute inset-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={retakePreview} alt="Captured" className="h-full w-full object-cover" />
                      <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                        <span className="text-white text-xs font-bold bg-teal-500/80 px-3 py-1 rounded-full">✓ Captured</span>
                      </div>
                    </div>
                  )}
                  <canvas ref={retakeCanvasRef} className="hidden" />
                </>
              ) : (
                <div
                  className="h-full w-full relative flex items-center justify-center"
                  onDragOver={(e) => { e.preventDefault(); setRetakeDragOver(true); }}
                  onDragLeave={() => setRetakeDragOver(false)}
                  onDrop={handleRetakeDrop}
                >
                  {retakePreview ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={retakePreview} alt="Upload preview" className="h-full w-full object-cover" />
                      {/* Face oval overlay on uploaded image */}
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="w-[140px] h-[180px] border-2 border-dashed border-teal-400/50 rounded-[50%]" />
                      </div>
                      <button
                        onClick={() => { setRetakePreview(null); setRetakeBase64(null); setRetakeFileName(""); }}
                        className="absolute top-3 right-3 bg-red-500 hover:bg-red-600 text-white rounded-full p-1.5 shadow transition-all z-10"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                      </button>
                      {retakeFileName && (
                        <div className="absolute top-3 left-3 bg-black/70 text-white text-[10px] px-2 py-1 rounded max-w-[180px] truncate">{retakeFileName}</div>
                      )}
                    </>
                  ) : (
                    <label className={`flex flex-col items-center justify-center w-full h-full cursor-pointer rounded-2xl border-2 border-dashed transition-all ${
                      retakeDragOver ? "border-teal-500 bg-teal-500/10" : "border-slate-300 dark:border-teal-500/20 hover:bg-slate-50 dark:hover:bg-black/60"
                    }`}>
                      <svg className="w-8 h-8 mb-2 text-teal-500 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Click to upload or drag &amp; drop</p>
                      <p className="text-[10px] text-slate-400 dark:text-emerald-100/40 mt-0.5">PNG, JPG or JPEG</p>
                      <input type="file" accept="image/jpeg,image/png,image/jpg" className="hidden" onChange={handleRetakeFileChange} />
                    </label>
                  )}
                </div>
              )}
            </div>

            {/* Status message */}
            {retakeMessage && (
              <div className={`mb-3 rounded-xl px-3 py-2 text-xs font-medium ${
                retakeMessage.type === "success" ? "bg-emerald-50 dark:bg-emerald-400/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-400/20"
                : retakeMessage.type === "error" ? "bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-500/20"
                : "bg-blue-50 dark:bg-blue-400/10 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-400/20"
              }`}>
                {retakeMessage.text}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-3">
              {retakeSource === "camera" && !retakePreview && (
                <button
                  onClick={handleRetakeCapture}
                  disabled={!retakeStream}
                  className="flex-1 rounded-xl bg-teal-600 dark:bg-teal-500 px-4 py-2.5 text-xs font-bold text-white dark:text-[#07100f] hover:bg-teal-700 dark:hover:bg-teal-400 transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  📸 Capture Photo
                </button>
              )}
              {retakeSource === "camera" && retakePreview && (
                <button
                  onClick={() => { setRetakePreview(null); setRetakeBase64(null); }}
                  className="flex-1 rounded-xl border border-slate-200 dark:border-teal-200/10 bg-white dark:bg-white/5 px-4 py-2.5 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-white/10 transition-colors text-slate-700 dark:text-emerald-100/70"
                >
                  Retake
                </button>
              )}
              {retakeBase64 && (
                <button
                  onClick={handleRetakeSubmit}
                  disabled={retakeUploading}
                  className="flex-1 rounded-xl bg-teal-600 dark:bg-teal-500 px-4 py-2.5 text-xs font-bold text-white dark:text-[#07100f] hover:bg-teal-700 dark:hover:bg-teal-400 transition-all active:scale-[0.98] disabled:opacity-50"
                >
                  {retakeUploading ? "Uploading..." : "✓ Confirm & Save"}
                </button>
              )}
              <button
                onClick={closeRetakeModal}
                className="rounded-xl border border-slate-200 dark:border-teal-200/10 bg-white dark:bg-white/5 px-4 py-2.5 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-white/10 transition-colors text-slate-700 dark:text-emerald-100/70"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
