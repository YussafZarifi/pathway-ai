import { useState } from "react";
import { FileUp, AlertCircle, CheckCircle, ArrowUp } from "lucide-react";
import {
  trackEvent,
  trackMetric,
  EVENT_TYPES,
  METRIC_NAMES,
} from "../lib/trackingEngine";

export default function ResumeAnalyzer() {
  const [file, setFile] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState(null);
  const [previousScore, setPreviousScore] = useState(null);

  const handleFileUpload = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);

      // Track resume upload
      trackEvent(EVENT_TYPES.RESUME_UPLOADED, {
        fileName: selectedFile.name,
        fileSize: selectedFile.size,
      });
    }
  };

  const handleAnalyze = () => {
    if (!file) return;

    setAnalyzing(true);
    setResult(null);

    // Simulate AI analysis (replace with actual API call)
    setTimeout(() => {
      const newScore = Math.floor(Math.random() * 40) + 50; // Random 50-90

      // Track resume analysis
      trackEvent(EVENT_TYPES.RESUME_ANALYZED, {
        score: newScore,
        issues: [
          "Missing keywords",
          "Inconsistent formatting",
          "Could quantify achievements",
        ],
        suggestions: [
          "Add more quantifiable results",
          "Use action verbs",
          "Include relevant keywords",
        ],
      });

      // Track metric
      trackMetric(METRIC_NAMES.RESUME_SCORE, newScore);

      // Track improvement if previous score exists
      if (previousScore !== null) {
        const improvement = newScore - previousScore;

        trackEvent(EVENT_TYPES.RESUME_IMPROVED, {
          previousScore,
          newScore,
          improvement,
        });

        trackMetric(METRIC_NAMES.RESUME_IMPROVEMENT, improvement);

        setResult({
          score: newScore,
          previousScore,
          improvement,
          issues: [
            "Missing keywords",
            "Inconsistent formatting",
            "Could quantify achievements",
          ],
          suggestions: [
            "Add more quantifiable results",
            "Use action verbs",
            "Include relevant keywords",
          ],
        });
      } else {
        // First analysis
        trackMetric(METRIC_NAMES.RESUME_ANALYSIS_COUNT, 1);

        setResult({
          score: newScore,
          previousScore: null,
          improvement: null,
          issues: [
            "Missing keywords",
            "Inconsistent formatting",
            "Could quantify achievements",
          ],
          suggestions: [
            "Add more quantifiable results",
            "Use action verbs",
            "Include relevant keywords",
          ],
        });
      }

      setPreviousScore(newScore);
      setAnalyzing(false);
    }, 2000);
  };

  const getScoreColor = (score) => {
    if (score >= 90) return "#22c55e";
    if (score >= 75) return "#3b82f6";
    if (score >= 50) return "#f59e0b";
    if (score >= 25) return "#f97316";
    return "#ef4444";
  };

  return (
    <div className="resumeAnalyzerPage">
      <div className="resumeCard">
        <div className="resumeHeader">
          <div>
            <h1 className="panelTitle">Resume Analyzer</h1>
            <p className="panelSub">
              Upload your resume and get AI-powered feedback to improve your
              employability score.
            </p>
          </div>
          <div className="resumeIcon">
            <FileUp size={48} />
          </div>
        </div>

        {!result && (
          <div className="resumeUpload">
            <input
              type="file"
              id="resumeInput"
              accept=".pdf,.doc,.docx"
              onChange={handleFileUpload}
              style={{ display: "none" }}
            />
            <label
              htmlFor="resumeInput"
              className={`uploadZone ${file ? "hasFile" : ""}`}
            >
              <FileUp size={48} />
              <div className="uploadText">
                {file ? file.name : "Click or drag to upload resume"}
              </div>
              <div className="uploadHint">
                PDF, DOC, DOCX (max 5MB)
              </div>
            </label>

            <button
              className="uiverseBtn large"
              onClick={handleAnalyze}
              disabled={!file || analyzing}
            >
              {analyzing ? "Analyzing..." : "Analyze Resume"}
            </button>
          </div>
        )}

        {result && (
          <div className="resumeResult">
            <div className="scoreSection">
              <div className="scoreCircle">
                <div
                  className="scoreValueLarge"
                  style={{ color: getScoreColor(result.score) }}
                >
                  {result.score}
                </div>
                <div className="scoreLabel">Resume Score</div>
              </div>

              {result.previousScore !== null && (
                <div className="improvementBadge">
                  {result.improvement >= 0 ? (
                    <>
                      <ArrowUp size={16} />
                      {result.improvement} improvement
                    </>
                  ) : (
                    <>{result.improvement} change</>
                  )}
                </div>
              )}
            </div>

            <div className="resultSection">
              <h3 className="resultTitle">
                <AlertCircle size={20} />
                Issues Found
              </h3>
              <ul className="resultList">
                {result.issues.map((issue, index) => (
                  <li key={index} className="resultItem">
                    {issue}
                  </li>
                ))}
              </ul>
            </div>

            <div className="resultSection">
              <h3 className="resultTitle">
                <CheckCircle size={20} />
                Suggestions
              </h3>
              <ul className="resultList">
                {result.suggestions.map((suggestion, index) => (
                  <li key={index} className="resultItem suggestion">
                    {suggestion}
                  </li>
                ))}
              </ul>
            </div>

            <div className="resultActions">
              <button
                className="ghostBtn"
                onClick={() => {
                  setResult(null);
                  setFile(null);
                }}
              >
                Upload Different Resume
              </button>
              <button
                className="uiverseBtn"
                onClick={handleAnalyze}
                disabled={analyzing}
              >
                {analyzing ? "Re-analyzing..." : "Re-analyze"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
