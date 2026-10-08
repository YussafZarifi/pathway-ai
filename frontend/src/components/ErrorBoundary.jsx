import { Component } from "react";

/**
 * Last line of defence for rendering errors (ROADMAP F-12): instead of a
 * blank page, an honest message with a way back. Logs only the error's
 * name, never props or data (they may hold quiz answers or notes).
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error("[PathwayAI] Page error:", error?.name || "Error");
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="dashMain">
        <section className="dashCard dashEmpty" role="alert">
          <h1 className="dashEmptyTitle">Something went wrong on this page</h1>
          <p className="dashEmptyText">
            Your saved roadmap and progress are safe. Reload the page, or go back to your home.
          </p>
          <div className="notFoundActions">
            <button type="button" className="homePrimaryBtn" onClick={() => window.location.reload()}>
              Reload the page
            </button>
            <a className="ghostBtn" href="/home">
              Go to your home
            </a>
          </div>
        </section>
      </main>
    );
  }
}
