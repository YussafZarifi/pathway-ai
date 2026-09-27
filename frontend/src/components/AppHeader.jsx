import { NavLink } from "react-router-dom";
import { House, LayoutDashboard, Map } from "lucide-react";

const NAV_ITEMS = [
  { to: "/home", label: "Home", icon: <House size={18} aria-hidden="true" /> },
  {
    to: "/dashboard",
    label: "Dashboard",
    icon: <LayoutDashboard size={18} aria-hidden="true" />,
  },
  { to: "/quiz", label: "Quiz", icon: <Map size={18} aria-hidden="true" /> },
];

// Sticky header shared by the post-landing pages (/home, /dashboard).
export default function AppHeader() {
  const navClass = ({ isActive }) => `homeNavItem ${isActive ? "active" : ""}`;

  return (
    <header className="homeTopbar">
      <div className="homeBrand">
        <div className="homeLogo">PA</div>
        <div>
          <div className="homeBrandName">PathwayAI</div>
          <div className="homeBrandTagline">Your Career Hub</div>
        </div>
      </div>

      <nav className="homeNav" aria-label="Main">
        {NAV_ITEMS.map(({ to, label, icon }) => (
          <NavLink key={to} to={to} className={navClass}>
            {icon}
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </header>
  );
}
