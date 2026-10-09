import { DollarSign, TrendingUp, GraduationCap, Briefcase } from "lucide-react";
import Dialog from "./Dialog";

// Side-by-side comparison of 2–3 career matches, in the shared accessible
// dialog (Esc, focus trap and focus return from the browser; TD-20).
const FIELDS = [
  { key: "salary", label: "Salary range (AI estimate)", icon: DollarSign, get: (c) => c.salary_range },
  { key: "growth", label: "Job growth (AI estimate)", icon: TrendingUp, get: (c) => c.growth_rate },
  { key: "education", label: "Education", icon: GraduationCap, get: (c) => c.education },
  { key: "skills", label: "Top skills", icon: Briefcase, get: (c) => c.skills?.slice(0, 4).join(", ") },
];

export default function CareerCompareModal({ isOpen, onClose, selectedCareers, careerData }) {
  const careers = selectedCareers
    .map((title) => careerData.find((c) => c.title === title))
    .filter(Boolean);

  return (
    <Dialog
      isOpen={isOpen && careers.length > 0}
      onClose={onClose}
      title="Compare careers"
      wide
      actions={
        <button type="button" className="dashBtn" onClick={onClose}>
          Close
        </button>
      }
    >
      <div className="compareGrid">
        {careers.map((career) => (
          <div key={career.title} className="compareColumn">
            <h3 className="compareCareerTitle">{career.title}</h3>
            {career.reason && <p className="compareCareerReason">{career.reason}</p>}
            {FIELDS.map(({ key, label, icon, get }) => {
              const Icon = icon;
              const value = get(career);
              // Fields the AI didn't fill are left out rather than shown as "N/A" (TD-56).
              if (!value) return null;
              return (
                <div key={key} className="compareField">
                  <div className="compareFieldLabel">
                    <Icon size={16} aria-hidden="true" />
                    {label}
                  </div>
                  <div className="compareFieldValue">{value}</div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </Dialog>
  );
}
