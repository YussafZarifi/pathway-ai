// src/components/GeneratingLoader.jsx
export default function GeneratingLoader({ text = "Generating" }) {
  return (
    <div className="genLoaderWrap" role="status" aria-label={text}>
      <div className="genLoaderRing" />

      <div className="genLoaderText" aria-hidden="true">
        {text.split("").map((ch, i) => (
          <span key={i} className="genLetter" style={{ animationDelay: `${i * 0.1}s` }}>
            {ch}
          </span>
        ))}
      </div>
    </div>
  );
}
