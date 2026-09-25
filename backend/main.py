import os, json
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from google import genai

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

class CareerRequest(BaseModel):
    answers: dict

class RoadmapRequest(BaseModel):
    answers: dict
    career: str

@app.post("/api/ai/career")
def career_ai(payload: CareerRequest):
    if not os.getenv("GEMINI_API_KEY"):
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY missing in backend/.env")

    answers = payload.answers

    if not answers or not isinstance(answers, dict):
        print(f"ERROR: Invalid answers received: {answers}")
        raise HTTPException(status_code=400, detail="Invalid answers format")

    profile_text = "\n".join([f"{k}: {v}" for k, v in answers.items()])
    print(f"Processing career request with answers: {profile_text}")

    prompt = f"""
Return STRICT JSON only (no markdown, no code fences) in this exact shape:
{{
  "careers": [
    {{
      "title":"...",
      "reason":"...",
      "match_score": 85,
      "salary_range":"$80k - $120k",
      "growth_rate":"+15% (Faster than average)",
      "education":"Bachelor's degree",
      "skills":["Skill1","Skill2","Skill3","Skill4"]
    }},
    {{
      "title":"...",
      "reason":"...",
      "match_score": 80,
      "salary_range":"$75k - $110k",
      "growth_rate":"+12% (Faster than average)",
      "education":"Bachelor's or certificate",
      "skills":["Skill1","Skill2","Skill3","Skill4"]
    }},
    {{
      "title":"...",
      "reason":"...",
      "match_score": 75,
      "salary_range":"$70k - $100k",
      "growth_rate":"+10% (Faster than average)",
      "education":"Associate degree",
      "skills":["Skill1","Skill2","Skill3","Skill4"]
    }}
  ],
  "explanation": "..."
}}

Rules:
- careers: exactly 3
- ALL careers must be technology-industry roles only (e.g., software engineering, AI/ML, data science, cybersecurity, cloud/DevOps, IT, product/UX for tech products). Never suggest non-tech careers, even if some answers seem general.
- reason: 1–2 sentences each
- match_score: 70-95 (higher means better match)
- salary_range: realistic range in USD (e.g., "$60k - $100k")
- growth_rate: percentage with descriptor (e.g., "+20% (Much faster than average)")
- education: typical requirements
- skills: exactly 4-5 relevant skills
- explanation: 3–5 sentences max, simple and supportive

User answers:
{profile_text}
"""

    try:
        print(f"Calling Gemini API for careers, prompt length: {len(prompt)}")
        resp = client.models.generate_content(
            model="gemini-2.5-flash-lite",
            contents=prompt,
        )
        text = (resp.text or "").strip()
        print(f"API Response received, length: {len(text)}")

        if text.startswith("```"):
            text = text.strip("`").replace("json", "", 1).strip()

        result = json.loads(text)
        print(f"Parsed result: {result}")
        return result

    except json.JSONDecodeError as e:
        print(f"JSON Decode Error: {e}")
        print(f"Raw response: {text}")
        raise HTTPException(status_code=500, detail=f"Failed to parse AI response: {str(e)}")
    except Exception as e:
        print(f"Gemini API Error: {e}")
        print(f"Error type: {type(e).__name__}")
        raise HTTPException(status_code=500, detail=f"AI generation failed: {str(e)}. Check backend console.")


@app.get("/")
def root():
    return {"status": "ok", "message": "Backend is running"}

@app.post("/api/ai/roadmap")
def roadmap_ai(payload: RoadmapRequest):
    if not os.getenv("GEMINI_API_KEY"):
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY missing in backend/.env")

    answers = payload.answers
    career = payload.career
    profile_text = "\n".join([f"{k}: {v}" for k, v in answers.items()])

    prompt = f"""
Return STRICT JSON only in this exact shape:
{{
  "career": "{career}",
  "roadmap": [
    {{
      "title":"Step title",
      "description":"Brief description of what to do",
      "time":"2-4 weeks",
      "resources":[
        {{"name":"Resource name","url":"https://example.com"}},
        {{"name":"Another resource","url":"https://example.com"}}
      ],
      "tasks":["Task 1","Task 2","Task 3"]
    }}
  ]
}}

Rules:
- roadmap: 5 steps max
- each step: actionable, beginner-friendly
- time: estimate (e.g., "2-4 weeks", "1-2 months")
- resources: 2-3 learning resources with valid URLs
- tasks: 2-3 actionable items
- tailor to user's stage + location if provided

User answers:
{profile_text}

Chosen career:
{career}
"""

    try:
        resp = client.models.generate_content(
            model="gemini-2.5-flash-lite",
            contents=prompt,
        )
        text = (resp.text or "").strip()

        if text.startswith("```"):
            text = text.strip("`").replace("json", "", 1).strip()

        return json.loads(text)

    except Exception as e:
        print("Gemini error:", repr(e))
        raise HTTPException(status_code=500, detail="Roadmap generation failed. Check backend console.")
