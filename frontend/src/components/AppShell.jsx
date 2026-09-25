// src/components/AppShell.jsx
import { NavLink } from "react-router-dom";

export default function AppShell({ title, subtitle = "Everything in one place: roadmap, resume, and coaching.", children }) {
  return (
    <div className="dashShell">
      {/* Full-width top bar */}
      <header className="dashTop">
        {/* Inner container (controls max width) */}
        <div className="dashTopInner">
          <div className="dashBrand">
            <div className="dashLogo">PA</div>
            <div>
              <div className="dashBrandTitle">PathwayAI</div>
              <div className="dashBrandSub">Your career hub</div>
            </div>
          </div>

          <nav className="dashNav">
            <NavLink end to="/app" className={({ isActive }) => `dashTab ${isActive ? "active" : ""}`}>
              Home
            </NavLink>
            <NavLink to="/app/roadmap" className={({ isActive }) => `dashTab ${isActive ? "active" : ""}`}>
              Roadmap
            </NavLink>
            <NavLink to="/app/resume" className={({ isActive }) => `dashTab ${isActive ? "active" : ""}`}>
              Resume
            </NavLink>
            <NavLink to="/app/coach" className={({ isActive }) => `dashTab ${isActive ? "active" : ""}`}>
              Coach
            </NavLink>
          </nav>

          <div className="dashActions">
            <button className="ghostBtn">Settings</button>
            <button className="primaryBtn">Upgrade</button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="dashMain">
        <div className="dashInner">
          <div className="dashHeader">
            <h1 className="dashTitle">{title}</h1>
            <p className="dashSub">{subtitle}</p>
          </div>

          <div className="dashContent">{children}</div>
        </div>
      </main>
    </div>
  );
}
