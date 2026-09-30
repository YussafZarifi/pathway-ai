import { useState } from "react";
import { NavLink } from "react-router-dom";
import { House, LayoutDashboard, LogIn, LogOut, Map } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/authContext";

const NAV_ITEMS = [
  { to: "/home", label: "Home", icon: <House size={18} aria-hidden="true" /> },
  {
    to: "/dashboard",
    label: "Dashboard",
    icon: <LayoutDashboard size={18} aria-hidden="true" />,
  },
  { to: "/quiz", label: "Quiz", icon: <Map size={18} aria-hidden="true" /> },
];

// Sign in link or signed-in email + sign out. Hidden when accounts are off
// (no Supabase config) and while the saved session is still loading.
function AccountControl() {
  const { enabled, loading, user } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  if (!enabled || loading) return null;

  const navClass = ({ isActive }) => `homeNavItem ${isActive ? "active" : ""}`;

  if (!user) {
    return (
      <div className="homeAccount">
        <NavLink to="/login" className={navClass}>
          <LogIn size={18} aria-hidden="true" />
          <span>Sign in</span>
        </NavLink>
      </div>
    );
  }

  const handleSignOut = async () => {
    setSigningOut(true);
    // The session change reaches every page through AuthProvider; the
    // browser-saved roadmap is left untouched.
    await supabase.auth.signOut();
    setSigningOut(false);
  };

  return (
    <div className="homeAccount">
      <span className="homeAccountEmail" title={user.email}>
        {user.email}
      </span>
      <button
        type="button"
        className="homeNavItem homeAccountBtn"
        onClick={handleSignOut}
        disabled={signingOut}
        aria-label={`Sign out of ${user.email}`}
      >
        <LogOut size={18} aria-hidden="true" />
        <span>Sign out</span>
      </button>
    </div>
  );
}

// Sticky header shared by the post-landing pages (/home, /dashboard, /login, 404).
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

      <div className="homeHeaderEnd">
        <nav className="homeNav" aria-label="Main">
          {NAV_ITEMS.map(({ to, label, icon }) => (
            <NavLink key={to} to={to} className={navClass}>
              {icon}
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <AccountControl />
      </div>
    </header>
  );
}
