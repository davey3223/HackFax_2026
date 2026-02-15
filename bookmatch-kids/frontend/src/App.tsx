import { useEffect, useRef, useState } from "react";
import KidPage from "./pages/KidPage";
import StaffPage from "./pages/StaffPage";
import VolunteerPage from "./pages/VolunteerPage";
import PitchPage from "./pages/PitchPage";
import "./styles.css";
import { login, me, register, demoLogin, magicLogin } from "./api";

const tabs = [
  { id: "kid", label: "Kid" },
  { id: "staff", label: "Staff" },
  { id: "volunteer", label: "Volunteer" },
  { id: "pitch", label: "Pitch" },
] as const;

export default function App() {
  const [tab, setTab] = useState<(typeof tabs)[number]["id"]>("kid");
  const [user, setUser] = useState<{ id: string; email: string; name: string; role: string } | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authRole, setAuthRole] = useState("parent");
  const [authInvite, setAuthInvite] = useState("");
  const [demoError, setDemoError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [highContrast, setHighContrast] = useState(false);
  const [largeText, setLargeText] = useState(false);
  const [useGemini, setUseGemini] = useState(true);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    me().then((result) => setUser(result));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const magic = params.get("magic");
    if (!magic) return;
    magicLogin(magic)
      .then((data) => {
        localStorage.setItem("bookmatch_token", data.token);
        setUser(data.user);
        params.delete("magic");
        window.history.replaceState({}, "", `${window.location.pathname}`);
      })
      .catch(() => {
        params.delete("magic");
        window.history.replaceState({}, "", `${window.location.pathname}`);
      });
  }, []);

  useEffect(() => {
    const storedTheme = localStorage.getItem("bookmatch_theme") as "light" | "dark" | null;
    const storedContrast = localStorage.getItem("bookmatch_contrast");
    const storedText = localStorage.getItem("bookmatch_text");
    const storedGemini = localStorage.getItem("bookmatch_use_gemini");
    if (storedTheme) setTheme(storedTheme);
    if (storedContrast) setHighContrast(storedContrast === "high");
    if (storedText) setLargeText(storedText === "large");
    if (storedGemini) setUseGemini(storedGemini === "true");
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.dataset.contrast = highContrast ? "high" : "normal";
    root.dataset.text = largeText ? "large" : "normal";
    localStorage.setItem("bookmatch_theme", theme);
    localStorage.setItem("bookmatch_contrast", highContrast ? "high" : "normal");
    localStorage.setItem("bookmatch_text", largeText ? "large" : "normal");
    localStorage.setItem("bookmatch_use_gemini", useGemini ? "true" : "false");
  }, [theme, highContrast, largeText, useGemini]);

  useEffect(() => {
    if ((tab === "staff" || tab === "volunteer") && (!user || (user.role !== "staff" && user.role !== "volunteer"))) {
      setAuthOpen(true);
    }
  }, [tab, user]);

  async function handleAuthSubmit() {
    setAuthError(null);
    try {
      const data =
        authMode === "login"
          ? await login({ email: authEmail, password: authPassword })
          : await register({
              name: authName,
              email: authEmail,
              password: authPassword,
              role: authRole,
              invite_code: authInvite || undefined,
            });
      localStorage.setItem("bookmatch_token", data.token);
      setUser(data.user);
      setAuthOpen(false);
      setAuthPassword("");
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Auth failed");
    }
  }

  function handleLogout() {
    localStorage.removeItem("bookmatch_token");
    setUser(null);
  }

  async function handleDemoLogin() {
    setDemoError(null);
    try {
      const data = await demoLogin();
      localStorage.setItem("bookmatch_token", data.token);
      setUser(data.user);
      setAuthOpen(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Demo login failed";
      if (message.includes("Demo login disabled")) {
        setDemoError("Demo login disabled. Set DEMO_LOGIN=true in .env and restart backend.");
      } else {
        setDemoError(message);
      }
    }
  }

  const visibleTabs = (() => {
    if (!user) return tabs;
    if (user.role === "staff") return tabs;
    if (user.role === "volunteer") return tabs.filter((t) => t.id !== "staff");
    return tabs.filter((t) => t.id !== "staff" && t.id !== "volunteer");
  })();

  function onTouchStart(event: React.TouchEvent) {
    touchStartX.current = event.touches[0]?.clientX ?? null;
  }

  function onTouchEnd(event: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const endX = event.changedTouches[0]?.clientX ?? touchStartX.current;
    const delta = endX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(delta) < 60) return;
    const order = visibleTabs.map((t) => t.id);
    const index = order.indexOf(tab);
    if (delta < 0 && index < order.length - 1) {
      setTab(order[index + 1]);
    }
    if (delta > 0 && index > 0) {
      setTab(order[index - 1]);
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>BookMatch Kids</h1>
          <p>Describe a book, get matches, and fulfill requests fast.</p>
        </div>
        <div className="header-actions">
          <button className="secondary" onClick={() => setTheme(theme === "light" ? "dark" : "light")}>
            {theme === "light" ? "Dark mode" : "Light mode"}
          </button>
          <button className="secondary" onClick={() => setHighContrast((prev) => !prev)}>
            {highContrast ? "Standard contrast" : "High contrast"}
          </button>
          <button className="secondary" onClick={() => setLargeText((prev) => !prev)}>
            {largeText ? "Standard text" : "Large text"}
          </button>
          <button className="secondary" onClick={() => setUseGemini((prev) => !prev)}>
            {useGemini ? "Gemini: On" : "Gemini: Off"}
          </button>
          {user ? (
            <button className="secondary" onClick={handleLogout}>
              Logout {user.name}
            </button>
          ) : (
            <button className="secondary" onClick={() => setAuthOpen(true)}>
              Login
            </button>
          )}
        </div>
        <button
          className="hamburger"
          aria-label="Toggle navigation"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((prev) => !prev)}
        >
          <span />
          <span />
          <span />
        </button>
        <nav className={menuOpen ? "tabs tabs-open" : "tabs"}>
          {visibleTabs.map((item) => (
            <button
              key={item.id}
              className={tab === item.id ? "tab active" : "tab"}
              onClick={() => {
                setTab(item.id);
                setMenuOpen(false);
              }}
            >
              {item.label} View
            </button>
          ))}
        </nav>
      </header>
      <main className="app-main" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {tab === "kid" ? (
          <KidPage />
        ) : tab === "staff" ? (
          user?.role === "staff" || user?.role === "volunteer" ? <StaffPage /> : null
        ) : tab === "volunteer" ? (
          user?.role === "staff" || user?.role === "volunteer" ? <VolunteerPage /> : null
        ) : (
          <PitchPage />
        )}
      </main>
      {tab === "kid" ? (
        <nav className="bottom-nav" aria-label="Mobile navigation">
          {visibleTabs.map((item) => (
            <button
              key={item.id}
              className={tab === item.id ? "tab active" : "tab"}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      ) : null}
      {authOpen ? (
        <div className="modal" onClick={() => setAuthOpen(false)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <h3>{tab === "kid" ? "Login" : "Staff Login"}</h3>
            <p className="muted">
              {tab === "kid"
                ? "Sign in to save recommendations."
                : "Sign in with your staff or volunteer account."}
            </p>
            <div className="field-row">
              <select value={authMode} onChange={(event) => setAuthMode(event.target.value as "login" | "register")}>
                <option value="login">Login</option>
                <option value="register">Create account</option>
              </select>
              <select value={authRole} onChange={(event) => setAuthRole(event.target.value)}>
                <option value="parent">Parent/Kid</option>
                <option value="volunteer">Volunteer</option>
                <option value="staff">Staff</option>
              </select>
            </div>
            {authMode === "register" ? (
              <input
                type="text"
                value={authName}
                onChange={(event) => setAuthName(event.target.value)}
                placeholder="Full name"
              />
            ) : null}
            <div className="field-row">
              <input
                type="email"
                value={authEmail}
                onChange={(event) => setAuthEmail(event.target.value)}
                placeholder="Email"
              />
              <input
                type="password"
                value={authPassword}
                onChange={(event) => setAuthPassword(event.target.value)}
                placeholder="Password"
              />
              <button onClick={handleAuthSubmit}>
                {authMode === "login" ? "Login" : "Register"}
              </button>
            </div>
            {(authRole === "staff" || authRole === "volunteer") && authMode === "register" ? (
              <input
                type="password"
                value={authInvite}
                onChange={(event) => setAuthInvite(event.target.value)}
                placeholder="Staff invite code"
              />
            ) : null}
            {authError ? <div className="error">{authError}</div> : null}
            <div className="field-row">
              <button className="secondary" onClick={handleDemoLogin}>
                Demo staff login
              </button>
              <button
                className="secondary"
                onClick={() => {
                  setAuthEmail("demo@bookmatch.local");
                  setAuthPassword("demo1234");
                }}
              >
                Use demo credentials
              </button>
              {demoError ? <span className="muted">{demoError}</span> : null}
            </div>
            <div className="field-row">
              <button className="secondary" onClick={() => setAuthOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
