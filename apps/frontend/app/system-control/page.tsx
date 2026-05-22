"use client";

import React, { useEffect, useState, useRef } from "react";

type ServiceStatus = "active" | "offline" | "checking";

interface ControlStatus {
  frontend: boolean;
  backend: boolean;
  recognizer: boolean;
  recognizer_running: boolean;
}

const defaultBackendURL = "http://localhost:8080";

function backendURL() {
  return process.env.NEXT_PUBLIC_BACKEND_URL || defaultBackendURL;
}

interface LogEntry {
  time: string;
  type: "info" | "success" | "warning" | "error" | "cmd";
  text: string;
}

export default function SystemControl() {
  const [status, setStatus] = useState<ControlStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingService, setTogglingService] = useState<string | null>(null);
  const [terminalLogs, setTerminalLogs] = useState<LogEntry[]>([]);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  const addLog = (
    type: "info" | "success" | "warning" | "error" | "cmd",
    text: string,
  ) => {
    const timeStr = new Date().toLocaleTimeString();
    setTerminalLogs((prev) =>
      [...prev, { time: timeStr, type, text }].slice(-40),
    );
  };

  const fetchStatus = async () => {
    try {
      const res = await fetch(`${backendURL()}/control/status`, {
        cache: "no-store",
      });

      if (!res.ok) {
        throw new Error(`Server responded with status ${res.status}`);
      }

      const data = (await res.json()) as ControlStatus;
      setStatus((prevStatus) => {
        if (!prevStatus) {
          addLog(
            "success",
            `Connected to backend. Synced state: FE_ENABLE=${data.frontend}, BE_ENABLE=${data.backend}, REC_RUNNING=${data.recognizer_running}`,
          );
        } else {
          if (prevStatus.frontend !== data.frontend) {
            addLog(
              "info",
              `State change: Frontend service set to ${data.frontend ? "ENABLED" : "DISABLED"}`,
            );
          }
          if (prevStatus.backend !== data.backend) {
            addLog(
              "info",
              `State change: Backend service set to ${data.backend ? "ENABLED" : "DISABLED"}`,
            );
          }
          if (prevStatus.recognizer_running !== data.recognizer_running) {
            if (data.recognizer_running) {
              addLog("success", "Recognizer subprocess spawned and active");
            } else {
              addLog("warning", "Recognizer subprocess terminated or reaped");
            }
          }
        }
        return data;
      });
      setError(null);
    } catch (err: any) {
      console.error("Failed to fetch control status:", err);
      setError("Cannot reach backend server. Please verify it is running.");
      addLog(
        "error",
        `Connection failure: Cannot reach backend server at ${backendURL()}`,
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    addLog("cmd", "ovikctl daemon-init --verbose");
    addLog("info", "Loading Ovik system control daemon configuration...");
    addLog("info", `Target REST Endpoint: ${backendURL()}`);

    fetchStatus();
    // Poll every 3 seconds
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [terminalLogs]);

  const handleToggle = async (
    service: "frontend" | "backend" | "recognizer",
    currentVal: boolean,
  ) => {
    setTogglingService(service);
    addLog(
      "cmd",
      `ovikctl toggle --service ${service} --enable ${!currentVal}`,
    );
    try {
      const res = await fetch(`${backendURL()}/control/toggle`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          service,
          enable: !currentVal,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to toggle ${service}`);
      }

      const updatedStatus = (await res.json()) as ControlStatus;
      setStatus(updatedStatus);
      addLog("success", `Successfully toggled ${service} to ${!currentVal}`);
    } catch (err: any) {
      console.error(`Failed to toggle ${service}:`, err);
      addLog("error", `Toggle action failed: ${err.message || err.toString()}`);
      alert(err.message || `An error occurred while toggling ${service}`);
    } finally {
      setTogglingService(null);
    }
  };

  function getStatusBadge(isActive: boolean, isChecking: boolean) {
    if (isChecking) {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-yellow-500/10 px-3 py-1 text-xs font-semibold text-yellow-600 dark:text-yellow-400 border border-yellow-500/20 dark:border-yellow-400/20">
          <span className="h-2 w-2 rounded-full bg-yellow-500 dark:bg-yellow-400 animate-spin border-t-transparent border-2 border-current"></span>
          Checking...
        </span>
      );
    }
    if (isActive) {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 dark:border-emerald-400/20">
          <span className="h-2 w-2 rounded-full bg-emerald-500 dark:bg-emerald-400"></span>
          Active
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-600 dark:text-red-400 border border-red-500/20 dark:border-red-400/20 animate-pulse">
        <span className="h-2 w-2 rounded-full bg-red-500 dark:bg-red-400"></span>
        Offline
      </span>
    );
  }

  const renderToggleSwitch = (
    service: "frontend" | "backend" | "recognizer",
    enabled: boolean,
  ) => {
    const isPending = togglingService === service;
    return (
      <div className="flex items-center gap-3">
        {isPending && (
          <div className="h-4 w-4 animate-spin rounded-full border border-teal-500 dark:border-teal-400 border-t-transparent" />
        )}
        <button
          onClick={() => handleToggle(service, enabled)}
          disabled={isPending || status === null}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-teal-500/50 dark:focus:ring-teal-400/50 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-[#07100f] ${
            enabled ? "bg-teal-500" : "bg-slate-200 dark:bg-white/10"
          } ${isPending || status === null ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
              enabled ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>
    );
  };

  return (
    <div className="p-8 lg:p-12 max-w-5xl">
      <header className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight">System Controller</h1>
        <p className="mt-2 text-slate-500 dark:text-emerald-100/60">
          Administrate the active state of Ovik monitoring components and
          hardware integrations.
        </p>
      </header>

      {error && (
        <div className="mb-8 rounded-2xl bg-red-50 dark:bg-red-400/10 border border-red-200 dark:border-red-400/20 p-4 text-sm font-medium text-red-650 dark:text-red-400">
          {error}
        </div>
      )}

      {loading && status === null ? (
        <div className="p-12 text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-teal-600 dark:border-teal-400 border-t-transparent mb-4"></div>
          <p className="text-sm text-slate-500 dark:text-emerald-100/50">
            Fetching system status...
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          {/* Frontend Card */}
          <div className="rounded-3xl border border-slate-200 dark:border-teal-200/10 bg-white dark:bg-white/5 p-6 backdrop-blur-sm relative overflow-hidden flex flex-col justify-between h-56 shadow-sm dark:shadow-none">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-teal-650 dark:text-teal-400/80">
                  Frontend Client
                </span>
                {getStatusBadge(true, false)}
              </div>
              <h3 className="mt-4 text-xl font-bold text-slate-800 dark:text-emerald-50">Next.js Dashboard</h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-emerald-100/50">
                Serving UI layouts, logs, and controller interfaces.
              </p>
            </div>
            <div className="flex items-center justify-between border-t border-slate-100 dark:border-teal-200/5 pt-4 mt-4">
              <span className="text-xs text-slate-400 dark:text-emerald-100/40">
                {status?.frontend
                  ? "Enabled (Allow Page Access)"
                  : "Disabled (Maintenance Overlay)"}
              </span>
              {renderToggleSwitch("frontend", status?.frontend ?? true)}
            </div>
          </div>

          {/* Backend Card */}
          <div className="rounded-3xl border border-slate-200 dark:border-teal-200/10 bg-white dark:bg-white/5 p-6 backdrop-blur-sm relative overflow-hidden flex flex-col justify-between h-56 shadow-sm dark:shadow-none">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-teal-650 dark:text-teal-400/80">
                  Backend Server
                </span>
                {getStatusBadge(status !== null && !error, false)}
              </div>
              <h3 className="mt-4 text-xl font-bold text-slate-800 dark:text-emerald-50">Go REST API</h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-emerald-100/50">
                Handles attendance records and facial enrollment databases.
              </p>
            </div>
            <div className="flex items-center justify-between border-t border-slate-100 dark:border-teal-200/5 pt-4 mt-4">
              <span className="text-xs text-slate-400 dark:text-emerald-100/40">
                {status?.backend
                  ? "Enabled (API Operational)"
                  : "Disabled (API returns 503)"}
              </span>
              {renderToggleSwitch("backend", status?.backend ?? true)}
            </div>
          </div>

          {/* Face Recognizer Card */}
          <div className="rounded-3xl border border-slate-200 dark:border-teal-200/10 bg-white dark:bg-white/5 p-6 backdrop-blur-sm relative overflow-hidden flex flex-col justify-between h-56 shadow-sm dark:shadow-none">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-teal-650 dark:text-teal-400/80">
                  Face Recogniser
                </span>
                {getStatusBadge(status?.recognizer_running ?? false, false)}
              </div>
              <h3 className="mt-4 text-xl font-bold text-slate-800 dark:text-emerald-50">GoCV Camera Monitor</h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-emerald-100/50">
                Captures OpenCV video streams and checks frames against DLib
                models.
              </p>
            </div>
            <div className="flex items-center justify-between border-t border-slate-100 dark:border-teal-200/5 pt-4 mt-4">
              <span className="text-xs text-slate-400 dark:text-emerald-100/40">
                {status?.recognizer_running
                  ? "Running (Subprocess active)"
                  : "Terminated (Subprocess offline)"}
              </span>
              {renderToggleSwitch("recognizer", status?.recognizer ?? false)}
            </div>
          </div>
        </div>
      )}

      {/*<h2 className="text-lg font-semibold mb-4">Controller Diagnostics</h2>*/}

      {/* Terminal Frame */}
      <div className="w-full rounded-xl overflow-hidden border border-slate-200 dark:border-zinc-800 bg-[#0c0f12] shadow-2xl flex flex-col">
        {/* Terminal Title Bar */}
        <div className="bg-slate-100 dark:bg-[#181c20] px-4 py-3 flex items-center justify-between border-b border-slate-200 dark:border-zinc-800">
          {/*<div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-[#ff5f56] inline-block"></span>
              <span className="w-3 h-3 rounded-full bg-[#ffbd2e] inline-block"></span>
              <span className="w-3 h-3 rounded-full bg-[#27c93f] inline-block"></span>
            </div>*/}
          <div className="text-xs font-mono text-slate-650 dark:text-zinc-400">
            ovikctl -- diagnostics
          </div>
          <div className="w-12"></div> {/* Spacer for symmetry */}
        </div>

        {/* Terminal Body */}
        <div className="p-4 font-mono text-[11px] md:text-xs text-zinc-300 max-h-72 overflow-y-auto space-y-1.5 min-h-[220px]">
          {terminalLogs.map((log, idx) => {
            let typeColor = "text-zinc-400";
            let prefix = "INFO ";

            if (log.type === "cmd") {
              typeColor = "text-white font-bold";
              prefix = "$ ";
            } else if (log.type === "success") {
              typeColor = "text-emerald-400 font-semibold";
              prefix = "SUCCESS ";
            } else if (log.type === "warning") {
              typeColor = "text-yellow-500 font-semibold";
              prefix = "WARN ";
            } else if (log.type === "error") {
              typeColor = "text-red-400 font-semibold";
              prefix = "ERROR ";
            }

            return (
              <div
                key={idx}
                className="flex items-start gap-2 hover:bg-white/5 py-0.5 rounded px-1 transition-colors"
              >
                <span className="text-zinc-600 select-none shrink-0 font-light">
                  [{log.time}]
                </span>
                <span className={`${typeColor} shrink-0 font-medium`}>
                  {prefix}
                </span>
                <span className="break-all whitespace-pre-wrap select-text">
                  {log.text}
                </span>
              </div>
            );
          })}
          <div ref={terminalEndRef} />
        </div>
      </div>
    </div>
  );
}
