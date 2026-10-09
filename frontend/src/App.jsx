import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { MotionConfig } from "framer-motion";
import AuthProvider from "./components/AuthProvider";
import ThemeGate from "./components/ThemeGate";
import ScrollToTop from "./components/ScrollToTop";
import ErrorBoundary from "./components/ErrorBoundary";
import AppFooter from "./components/AppFooter";

import Landing from "./pages/Landing";
import Home from "./pages/Home";
import Quiz from "./pages/Quiz";
import Results from "./pages/Results";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import Resume from "./pages/Resume";
import Coach from "./pages/Coach";
import Settings from "./pages/Settings";
import Roadmaps from "./pages/Roadmaps";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";

// A new page gets a fresh boundary, so leaving a broken page recovers.
function RouteErrorBoundary({ children }) {
  const { pathname } = useLocation();
  return <ErrorBoundary key={pathname}>{children}</ErrorBoundary>;
}

export default function App() {
  return (
    <AuthProvider>
      {/* Honour the OS "reduce motion" setting for every framer-motion animation (TD-33). */}
      <MotionConfig reducedMotion="user">
        <BrowserRouter>
          <ScrollToTop />
          <ThemeGate>
            <RouteErrorBoundary>
              <Routes>
                {/* Public pages (Aurora) */}
                <Route path="/" element={<Landing />} />

                {/* Home page (Noir) */}
                <Route path="/home" element={<Home />} />
                <Route path="/quiz" element={<Quiz />} />
                <Route path="/results" element={<Results />} />

                {/* Accounts (optional; ADR-018) */}
                <Route path="/login" element={<Login />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/settings" element={<Settings />} />

                {/* Dashboard (Noir) */}
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/roadmaps" element={<Roadmaps />} />

                {/* Resume Analyzer (signed-in; ADR-020) */}
                <Route path="/resume" element={<Resume />} />

                {/* AI Coach (signed-in; ADR-021) */}
                <Route path="/coach" element={<Coach />} />

                {/* Anything else: branded 404 instead of a blank page */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </RouteErrorBoundary>
            <AppFooter />
          </ThemeGate>
        </BrowserRouter>
      </MotionConfig>
    </AuthProvider>
  );
}
