"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";

type AttendanceRecord = {
  id: number;
  name: string;
  status: string;
  recognized_at: string;
  snapshot_path: string | null;
};

const defaultBackendURL = "http://localhost:8080";

function backendURL() {
  return (
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    process.env.NEXT_PUBLIC_NEXT_PUBLIC_BACKEND_URL ||
    defaultBackendURL
  );
}

function attendeeSnapshotURL(snapshotPath: string) {
  const normalizedPath = snapshotPath
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return `${backendURL()}/attendees/${normalizedPath}`;
}

export default function Home() {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedRecord, setSelectedRecord] = useState<AttendanceRecord | null>(null);
  const [imgError, setImgError] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [frontendEnabled, setFrontendEnabled] = useState<boolean>(true);
  const [checkingStatus, setCheckingStatus] = useState<boolean>(true);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [deleteConfirmIds, setDeleteConfirmIds] = useState<number[] | null>(null);
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [sortField, setSortField] = useState<"name" | "status" | "recognized_at" | "id">("recognized_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const handleSort = (field: "name" | "status" | "recognized_at" | "id") => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  const renderSortIcon = (field: "name" | "status" | "recognized_at" | "id") => {
    if (sortField !== field) {
      return <span className="ml-1 opacity-20 hover:opacity-100 transition-opacity">↕</span>;
    }
    return <span className="ml-1 text-teal-400 font-bold">{sortOrder === "asc" ? "▲" : "▼"}</span>;
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

  useEffect(() => {
    checkControlStatus();
    const interval = setInterval(checkControlStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchRecords = async () => {
    try {
      const response = await fetch(`${backendURL()}/attendance?limit=100`, {
        cache: "no-store",
      });

      if (response.ok) {
        const data = await response.json();
        setRecords(data as AttendanceRecord[]);
      }
    } catch (error) {
      console.error("Failed to fetch attendance records:", error);
    } finally {
      setLoading(false);
    }
  };

  const executeDelete = async (ids: number[]) => {
    try {
      const response = await fetch(`${backendURL()}/attendance`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ids }),
      });
      if (response.ok) {
        setSelectedIds((prev) => prev.filter((id) => !ids.includes(id)));
        await fetchRecords();
      } else {
        const errorData = await response.json();
        console.error("Failed to delete records:", errorData.error || response.statusText);
      }
    } catch (e) {
      console.error("Failed to delete records:", e);
    }
  };

  useEffect(() => {
    fetchRecords();
    const interval = setInterval(fetchRecords, 3000);
    return () => clearInterval(interval);
  }, []);

  function formatTimestamp(value: string) {
    try {
      const date = new Date(value);
      return {
        date: new Intl.DateTimeFormat("en-IN", {
          dateStyle: "medium",
          timeZone: "Asia/Kolkata",
        }).format(date),
        time: new Intl.DateTimeFormat("en-IN", {
          timeStyle: "medium",
          timeZone: "Asia/Kolkata",
        }).format(date),
        raw: value,
      };
    } catch (e) {
      return { date: value, time: "", raw: value };
    }
  }

  const filteredRecords = records.filter((r) => {
    const matchesName = r.name.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesName) return false;

    if (startDate || endDate) {
      const recordTime = new Date(r.recognized_at).getTime();
      if (startDate) {
        const startLimit = new Date(`${startDate}T00:00:00`).getTime();
        if (recordTime < startLimit) return false;
      }
      if (endDate) {
        const endLimit = new Date(`${endDate}T23:59:59`).getTime();
        if (recordTime > endLimit) return false;
      }
    }
    return true;
  });

  const sortedRecords = [...filteredRecords].sort((a, b) => {
    let valA: any;
    let valB: any;

    switch (sortField) {
      case "name":
        valA = a.name.toLowerCase();
        valB = b.name.toLowerCase();
        break;
      case "status":
        valA = a.status.toLowerCase();
        valB = b.status.toLowerCase();
        break;
      case "id":
        valA = a.id;
        valB = b.id;
        break;
      case "recognized_at":
      default:
        valA = new Date(a.recognized_at).getTime();
        valB = new Date(b.recognized_at).getTime();
        break;
    }

    if (valA < valB) return sortOrder === "asc" ? -1 : 1;
    if (valA > valB) return sortOrder === "asc" ? 1 : -1;
    return 0;
  });

  const allSelected =
    filteredRecords.length > 0 &&
    filteredRecords.every((r) => selectedIds.includes(r.id));

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
          <h1 className="text-2xl font-bold tracking-tight">System Logs</h1>
          <p className="text-xs text-slate-500 dark:text-emerald-100/60 mt-0.5">
            Classic high-density log view of presence markings.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {selectedIds.length > 0 && (
            <button
              onClick={() => setDeleteConfirmIds(selectedIds)}
              className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-550 hover:bg-red-500/20 hover:border-red-500/50 transition-all active:scale-[0.98]"
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
              placeholder="Search name..."
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
            onClick={fetchRecords}
            className="rounded-lg border border-slate-200 dark:border-teal-200/10 bg-white dark:bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-emerald-50 hover:bg-slate-50 dark:hover:bg-white/10 transition-colors"
          >
            Refresh
          </button>
        </div>
      </header>

      {/* Date Range Filter Bar */}
      <div className="flex flex-wrap items-center gap-4 mb-6 p-4 rounded-2xl border border-slate-200 dark:border-teal-200/10 bg-white dark:bg-white/5 shadow-sm dark:shadow-none text-xs">
        <div className="flex items-center gap-2">
          <span className="text-slate-500 dark:text-emerald-100/50 font-semibold">Start Date:</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded-lg border border-slate-200 dark:border-teal-200/10 bg-white dark:bg-black/40 px-2 py-1 text-xs text-slate-800 dark:text-emerald-50 focus:border-teal-500 dark:focus:border-teal-400/50 focus:outline-none focus:ring-1 focus:ring-teal-500 dark:focus:ring-teal-400/50 transition-all dark:[color-scheme:dark]"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-slate-500 dark:text-emerald-100/50 font-semibold">End Date:</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded-lg border border-slate-200 dark:border-teal-200/10 bg-white dark:bg-black/40 px-2 py-1 text-xs text-slate-800 dark:text-emerald-50 focus:border-teal-500 dark:focus:border-teal-400/50 focus:outline-none focus:ring-1 focus:ring-teal-500 dark:focus:ring-teal-400/50 transition-all dark:[color-scheme:dark]"
          />
        </div>
        {(startDate || endDate) && (
          <button
            onClick={() => {
              setStartDate("");
              setEndDate("");
            }}
            className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-500 dark:text-red-400 hover:bg-red-500/20 transition-all active:scale-[0.98]"
          >
            Clear Dates
          </button>
        )}
      </div>

      {/* Summary Row */}
      <div className="flex gap-4 mb-6">
        <div className="rounded-xl border border-slate-200 dark:border-teal-200/10 bg-white dark:bg-white/5 px-4 py-2 flex items-center gap-2 shadow-sm dark:shadow-none">
          <span className="text-xs text-teal-600 dark:text-teal-400/80">Total Loaded:</span>
          <span className="text-sm font-bold">{records.length}</span>
        </div>
        {records.length > 0 && (
          <div className="rounded-xl border border-slate-200 dark:border-teal-200/10 bg-white dark:bg-white/5 px-4 py-2 flex items-center gap-2 truncate max-w-xs md:max-w-md shadow-sm dark:shadow-none">
            <span className="text-xs text-teal-600 dark:text-teal-400/80">Last Active:</span>
            <span className="text-xs font-bold truncate">{records[0].name}</span>
          </div>
        )}
      </div>

      <section className="rounded-2xl border border-slate-200 dark:border-teal-200/10 bg-white dark:bg-white/5 shadow-sm dark:shadow-none overflow-hidden">
        {loading && records.length === 0 ? (
          <div className="p-12 text-center">
            <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-teal-600 dark:border-teal-400 border-t-transparent mb-2"></div>
            <p className="text-xs text-slate-500 dark:text-emerald-100/50">Loading attendance logs...</p>
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-xs text-slate-500 dark:text-emerald-100/50">
              No matching records found.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse font-mono text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-teal-200/10 bg-slate-50 dark:bg-black/40 text-[10px] uppercase tracking-wider text-slate-500 dark:text-teal-400/70">
                  <th className="px-3 py-2 w-8">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedIds(filteredRecords.map((r) => r.id));
                        } else {
                          setSelectedIds([]);
                        }
                      }}
                      className="rounded border-slate-300 dark:border-teal-200/20 bg-white dark:bg-black/40 text-teal-650 focus:ring-0 focus:ring-offset-0 focus:outline-none cursor-pointer w-3.5 h-3.5 accent-teal-600 dark:accent-teal-500"
                    />
                  </th>
                  <th
                    onClick={() => handleSort("id")}
                    className="px-3 py-2 font-semibold cursor-pointer select-none hover:text-teal-650 dark:hover:text-teal-300 transition-colors"
                  >
                    Row {renderSortIcon("id")}
                  </th>
                  <th
                    onClick={() => handleSort("name")}
                    className="px-3 py-2 font-semibold cursor-pointer select-none hover:text-teal-650 dark:hover:text-teal-300 transition-colors"
                  >
                    User Name {renderSortIcon("name")}
                  </th>
                  <th
                    onClick={() => handleSort("status")}
                    className="px-3 py-2 font-semibold cursor-pointer select-none hover:text-teal-650 dark:hover:text-teal-300 transition-colors"
                  >
                    Status {renderSortIcon("status")}
                  </th>
                  <th
                    onClick={() => handleSort("recognized_at")}
                    className="px-3 py-2 font-semibold cursor-pointer select-none hover:text-teal-650 dark:hover:text-teal-300 transition-colors"
                  >
                    Date {renderSortIcon("recognized_at")}
                  </th>
                  <th
                    onClick={() => handleSort("recognized_at")}
                    className="px-3 py-2 font-semibold cursor-pointer select-none hover:text-teal-650 dark:hover:text-teal-300 transition-colors"
                  >
                    Time (IST) {renderSortIcon("recognized_at")}
                  </th>
                  <th
                    onClick={() => handleSort("recognized_at")}
                    className="px-3 py-2 font-semibold cursor-pointer select-none hover:text-teal-650 dark:hover:text-teal-300 transition-colors hidden md:table-cell"
                  >
                    ISO 8601 UTC Timestamp {renderSortIcon("recognized_at")}
                  </th>
                  <th className="px-3 py-2 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-teal-200/5">
                {sortedRecords.map((record, index) => {
                  const t = formatTimestamp(record.recognized_at);
                  const isChecked = selectedIds.includes(record.id);
                  return (
                    <tr
                      key={record.id}
                      className={`${isChecked ? "bg-teal-500/[0.04] dark:bg-teal-500/5 hover:bg-teal-500/[0.08] dark:hover:bg-teal-500/10" : "hover:bg-slate-50 dark:hover:bg-white/5"} transition-colors border-b border-slate-100 dark:border-teal-200/5`}
                    >
                      <td className="px-3 py-1.5 w-8">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedIds([...selectedIds, record.id]);
                            } else {
                              setSelectedIds(selectedIds.filter((id) => id !== record.id));
                            }
                          }}
                          className="rounded border-slate-300 dark:border-teal-200/20 bg-white dark:bg-black/40 text-teal-600 focus:ring-0 focus:ring-offset-0 focus:outline-none cursor-pointer w-3.5 h-3.5 accent-teal-650 dark:accent-teal-50"
                        />
                      </td>
                      <td className="px-3 py-1.5 text-slate-400 dark:text-emerald-100/30">
                        {index + 1}
                      </td>
                      <td className="px-3 py-1.5">
                        <button
                          onClick={() => {
                            setImgError(false);
                            setSelectedRecord(record);
                          }}
                          className="font-bold text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 hover:underline text-left"
                        >
                          {record.name}
                        </button>
                      </td>
                      <td className="px-3 py-1.5">
                        <span className="inline-flex items-center rounded bg-emerald-50 dark:bg-emerald-400/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-400/20">
                          {record.status}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-slate-600 dark:text-emerald-100/70">
                        {t.date}
                      </td>
                      <td className="px-3 py-1.5 text-slate-700 dark:text-emerald-100/80">
                        {t.time}
                      </td>
                      <td className="px-3 py-1.5 text-slate-400 dark:text-emerald-100/40 hidden md:table-cell select-all">
                        {t.raw}
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <button
                          onClick={() => setDeleteConfirmIds([record.id])}
                          className="rounded p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:text-emerald-100/40 dark:hover:text-red-400 dark:hover:bg-red-500/10 transition-colors"
                          title="Delete record"
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

      {/* Attendance Snapshot Modal */}
      {selectedRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-fade-in" onClick={() => setSelectedRecord(null)}>
          <div
            className="w-full max-w-sm rounded-3xl border border-slate-200 dark:border-teal-200/20 bg-white dark:bg-[#0c1b18] p-6 shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-teal-200/10 pb-3 mb-4">
              <div>
                <h3 className="font-bold text-slate-800 dark:text-emerald-50 text-sm">
                  {selectedRecord.name}
                </h3>
                <p className="text-[10px] text-slate-400 dark:text-emerald-100/40 mt-0.5">
                  Record #{selectedRecord.id} · {new Date(selectedRecord.recognized_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
                </p>
              </div>
              <button
                onClick={() => setSelectedRecord(null)}
                className="text-xs text-teal-600 hover:text-teal-800 dark:text-teal-400 dark:hover:text-teal-300 transition-colors"
              >
                Close
              </button>
            </div>

            <div className="relative aspect-square w-full overflow-hidden rounded-2xl border border-slate-200 dark:border-teal-200/10 bg-slate-50 dark:bg-black/40 flex items-center justify-center">
              {/* Badge overlay */}
              <div className="absolute top-2 left-2 z-10">
                {selectedRecord.snapshot_path && !imgError ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-teal-500/90 px-2 py-0.5 text-[9px] font-bold text-white shadow">
                    📸 Live Snapshot
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-700/80 px-2 py-0.5 text-[9px] font-bold text-white/80 shadow">
                    👤 Profile Photo
                  </span>
                )}
              </div>

              {selectedRecord.snapshot_path && !imgError ? (
                /* Show the live check-in snapshot */
                <img
                  src={attendeeSnapshotURL(selectedRecord.snapshot_path)}
                  alt={`${selectedRecord.name} check-in snapshot`}
                  className="h-full w-full object-cover"
                  onError={() => setImgError(true)}
                />
              ) : (
                /* Fallback: registered profile photo from known_faces */
                <img
                  src={`${backendURL()}/recogniser/known_faces/${encodeURIComponent(selectedRecord.name)}`}
                  alt={`${selectedRecord.name} profile`}
                  className="h-full w-full object-cover"
                  onError={(e) => {
                    // If profile photo also missing, show placeholder
                    (e.target as HTMLImageElement).style.display = "none";
                    (e.target as HTMLImageElement).parentElement!.innerHTML +=
                      `<div class="text-center p-6"><div class="mx-auto h-12 w-12 rounded-full bg-slate-200 dark:bg-white/10 flex items-center justify-center mb-2"><svg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke-width='1.5' stroke='currentColor' class='w-6 h-6 text-slate-400'><path stroke-linecap='round' stroke-linejoin='round' d='M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z'/></svg></div><p class='text-xs text-slate-500 dark:text-emerald-100/50'>No photo available</p></div>`;
                  }}
                />
              )}
            </div>

            <div className="mt-3 text-center">
              <p className="text-[10px] text-slate-400 dark:text-emerald-100/40">
                {selectedRecord.snapshot_path && !imgError
                  ? "Photo captured automatically at check-in"
                  : "Showing registered profile photo · Live snapshots captured by recognizer"}
              </p>
              <button
                onClick={() => setSelectedRecord(null)}
                className="mt-3 w-full rounded-xl bg-teal-600 dark:bg-teal-500 px-4 py-2 text-xs font-bold text-white dark:text-[#07100f] hover:bg-teal-700 dark:hover:bg-teal-400 transition-all active:scale-[0.98]"
              >
                Close Window
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
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-500/10 border border-red-500/20 text-red-500">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              </div>
              <h3 className="font-bold text-slate-800 dark:text-red-100 text-sm">
                Confirm Deletion
              </h3>
            </div>

            <p className="text-xs text-slate-600 dark:text-red-200/70 mb-6 leading-relaxed">
              Are you sure you want to delete {deleteConfirmIds.length} attendance record{deleteConfirmIds.length > 1 ? "s" : ""}? This action is permanent and cannot be undone.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirmIds(null)}
                className="flex-1 rounded-xl border border-slate-200 dark:border-teal-200/10 bg-white dark:bg-white/5 px-4 py-2 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-white/10 transition-colors text-slate-700 dark:text-emerald-100/70"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  executeDelete(deleteConfirmIds);
                  setDeleteConfirmIds(null);
                }}
                className="flex-1 rounded-xl bg-red-650 dark:bg-red-500 px-4 py-2 text-xs font-bold text-white hover:bg-red-700 dark:hover:bg-red-400 transition-all active:scale-[0.98]"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
