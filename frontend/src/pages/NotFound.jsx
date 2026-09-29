import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Compass, ArrowRight } from "lucide-react";
import AppHeader from "../components/AppHeader";

// Catch-all route (F-12). The static host rewrites every path to
// index.html, so without this an unknown URL rendered a blank page.
export default function NotFound() {
  const navigate = useNavigate();

  useEffect(() => {
    document.body.classList.add("theme-landing");
    document.title = "Page not found · PathwayAI";
    return () => {
      document.body.classList.remove("theme-landing");
      document.title = "PathwayAI";
    };
  }, []);

  return (
    <div className="homePage">
      <AppHeader />
      <main className="dashMain">
        <section className="dashCard dashEmpty notFound" aria-labelledby="notFoundTitle">
          <span className="dashEmptyIcon" aria-hidden="true">
            <Compass size={26} />
          </span>
          <p className="notFoundCode" aria-hidden="true">404</p>
          <h1 className="dashEmptyTitle" id="notFoundTitle">
            This page isn't on the map
          </h1>
          <p className="dashEmptyText">
            The link may be mistyped or out of date. Head home, or take the quiz to find your
            tech career path.
          </p>
          <div className="notFoundActions">
            <button type="button" className="homePrimaryBtn" onClick={() => navigate("/home")}>
              Return home
            </button>
            <button type="button" className="ghostBtn" onClick={() => navigate("/quiz")}>
              Take the quiz
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
