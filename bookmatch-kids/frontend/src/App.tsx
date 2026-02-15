import { useState } from "react";
import KidPage from "./pages/KidPage";
import StaffPage from "./pages/StaffPage";
import "./styles.css";

const tabs = [
  { id: "kid", label: "Kid" },
  { id: "staff", label: "Staff" },
] as const;

export default function App() {
  const [tab, setTab] = useState<(typeof tabs)[number]["id"]>("kid");

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>BookMatch Kids</h1>
          <p>Describe a book, get matches, and fulfill requests fast.</p>
        </div>
        <nav className="tabs">
          {tabs.map((item) => (
            <button
              key={item.id}
              className={tab === item.id ? "tab active" : "tab"}
              onClick={() => setTab(item.id)}
            >
              {item.label} View
            </button>
          ))}
        </nav>
      </header>
      <main className="app-main">
        {tab === "kid" ? <KidPage /> : <StaffPage />}
      </main>
    </div>
  );
}
