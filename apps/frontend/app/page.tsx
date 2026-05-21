type AttendanceRecord = {
  name: string;
  status: string;
  recognized_at: string;
};

const defaultBackendURL = "http://localhost:8080";

function backendURL() {
  return (
    process.env.BACKEND_URL ||
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    defaultBackendURL
  );
}

async function getAttendanceRecords() {
  const response = await fetch(`${backendURL()}/attendance?limit=50`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`attendance fetch failed with status ${response.status}`);
  }

  return (await response.json()) as AttendanceRecord[];
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

export default async function Home() {
  const records = await getAttendanceRecords();

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(42,157,143,0.18),transparent_32%),linear-gradient(180deg,#081412_0%,#0d1f1b_48%,#07100f_100%)] px-5 py-10 text-emerald-50 sm:px-8 sm:py-14">
      <div className="mx-auto max-w-4xl">
        <section className="mb-6">
          <p className="mb-2 text-xs uppercase tracking-[0.16em] text-teal-300">
            Ovik Attendance
          </p>
          <h1 className="text-4xl leading-none font-semibold sm:text-5xl">
            Present log
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-emerald-100/75">
          Recent recognition events written by the recognizer and stored by the
          backend.
          </p>
        </section>

        <section className="rounded-3xl border border-teal-200/15 bg-black/20 p-5 shadow-[0_20px_80px_rgba(0,0,0,0.28)] backdrop-blur-xl sm:p-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <h2 className="text-lg font-medium">Recent marks</h2>
            <span className="rounded-full bg-teal-300/12 px-3 py-1 text-xs text-teal-200">
              {records.length} entries
            </span>
          </div>

          {records.length === 0 ? (
            <p className="text-sm text-emerald-100/75">
              No attendance has been marked yet.
            </p>
          ) : (
            <div className="grid gap-3">
              {records.map((record) => (
                <article
                  key={`${record.name}-${record.recognized_at}`}
                  className="flex flex-col gap-3 border-t border-teal-200/10 py-4 first:border-t-0 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-lg font-semibold">{record.name}</p>
                    <p className="mt-1 text-sm text-emerald-100/75">
                      {formatTimestamp(record.recognized_at)}
                    </p>
                  </div>
                  <span className="w-fit rounded-full bg-lime-300/12 px-3 py-1 text-xs capitalize text-lime-200">
                    {record.status}
                  </span>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
