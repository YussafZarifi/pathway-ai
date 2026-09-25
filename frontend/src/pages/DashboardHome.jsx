// src/pages/DashboardHome.jsx
import { useNavigate } from "react-router-dom";

export default function DashboardHome() {
  const navigate = useNavigate();

  return (
    <div className="dashGrid">
      {/* Roadmap */}
      <div className="dashCard">
        <h3 className="dashCardTitle">Roadmap</h3>
        <p className="dashCardText">
          Pick a career and generate a step-by-step learning plan tailored to you.
        </p>
        <div className="dashCardActions">
          <button className="primaryBtn" onClick={() => navigate("/app/roadmap")}>
            Open
          </button>
          <button className="ghostBtn" onClick={() => navigate("/quiz")}>
            Retake quiz
          </button>
        </div>
      </div>

      {/* Resume */}
      <div className="dashCard">
        <h3 className="dashCardTitle">Resume Analyzer</h3>
        <p className="dashCardText">
          Upload or paste your resume and get instant AI feedback.
        </p>
        <div className="dashCardActions">
          <button className="primaryBtn" onClick={() => navigate("/app/resume")}>
            Open
          </button>
        </div>
      </div>

      {/* Coach */}
      <div className="dashCard">
        <h3 className="dashCardTitle">AI Coach</h3>
        <p className="dashCardText">
          Ask questions about careers, interviews, and staying consistent.
        </p>
        <div className="dashCardActions">
          <button className="primaryBtn" onClick={() => navigate("/app/coach")}>
            Open
          </button>
          <span className="dashBadge">Coming soon</span>
        </div>
      </div>
    </div>
  );
}
