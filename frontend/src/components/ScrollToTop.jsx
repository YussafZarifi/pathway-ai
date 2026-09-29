import { useLayoutEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * Starts every page at the top. BrowserRouter keeps the window's scroll
 * position across route changes, so without this a phone user who taps
 * "Generate roadmap" at the bottom of Results lands halfway down the
 * dashboard (TD-51). Runs before paint, so the old position never shows.
 */
export default function ScrollToTop() {
  const { pathname } = useLocation();

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}
