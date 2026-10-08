import { BrowserRouter, Routes, Route } from "react-router-dom";
import AuthProvider from "./components/AuthProvider";
import ThemeGate from "./components/ThemeGate";
import ScrollToTop from "./components/ScrollToTop";

import Landing from "./pages/Landing";
import Home from "./pages/Home";
import Quiz from "./pages/Quiz";
import Results from "./pages/Results";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import Resume from "./pages/Resume";
import NotFound from "./pages/NotFound";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <ScrollToTop />
        <ThemeGate>
          <Routes>
            {/* Public pages (Aurora) */}
            <Route path="/" element={<Landing />} />

            {/* Home page (Noir) */}
            <Route path="/home" element={<Home />} />
            <Route path="/quiz" element={<Quiz />} />
            <Route path="/results" element={<Results />} />

            {/* Accounts (optional; ADR-018) */}
            <Route path="/login" element={<Login />} />

            {/* Dashboard (Noir) */}
            <Route path="/dashboard" element={<Dashboard />} />

            {/* Resume Analyzer (signed-in; ADR-020) */}
            <Route path="/resume" element={<Resume />} />

            {/* Anything else: branded 404 instead of a blank page */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </ThemeGate>
      </BrowserRouter>
    </AuthProvider>
  );
}
