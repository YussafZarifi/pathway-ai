import { Link } from "react-router-dom";

// One footer for every page (P-1): who built PathwayAI and where to find
// the author and the About section.
export default function AppFooter() {
  return (
    <footer className="homeFooter appFooter">
      <span className="homeFooterCopyright">© {new Date().getFullYear()} PathwayAI</span>
      <span className="appFooterDot" aria-hidden="true">·</span>
      <span className="homeFooterCopyright">
        Built by Yussaf Zarifi ·{" "}
        <a className="appFooterLink" href="https://github.com/YussafZarifi" target="_blank" rel="noopener noreferrer">
          GitHub
        </a>
      </span>
      <span className="appFooterDot" aria-hidden="true">·</span>
      <Link className="appFooterLink" to="/#about">
        About
      </Link>
    </footer>
  );
}
