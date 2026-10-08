import { motion } from "framer-motion";
import { X, DollarSign, TrendingUp, GraduationCap, Briefcase, Target } from "lucide-react";

export default function CareerCompareModal({ isOpen, onClose, selectedCareers, careerData }) {
  if (!isOpen) return null;

  const careersToCompare = selectedCareers
    .map((title) => careerData.find((c) => c.title === title))
    .filter(Boolean);

  if (careersToCompare.length === 0) {
    return null;
  }

  const comparisonFields = [
    {
      key: "salary",
      label: "Salary Range",
      icon: DollarSign,
      getValue: (career) => career.salary_range || career.salaryRange || "N/A"
    },
    {
      key: "growth",
      label: "Job Growth",
      icon: TrendingUp,
      getValue: (career) => career.growth_rate || career.growthRate || "N/A"
    },
    {
      key: "education",
      label: "Education Required",
      icon: GraduationCap,
      getValue: (career) => career.education || "N/A"
    },
    {
      key: "skills",
      label: "Top Skills",
      icon: Briefcase,
      getValue: (career) => career.skills?.slice(0, 4).join(", ") || "N/A"
    },
    {
      key: "environment",
      label: "Work Environment",
      icon: Target,
      getValue: (career) => career.work_environment || career.workEnvironment || "N/A"
    }
  ];

  return (
    <motion.div
      className="compareModalOverlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="compareModalContent"
        initial={{ scale: 0.95, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 20 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="compareModalHeader">
          <h2 className="compareModalTitle">Compare Careers</h2>
          <button className="compareModalClose" onClick={onClose}>
            <X size={24} />
          </button>
        </div>

        <div className="compareModalBody">
          <div className="compareGrid">
            {careersToCompare.map((career) => (
              <div key={career.title} className="compareColumn">
                <h3 className="compareCareerTitle">{career.title}</h3>
                <p className="compareCareerReason">{career.reason}</p>

                {comparisonFields.map((field) => {
                  const Icon = field.icon;
                  return (
                    <div key={field.key} className="compareField">
                      <div className="compareFieldLabel">
                        <Icon size={16} />
                        {field.label}
                      </div>
                      <div className="compareFieldValue">{field.getValue(career)}</div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        <div className="compareModalFooter">
          <button className="ghostBtn large" onClick={onClose}>
            Close
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
