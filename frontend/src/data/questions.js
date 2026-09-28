// src/data/questions.js
// The 5-question quiz (ADR-016). IDs are a contract with the backend
// (backend/schemas.py QuizAnswersV2) and its prompts: change them only
// together, with an ADR.
export const QUESTIONS = [
  {
    id: "interests",
    type: "multi",
    max: 3,
    title: "What excites you the most?",
    subtitle: "Choose up to 3.",
    options: [
      "Building apps",
      "Working with AI",
      "Analyzing data",
      "Designing interfaces",
      "Securing systems",
      "Automating tasks",
      "Cloud & infrastructure",
      "Mobile apps",
      "Games",
    ],
  },

  {
    id: "problem_style",
    type: "choice",
    title: "When you face a hard problem, what’s your style?",
    options: [
      "Dig in until I find the root cause",
      "Build a quick version and improve it fast",
      "Research and experiment until I really understand it",
      "Work with people to figure out what they actually need",
      "Organize the plan and keep everyone moving",
    ],
  },

  {
    id: "experience",
    type: "choice",
    title: "What’s your experience level?",
    subtitle: "This sets where your roadmap starts.",
    options: [
      "Complete beginner",
      "Some coding",
      "Built a few projects",
      "Comfortable developer",
      "Professional developer",
    ],
  },

  {
    id: "weekly_hours",
    type: "buttons",
    title: "How much time can you realistically give each week?",
    subtitle: "This sets the pace of your roadmap.",
    options: [
      { value: 2, label: "2 hours" },
      { value: 5, label: "5 hours" },
      { value: 10, label: "10 hours" },
      { value: 20, label: "20+ hours" },
    ],
  },

  {
    id: "goal",
    type: "choice",
    title: "What do you want to achieve in the next 12 months?",
    options: [
      "Get my first tech job",
      "Land an internship",
      "Switch careers",
      "Build my own startup",
      "Learn for fun",
    ],
    // Optional field shown below the options.
    followUp: {
      id: "career_in_mind",
      label: "Already have a career in mind?",
      hint: "Optional",
      placeholder: "e.g. AI engineer",
      maxLength: 100, // the backend rejects longer answers (backend/schemas.py)
      suggestions: [
        "AI engineer",
        "Full-stack developer",
        "Data engineer",
        "Security analyst",
        "UX designer",
      ],
    },
  },
];
