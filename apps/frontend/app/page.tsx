const stats = [
  { label: "Backend", value: "Go API", detail: "Attendance write service" },
  { label: "Recognizer", value: "Go CV", detail: "Face detection client" },
  { label: "Frontend", value: "Next.js", detail: "Operator dashboard" }
];

const recentEvents = [
  { name: "Navaneeth", status: "Present", time: "09:02", source: "Cam 01" },
  { name: "Asha", status: "Present", time: "09:11", source: "Cam 02" },
  { name: "Rahul", status: "Present", time: "09:18", source: "Cam 01" }
];

export default function Home() {
  return (
    <main className="shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Ovik Monorepo</p>
          <h1>Attendance operations</h1>
          <p className="lede">
            Backend ingestion, face recognition, and a Next.js surface for
            reviewing the stream.
          </p>
        </div>
        <div className="heroPanel">
          {stats.map((item) => (
            <div key={item.label} className="statRow">
              <div>
                <p className="statLabel">{item.label}</p>
                <p className="statValue">{item.value}</p>
              </div>
              <p className="statDetail">{item.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="contentGrid">
        <div className="panel">
          <div className="panelHeader">
            <h2>Recent attendance</h2>
            <span className="badge">Live stream</span>
          </div>
          <div className="table">
            <div className="tableHead">
              <span>Name</span>
              <span>Status</span>
              <span>Time</span>
              <span>Source</span>
            </div>
            {recentEvents.map((event) => (
              <div key={`${event.name}-${event.time}`} className="tableRow">
                <span>{event.name}</span>
                <span>{event.status}</span>
                <span>{event.time}</span>
                <span>{event.source}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel stack">
          <div className="panelHeader">
            <h2>System layout</h2>
            <span className="badge muted">Monorepo</span>
          </div>
          <ul className="repoList">
            <li>
              <strong>apps/backend</strong>
              <span>Go API that writes recognition events to PostgreSQL.</span>
            </li>
            <li>
              <strong>apps/recognizer</strong>
              <span>Go client that classifies faces and posts attendance.</span>
            </li>
            <li>
              <strong>apps/frontend</strong>
              <span>Next.js app for operators and reporting flows.</span>
            </li>
          </ul>
        </div>
      </section>
    </main>
  );
}
