/**
 * Scoring Engine
 * Computes career-related scores from tracked data
 * - Employability Score (0-100)
 * - Career Momentum Score (0-100)
 */

import {
  getEvents,
  getMetric,
  getAllProgress,
  getTrackingStats,
} from "./trackingEngine";

/**
 * Compute Employability Score (0-100)
 * Based on quiz performance, resume quality, and roadmap progress
 *
 * Formula:
 * - Quiz Completion: 30 points
 *   - Completed quiz: 10 points
 *   - All questions answered: 10 points
 *   - Time within reasonable range: 10 points
 *
 * - Resume Quality: 40 points
 *   - Resume score (0-100) scaled: 40 points max
 *
 * - Roadmap Progress: 20 points
 *   - Percentage of steps completed: 20 points max
 *
 * - Engagement: 10 points
 *   - Multiple sessions: 5 points
 *   - Actions completed: 5 points
 *
 * @returns {object} - Score object with details
 */
export function computeEmployabilityScore() {
  const stats = getTrackingStats();
  const progress = getAllProgress();

  let totalScore = 0;
  const details = {
    quizCompletion: 0,
    resumeQuality: 0,
    roadmapProgress: 0,
    engagement: 0,
  };

  // 1. Quiz Completion (30 points)
  const quizCompletedEvents = getEvents("quiz_completed");
  const quizStartedEvents = getEvents("quiz_started");

  if (quizCompletedEvents.length > 0) {
    details.quizCompletion += 10; // Completed quiz

    // Check if all questions answered (assume ~10 questions)
    const lastQuiz = quizCompletedEvents[quizCompletedEvents.length - 1];
    if (lastQuiz?.payload?.answers) {
      const answerCount = Object.keys(lastQuiz.payload.answers).length;
      if (answerCount >= 8) {
        details.quizCompletion += 10; // All/most questions answered
      }
    }

    // Reasonable time spent (2-15 minutes)
    if (lastQuiz?.payload?.timeSpent) {
      const timeMinutes = lastQuiz.payload.timeSpent / 60000;
      if (timeMinutes >= 2 && timeMinutes <= 15) {
        details.quizCompletion += 10; // Good time management
      }
    }
  }

  totalScore += details.quizCompletion;

  // 2. Resume Quality (40 points)
  const resumeScoreMetric = getMetric("resume_score");
  if (resumeScoreMetric && resumeScoreMetric.current !== null) {
    // Scale 0-100 resume score to 0-40 points
    details.resumeQuality = Math.round((resumeScoreMetric.current / 100) * 40);
  }
  totalScore += details.resumeQuality;

  // 3. Roadmap Progress (20 points)
  let totalSteps = 0;
  let completedSteps = 0;

  Object.entries(progress).forEach(([key, value]) => {
    if (key.startsWith("roadmap_step_")) {
      totalSteps++;
      if (value.completed) {
        completedSteps++;
      }
    }
  });

  if (totalSteps > 0) {
    const progressPercent = (completedSteps / totalSteps) * 100;
    details.roadmapProgress = Math.round((progressPercent / 100) * 20);
  }
  totalScore += details.roadmapProgress;

  // 4. Engagement (10 points)
  if (stats.totalSessions > 1) {
    details.engagement += 5; // Multiple sessions
  }
  if (stats.actionsCompleted >= 5) {
    details.engagement += 5; // Active user
  }
  totalScore += details.engagement;

  // Cap at 100
  totalScore = Math.min(100, Math.max(0, totalScore));

  return {
    score: Math.round(totalScore),
    details,
    maxScore: 100,
    level: getScoreLevel(totalScore),
  };
}

/**
 * Compute Career Momentum Score (0-100)
 * Measures career progression momentum and consistency
 *
 * Formula:
 * - Career Clarity: 25 points
 *   - Selected a career: 10 points
 *   - Career match score: 15 points (scaled)
 *
 * - Progress Velocity: 35 points
 *   - Roadmap steps completed recently: 20 points
 *   - Consistent progress (completed in last 7 days): 15 points
 *
 * - Skill Development: 20 points
 *   - Resume improvements: 20 points (scaled)
 *
 * - Activity Consistency: 20 points
 *   - Sessions in last 7 days: 10 points
 *   - Daily activity average: 10 points
 *
 * @returns {object} - Score object with details
 */
