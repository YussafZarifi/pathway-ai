import { CloudUpload } from "lucide-react";
import { errorMessage } from "../lib/api";
import { useLocalImport } from "../lib/roadmaps/useLocalImport";

const IMPORT_FAILED =
  "We couldn't save it to your account right now. The copy on this device is unchanged. Please try again.";

/**
 * "Save the roadmap on this device to your account?" (ADR-019). Shown to
 * signed-in users when this browser still holds a guest roadmap. One click
 * imports it; "Not now" keeps it local and hides the offer for this session.
 */
export default function ImportRoadmapBanner({ enabled, onImported }) {
  const { candidate, busy, error, save, dismiss } = useLocalImport({ enabled, onImported });
  if (!candidate) return null;

  const { stored, done, total } = candidate;

  return (
    <section className="dashCard importBanner" aria-labelledby="importBannerTitle">
      <span className="importBannerIcon" aria-hidden="true">
        <CloudUpload size={20} />
      </span>
      <div className="importBannerText">
        <h2 id="importBannerTitle" className="importBannerTitle">
          Save the roadmap on this device to your account?
        </h2>
        <p className="importBannerBody">
          Your {stored.career} roadmap ({done} of {total} steps done) is saved only in this
          browser. Saving it to your account keeps it, with its progress, on every device where
          you sign in.
        </p>
        {error && (
          <p className="dashError" role="alert">
            {errorMessage(error, IMPORT_FAILED)}
          </p>
        )}
      </div>
      <div className="importBannerActions">
        <button type="button" className="dashBtn dashBtn--primary" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save to my account"}
        </button>
        <button type="button" className="dashBtn" onClick={dismiss} disabled={busy}>
          Not now
        </button>
      </div>
    </section>
  );
}
