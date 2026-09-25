// src/pages/DashboardLayout.jsx
import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import AppShell from "../components/AppShell";

export default function DashboardLayout() {
  const location = useLocation();
  useEffect(() => {
  document.body.classList.add("theme-noir");
  return () => document.body.classList.remove("theme-noir");
}, []);

  const titleMap = {
    "/app": "Dashboard",
    "/app/roadmap": "Roadmap",
    "/app/resume": "Resume Analyzer",
    "/app/coach": "AI Coach",
  };

  return (
    <AppShell title={titleMap[location.pathname] || "Dashboard"}>
      <Outlet />
    </AppShell>
  );
}
