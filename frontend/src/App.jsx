import { BrowserRouter, Routes, Route } from "react-router-dom";
import ThemeGate from "./components/ThemeGate";

import Landing from "./pages/Landing";
import Home from "./pages/Home";
import Quiz from "./pages/Quiz";
import Results from "./pages/Results";
import Dashboard from "./pages/Dashboard";

export default function App() {
  return (
    <BrowserRouter>
      <ThemeGate>
        <Routes>
          {/* Public pages (Aurora) */}
          <Route path="/" element={<Landing />} />
          
          {/* Home page (Noir) */}
          <Route path="/home" element={<Home />} />
          <Route path="/quiz" element={<Quiz />} />
          <Route path="/results" element={<Results />} />

          {/* Dashboard (Noir) */}
          <Route path="/dashboard" element={<Dashboard />} />
        </Routes>
      </ThemeGate>
    </BrowserRouter>
  );
}
