// src/components/Sidebar.jsx
import { NavLink } from "react-router-dom";

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebarBrand">
        <div className="logoSmall">RA</div>
        <div>
          <div className="brandTitle">RoadmapAI</div>
          <div className="brandSub">Career platform</div>
        </div>
      </div>

      <nav className="nav">
        <NavLink end to="/app" className={({ isActive }) => `navItem ${isActive ? "active" : ""}`}>
          Dashboard
        </NavLink>

        <NavLink to="/app/roadmap" className={({ isActive }) => `navItem ${isActive ? "active" : ""}`}>
          Roadmap
        </NavLink>

        <NavLink to="/app/resume" className={({ isActive }) => `navItem ${isActive ? "active" : ""}`}>
          Resume Analyzer
        </NavLink>

        <NavLink to="/app/coach" className={({ isActive }) => `navItem ${isActive ? "active" : ""}`}>
          AI Coach
        </NavLink>
      </nav>

      <div className="sidebarBottom">
        <button className="primaryBtn">Upgrade</button>
      </div>
    </aside>
  );
}
