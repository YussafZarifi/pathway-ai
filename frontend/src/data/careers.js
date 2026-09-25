// src/data/careers.js
export const CAREERS = [
  // =========================
  // Technology & Engineering
  // =========================
  {
    id: "software_engineer",
    title: "Software Engineer",
    summary: "Build apps, websites, and systems used by millions.",
    goodFor: ["Technology & Engineering", "Analytical & problem-solving", "Leadership & management", "Mix of everything"],
    environment: ["Office / desk-based", "Remote / flexible"],
    social: ["Some"],
    training: ["1–2 years", "3–4 years"],
    pressure: ["Medium pressure is okay"],
    roadmapPreview: ["Learn coding basics + Git", "Build 3 small projects", "Learn backend + databases", "Apply for internships"],
  },
  {
    id: "ai_engineer",
    title: "AI / Machine Learning Engineer",
    summary: "Build AI systems like vision, chatbots, and recommendations.",
    goodFor: ["Technology & Engineering", "Analytical & problem-solving"],
    environment: ["Office / desk-based", "Remote / flexible"],
    social: ["A little", "Some"],
    training: ["3–4 years", "5+ years"],
    pressure: ["Medium pressure is okay"],
    roadmapPreview: ["Python + math basics", "ML projects", "Deploy models (APIs)", "Build AI portfolio"],
  },
  {
    id: "data_analyst",
    title: "Data Analyst",
    summary: "Turn data into insights using SQL, dashboards, and reports.",
    goodFor: ["Technology & Engineering", "Business & Finance", "Analytical & problem-solving"],
    environment: ["Office / desk-based", "Remote / flexible"],
    social: ["Some"],
    training: ["0–6 months", "1–2 years"],
    pressure: ["Prefer stable/low pressure", "Medium pressure is okay"],
    roadmapPreview: ["Excel + SQL", "Dashboards (Power BI)", "Portfolio reports", "Apply for analyst roles"],
  },
  {
    id: "cybersecurity_analyst",
    title: "Cybersecurity Analyst",
    summary: "Protect systems and users by preventing and responding to attacks.",
    goodFor: ["Technology & Engineering", "Analytical & problem-solving"],
    environment: ["Office / desk-based", "Remote / flexible"],
    social: ["Some"],
    training: ["1–2 years", "3–4 years"],
    pressure: ["Medium pressure is okay", "I like high pressure"],
    roadmapPreview: ["Networking basics", "Security fundamentals", "Hands-on labs", "Certs + entry roles"],
  },

  // =========================
  // Healthcare & Helping People
  // =========================
  {
    id: "nurse",
    title: "Nurse",
    summary: "Provide direct patient care and support health outcomes.",
    goodFor: ["Healthcare & Helping people", "People & communication", "Hands-on / practical"],
    environment: ["Healthcare / clinical"],
    social: ["A lot"],
    training: ["3–4 years"],
    pressure: ["I like high pressure", "Medium pressure is okay"],
    roadmapPreview: ["Choose program (RPN/RN)", "Clinical placements", "Licensing exam", "Specialize over time"],
  },
  {
    id: "paramedic",
    title: "Paramedic",
    summary: "Provide emergency medical care in high-pressure situations.",
    goodFor: ["Healthcare & Helping people", "Hands-on / practical", "People & communication"],
    environment: ["Outdoors", "Healthcare / clinical", "Hands-on / on-site"],
    social: ["A lot"],
    training: ["1–2 years", "3–4 years"],
    pressure: ["I like high pressure"],
    roadmapPreview: ["Program requirements", "Training + clinical", "Certification", "Apply to services"],
  },
  {
    id: "medical_lab_technologist",
    title: "Medical Lab Technologist",
    summary: "Run lab tests that help doctors diagnose and treat patients.",
    goodFor: ["Healthcare & Helping people", "Analytical & problem-solving"],
    environment: ["Healthcare / clinical"],
    social: ["A little", "Some"],
    training: ["3–4 years"],
    pressure: ["Medium pressure is okay"],
    roadmapPreview: ["Choose accredited program", "Clinical placement", "Certification", "Apply to hospitals/labs"],
  },

  // =========================
  // Business & Finance
  // =========================
  {
    id: "accountant",
    title: "Accountant",
    summary: "Manage financial records, taxes, and reporting for businesses.",
    goodFor: ["Business & Finance", "Analytical & problem-solving", "Leadership & management"],
    environment: ["Office / desk-based", "Remote / flexible"],
    social: ["Some"],
    training: ["1–2 years", "3–4 years"],
    pressure: ["Prefer stable/low pressure", "Medium pressure is okay"],
    roadmapPreview: ["Basics of accounting", "Software tools", "Internship/junior role", "Specialize (tax/audit)"],
  },
  {
    id: "product_manager",
    title: "Product Manager",
    summary: "Plan what to build and coordinate teams to ship products.",
    goodFor: ["Business & Finance", "Leadership & management", "People & communication"],
    environment: ["Office / desk-based", "Remote / flexible"],
    social: ["A lot"],
    training: ["1–2 years", "3–4 years"],
    pressure: ["Medium pressure is okay"],
    roadmapPreview: ["Learn product thinking", "Ship small projects", "Intern/associate PM", "Own bigger features"],
  },
  {
    id: "sales_rep",
    title: "Sales Representative",
    summary: "Help customers choose solutions and drive business growth.",
    goodFor: ["Business & Finance", "People & communication", "Leadership & management"],
    environment: ["Office / desk-based", "Remote / flexible"],
    social: ["A lot"],
    training: ["0–6 months", "1–2 years"],
    pressure: ["I like high pressure", "Medium pressure is okay"],
    roadmapPreview: ["Learn the product", "Practice pitching", "Entry sales role", "Grow to account exec"],
  },

  // =========================
  // Creative & Design
  // =========================
  {
    id: "ux_ui_designer",
    title: "UI/UX Designer",
    summary: "Design clean, usable interfaces and user experiences.",
    goodFor: ["Creative & Design", "Creative & design", "People & communication"],
    environment: ["Office / desk-based", "Remote / flexible"],
    social: ["Some", "A lot"],
    training: ["0–6 months", "1–2 years"],
    pressure: ["Medium pressure is okay"],
    roadmapPreview: ["Figma basics", "3 case studies", "Usability testing", "Apply for junior roles"],
  },
  {
    id: "graphic_designer",
    title: "Graphic Designer",
    summary: "Create visuals for branding, marketing, and content.",
    goodFor: ["Creative & Design", "Creative & design"],
    environment: ["Office / desk-based", "Remote / flexible"],
    social: ["Some"],
    training: ["0–6 months", "1–2 years"],
    pressure: ["Prefer stable/low pressure", "Medium pressure is okay"],
    roadmapPreview: ["Design fundamentals", "Portfolio pieces", "Client projects", "Apply to roles"],
  },
  {
    id: "video_editor",
    title: "Video Editor",
    summary: "Edit videos for creators, brands, and media teams.",
    goodFor: ["Creative & Design", "Hands-on / practical", "Creative & design"],
    environment: ["Remote / flexible", "Office / desk-based"],
    social: ["Some"],
    training: ["0–6 months", "1–2 years"],
    pressure: ["Medium pressure is okay"],
    roadmapPreview: ["Editing tool basics", "Build a reel", "Freelance/client work", "Apply to teams"],
  },

  // =========================
  // Skilled trades & Hands-on
  // =========================
  {
    id: "electrician",
    title: "Electrician",
    summary: "Install and maintain electrical systems on-site.",
    goodFor: ["Skilled trades & Hands-on", "Hands-on / practical", "Analytical & problem-solving"],
    environment: ["Hands-on / on-site", "Outdoors"],
    social: ["Some"],
    training: ["1–2 years", "3–4 years"],
    pressure: ["Medium pressure is okay"],
    roadmapPreview: ["Pre-apprenticeship", "Apprenticeship hours", "Certification", "Specialize"],
  },
  {
    id: "plumber",
    title: "Plumber",
    summary: "Install and repair piping and plumbing systems.",
    goodFor: ["Skilled trades & Hands-on", "Hands-on / practical"],
    environment: ["Hands-on / on-site", "Outdoors"],
    social: ["Some"],
    training: ["1–2 years", "3–4 years"],
    pressure: ["Medium pressure is okay"],
    roadmapPreview: ["Basics + safety", "Apprenticeship", "Certification", "Specialize"],
  },

  // =========================
  // Public service & Education
  // =========================
  {
    id: "teacher",
    title: "Teacher",
    summary: "Support learning and growth in students.",
    goodFor: ["Public service & Education", "People & communication", "Leadership & management"],
    environment: ["Office / desk-based", "Hands-on / on-site"],
    social: ["A lot"],
    training: ["3–4 years", "5+ years"],
    pressure: ["Medium pressure is okay"],
    roadmapPreview: ["Pick subject/grade", "Education program", "Placements", "Certification"],
  },
  {
    id: "police_officer",
    title: "Police Officer",
    summary: "Protect communities through law enforcement and public safety.",
    goodFor: ["Public service & Education", "Hands-on / practical", "People & communication"],
    environment: ["Outdoors", "Hands-on / on-site"],
    social: ["A lot"],
    training: ["1–2 years", "3–4 years"],
    pressure: ["I like high pressure"],
    roadmapPreview: ["Fitness prep", "Testing", "Academy", "Field training"],
  },
];
