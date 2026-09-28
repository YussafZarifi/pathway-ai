// src/data/questions.js
export const QUESTIONS = [
  {
    id: "stage",
    type: "choice",
    title: "Where are you currently in your journey?",
    subtitle: "Helps tailor the recommendations to your stage.",
    options: [
      "High school",
      "College / University",
      "Self-learning / Bootcamp",
      "Working professional",
      "Graduate",
    ],
  },

  {
    id: "goal",
    type: "choice",
    title: "What’s your main goal right now?",
    options: [
      "Choose a career path",
      "Get an internship/job",
      "Build a learning plan",
      "Not sure yet",
    ],
  },

  {
    id: "interest_area",
    type: "choice",
    title: "Which tech field interests you most?",
    subtitle: "Pick the one that feels most exciting.",
    options: [
      "Software Engineering",
      "AI / Machine Learning",
      "Data Science & Analytics",
      "Cybersecurity",
      "Cloud & DevOps",
      "UX/UI & Product Design",
    ],
  },

  {
    id: "work_style",
    type: "choice",
    title: "Which work style fits you best?",
    options: [
      "Creative & design",
      "Analytical & problem-solving",
      "People & communication",
      "Hands-on / practical",
      "Leadership & management",
      "Mix of everything",
    ],
  },

  {
    id: "experience_level",
    type: "slider",
    title: "How much experience do you have in your area of interest?",
    subtitle: "Move the slider (it’s okay to estimate).",
    min: 0,
    max: 10,
    step: 1,
    labels: ["New", "Experienced"], // optional display labels
    unit: "years",
  },

  {
    id: "education_comfort",
    type: "slider",
    title: "How much education/training are you comfortable with?",
    subtitle: "This helps suggest paths that match your timeline.",
    min: 0,
    max: 6,
    step: 1,
    labels: ["Short", "Long"],
    unit: "years",
  },

  {
    id: "environment",
    type: "choice",
    title: "What work environment do you prefer?",
    options: [
      "Startup (fast-paced)",
      "Big Tech / Enterprise",
      "Remote / Freelance",
      "Research / Academia",
      "No preference",
    ],
  },

  {
    id: "curious_fields",
    type: "text",
    title: "Any specific tech roles you’re curious about?",
    subtitle: "Optional — this helps the AI personalize suggestions.",
    placeholder: "e.g., backend developer, ML engineer, cybersecurity analyst, DevOps, UX designer…",
    maxLength: 300, // the backend rejects longer answers (backend/schemas.py)
  },
];