export function computeCareerMomentumScore() {
  const stats = getTrackingStats();
  const events = getEvents();
  const progress = getAllProgress();
  const resumeScoreMetric = getMetric("resume_score");

  let totalScore = 0;
  const details = {
    careerClarity: 0,
    progressVelocity: 0,
    skillDevelopment: 0,
    activityConsistency: 0,
  };

  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

  // 1. Career Clarity (25 points)
  const careerSelectedEvents = getEvents("career_selected");
  if (careerSelectedEvents.length > 0) {
    details.careerClarity += 10; // Selected a career

    const lastSelection =
      careerSelectedEvents[careerSelectedEvents.length - 1];
    if (lastSelection?.payload?.matchScore) {
      // Scale match score to 15 points
      const matchScore = Math.min(100, lastSelection.payload.matchScore);
      details.careerClarity += Math.round((matchScore / 100) * 15);
    }
  }
  totalScore += details.careerClarity;

  // 2. Progress Velocity (35 points)
  let completedStepsLast7Days = 0;
  const roadmapCompletedEvents = events.filter(
    (e) =>
      e.type === "roadmap_step_completed" && e.timestamp >= sevenDaysAgo
  );

  completedStepsLast7Days = roadmapCompletedEvents.length;

  // Scale completed steps (max 10 for full points)
  const stepPoints = Math.min(10, completedStepsLast7Days);
  details.progressVelocity += Math.round((stepPoints / 10) * 20);

  // Check consistent progress
  let hasProgressInLast7Days = false;
  Object.entries(progress).forEach(([key, value]) => {
    if (value.completed && value.completed >= sevenDaysAgo) {
      hasProgressInLast7Days = true;
    }
  });

  if (hasProgressInLast7Days) {
    details.progressVelocity += 15; // Recent activity
  }
  totalScore += details.progressVelocity;

  // 3. Skill Development (20 points)
  const resumeImprovedEvents = events.filter(
    (e) => e.type === "resume_improved" && e.timestamp >= sevenDaysAgo
  );

  if (resumeScoreMetric && resumeScoreMetric.current !== null) {
    // Scale resume score to 20 points
    const scorePoints = Math.round((resumeScoreMetric.current / 100) * 20);
    details.skillDevelopment = scorePoints;
  } else if (resumeImprovedEvents.length > 0) {
    // If improved but no current score, give partial points
    details.skillDevelopment = Math.min(20, resumeImprovedEvents.length * 5);
  }
  totalScore += details.skillDevelopment;

  // 4. Activity Consistency (20 points)
  const sessionsInLast7Days = events.filter(
    (e) => e.type === "session_start" && e.timestamp >= sevenDaysAgo
  ).length;

  // Scale sessions (max 5 for full points)
  const sessionPoints = Math.min(5, sessionsInLast7Days);
  details.activityConsistency += Math.round((sessionPoints / 5) * 10);

  // Daily activity average
  const totalActions = stats.actionsCompleted || 0;
  const avgActionsPerDay = totalActions / Math.max(1, stats.totalSessions);
  if (avgActionsPerDay >= 2) {
    details.activityConsistency += 10;
  } else if (avgActionsPerDay >= 1) {
    details.activityConsistency += 5;
  }
  totalScore += details.activityConsistency;

  // Cap at 100
  totalScore = Math.min(100, Math.max(0, totalScore));

  return {
    score: Math.round(totalScore),
    details,
    maxScore: 100,
    trend: getMomentumTrend(events, progress),
  };
}

/**
 * Get descriptive level for a score
 * @param {number} score - Score value (0-100)
 * @returns {string} - Level description
 */
function getScoreLevel(score) {
  if (score >= 90) return "Excellent";
  if (score >= 75) return "Good";
  if (score >= 50) return "Moderate";
  if (score >= 25) return "Developing";
  return "Beginner";
}

/**
 * Determine momentum trend based on recent activity
 * @param {array} events - All events
 * @param {object} progress - All progress data
 * @returns {string} - Trend: "up", "down", or "stable"
 */
function getMomentumTrend(events, progress) {
  const now = Date.now();
  const threeDaysAgo = now - 3 * 24 * 60 * 60 * 1000;
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

  const recentActions = events.filter(
    (e) => e.timestamp >= threeDaysAgo
  ).length;
  const weekActions = events.filter(
    (e) => e.timestamp >= sevenDaysAgo
  ).length;

  const recentRatio = recentActions / Math.max(1, weekActions);

  if (recentRatio > 0.6) return "up";
  if (recentRatio < 0.3) return "down";
  return "stable";
}

/**
 * Get overall career readiness summary
 * @returns {object} - Summary with both scores and recommendations
 */
export function getCareerReadinessSummary() {
  const employability = computeEmployabilityScore();
  const momentum = computeCareerMomentumScore();
  const stats = getTrackingStats();

  const avgScore = Math.round((employability.score + momentum.score) / 2);

  const recommendations = getRecommendations(employability, momentum);

  return {
    averageScore: avgScore,
    employability,
    momentum,
    stats,
    recommendations,
  };
}

/**
 * Generate recommendations based on scores
 * @param {object} employability - Employability score object
 * @param {object} momentum - Momentum score object
 * @returns {array} - Array of recommendations
 */
function getRecommendations(employability, momentum) {
  const recommendations = [];

  // Quiz recommendations
  if (employability.details.quizCompletion < 20) {
    recommendations.push({
      type: "quiz",
      priority: "high",
      message: "Complete the career assessment quiz to improve your score.",
    });
  }

  // Resume recommendations
  if (employability.details.resumeQuality < 30) {
    recommendations.push({
      type: "resume",
      priority: "high",
      message: "Upload and improve your resume to boost employability.",
    });
  } else if (employability.details.resumeQuality < 60) {
    recommendations.push({
      type: "resume",
      priority: "medium",
      message: "Work on improving your resume score further.",
    });
  }

  // Roadmap recommendations
  if (employability.details.roadmapProgress < 10) {
    recommendations.push({
      type: "roadmap",
      priority: "high",
      message:
        "Start your roadmap to demonstrate progress and build momentum.",
    });
  } else if (employability.details.roadmapProgress < 50) {
    recommendations.push({
      type: "roadmap",
      priority: "medium",
      message:
        "Continue completing roadmap steps to increase your progress score.",
    });
  }

  // Career clarity recommendations
  if (momentum.details.careerClarity < 15) {
    recommendations.push({
      type: "career",
      priority: "medium",
      message: "Select a career path to clarify your direction.",
    });
  }

  // Engagement recommendations
  if (employability.details.engagement < 5) {
    recommendations.push({
      type: "engagement",
      priority: "low",
      message:
        "Stay consistent with daily activity to build career momentum.",
    });
  }

  return recommendations;
}
