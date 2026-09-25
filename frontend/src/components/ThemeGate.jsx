import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * Adds a theme class to <body> based on route.
 * Public pages => aurora
 * Dashboard pages => noir
 */
export default function ThemeGate({ children }) {
  const { pathname } = useLocation();

  useEffect(() => {
    const isDashboard = pathname.startsWith("/dashboard");
    const isResults = pathname.startsWith("/results");
    const isNoir = isDashboard || isResults;

    document.body.classList.remove("theme-aurora", "theme-noir", "theme-landing");
    document.body.classList.add(isNoir ? "theme-landing" : "theme-aurora");
  }, [pathname]);

  return children;
}
