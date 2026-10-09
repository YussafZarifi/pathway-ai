export default function FeatureHeading({ icon, eyebrow, title, description, context }) {
  return (
    <header className="featureHeading">
      <div className="featureHeadingIcon" aria-hidden="true">{icon}</div>
      <div className="featureHeadingCopy">
        <p className="featureEyebrow">{eyebrow}</p>
        <h1 className="featureTitle">{title}</h1>
        <p className="featureDescription">{description}</p>
      </div>
      {context && (
        <div className="featureContext">
          <span className="featureContextDot" aria-hidden="true" />
          <span>{context}</span>
        </div>
      )}
    </header>
  );
}
