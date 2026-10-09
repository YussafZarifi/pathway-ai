"""Small text PDFs and a deterministic evidence-only Gemini response."""

from io import BytesIO

from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject

from resume_scoring import rubric_for

CAREER = "Data Analyst"
SKILLS = ["SQL", "Tableau"]
STEPS = ["SQL foundations", "Python for data", "Dashboards with Tableau"]
RESUME_PAGES = [
    """Résumé
Email: jane.resume@example.com
Skills
SQL, Python
Projects
Built a SQL dashboard that improved weekly reporting accuracy by 20%.
Experience
Coordinated a five-person volunteer team for a community event.
Education
BSc in Statistics, 2024.
Coursework: regression, probability, and data visualization.
2023 - 2024
Led a reporting project for a student group.
Certifications
Google Data Analytics Certificate.""",
    """Additional projects
Created a data-cleaning workflow with Python and SQL.
Reviewed results with a cross-functional team.""",
]


def make_pdf(size=4096, pages=None):
    """Create a valid PDF fixture, padding before EOF to test exact body sizes."""
    page_texts = list(RESUME_PAGES if pages is None else pages)
    page_texts[-1] += "\nSource-only fixture marker: RESUME-CONTENT-private-fixture-marker"
    writer = PdfWriter()
    font = DictionaryObject({
        NameObject("/Type"): NameObject("/Font"),
        NameObject("/Subtype"): NameObject("/Type1"),
        NameObject("/BaseFont"): NameObject("/Helvetica"),
        NameObject("/Encoding"): NameObject("/WinAnsiEncoding"),
    })
    font_ref = writer._add_object(font)
    for source in page_texts:
        page = writer.add_blank_page(width=612, height=792)
        page[NameObject("/Resources")] = DictionaryObject({
            NameObject("/Font"): DictionaryObject({NameObject("/F1"): font_ref}),
        })
        rows = []
        for line in source.splitlines():
            safe = line.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
            rows.append(f"({safe}) Tj 0 -16 Td")
        stream = DecodedStreamObject()
        stream.set_data(("BT /F1 10 Tf 72 740 Td " + " ".join(rows) + " ET").encode("cp1252"))
        page[NameObject("/Contents")] = writer._add_object(stream)
    output = BytesIO()
    writer.write(output)
    data = output.getvalue()
    startxref = data.rfind(b"startxref")
    padding = max(0, size - len(data) - 2)
    if startxref >= 0 and padding:
        data = data[:startxref] + b"\n" + b" " * padding + b"\n" + data[startxref:]
    return data


def reply(career=CAREER, skills=SKILLS, steps=STEPS, **overrides):
    rubric = rubric_for(career, skills)
    quote_by_id = {
        "skill_1": "Skills\nSQL, Python\nProjects\nBuilt a SQL dashboard that improved weekly reporting accuracy by 20%.",
        "relevant_project": "Built a SQL dashboard that improved weekly reporting accuracy by 20%.",
        "project_technology": "Built a SQL dashboard that improved weekly reporting accuracy by 20%.",
        "project_outcome": "Built a SQL dashboard that improved weekly reporting accuracy by 20%.",
        "education_entry": "BSc in Statistics, 2024.",
        "relevant_coursework": "Coursework: regression, probability, and data visualization.",
        "education_detail": "BSc in Statistics, 2024.",
        "standard_sections": "Projects\nBuilt a SQL dashboard that improved weekly reporting accuracy by 20%.",
        "date_consistency": "2023 - 2024\nLed a reporting project for a student group.",
        "bullet_readability": "Led a reporting project for a student group.",
        "action_language": "Led a reporting project for a student group.",
        "teamwork_evidence": "Coordinated a five-person volunteer team for a community event.",
        "relevant_certification": "Google Data Analytics Certificate.",
        "credential_context": "Google Data Analytics Certificate.",
        "standard_headings": "Education\nBSc in Statistics, 2024.",
        "keyword_coverage": "Skills\nSQL, Python\nProjects\nBuilt a SQL dashboard that improved weekly reporting accuracy by 20%.",
    }
    evaluations = []
    for category in rubric["categories"]:
        for criterion in category["criteria"]:
            criterion_id = criterion["id"]
            if criterion_id in {"contact_information", "text_parseability"}:
                continue
            quote = quote_by_id.get(criterion_id)
            evaluations.append({
                "criterion_id": criterion_id,
                "found": bool(quote),
                "evidence": ([{"source": "resume_text", "page": 1, "quote": quote}] if quote else []),
                "note": ("This evidence supports the listed criterion." if quote
                         else "No explicit evidence for this criterion was found in the resume text."),
            })
    missing_skills = [item["criterion_id"] for item in evaluations
                      if item["criterion_id"].startswith("skill_") and not item["found"]]
    data = {
        "is_resume": True,
        "summary": "The resume shows applied data work and an education foundation, with room to document more project outcomes.",
        "evaluations": evaluations,
        "recommendations": [
            {"title": "Publish a project demo", "action": "Deploy a project and add its public demo link.",
             "criterion_ids": ["project_demo"]},
            {"title": "Show Tableau evidence", "action": "Add a truthful Tableau example to a project or skills section.",
             "criterion_ids": missing_skills[:1] or ["project_demo"]},
        ],
        "skill_roadmap": [
            {"skill_id": item["id"], "step_positions": [1 if item["id"] == "skill_1" else 3]}
            for category in rubric["categories"] if category["id"] == "skills"
            for item in category["criteria"]
        ],
    }
    data.update(overrides)
    return data
