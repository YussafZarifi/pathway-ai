const SESSION_KEY = "pathwayai_resume_session";
const PDF_KEY = "pathwayai_resume_pdf";
export const DEFAULT_RESUME_TARGET_LEVEL = "entry_level";

function storage() {
  try { return globalThis.sessionStorage; } catch { return null; }
}

function encode(bytes) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

export function restoreResumeSession() {
  const store = storage();
  if (!store) return null;
  try {
    const saved = JSON.parse(store.getItem(SESSION_KEY) || "null");
    if (!saved) return null;
    const encoded = store.getItem(PDF_KEY);
    const file = saved.file && encoded
      ? new File([Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0))], "resume.pdf", {
        type: saved.file.type,
        lastModified: saved.file.lastModified,
      })
      : null;
    return { ...saved, file, targetLevel: saved.targetLevel === "internship" ? "internship" : DEFAULT_RESUME_TARGET_LEVEL };
  } catch {
    store.removeItem(SESSION_KEY);
    store.removeItem(PDF_KEY);
    return null;
  }
}

const restored = restoreResumeSession();
export const resumeSession = restored || {
  userId: null,
  file: null,
  analysis: null,
  openId: null,
  selectedId: null,
  page: 1,
  scrollTop: 0,
  targetLevel: DEFAULT_RESUME_TARGET_LEVEL,
};

let pdfWrite = 0;

export function persistResumeSession() {
  const store = storage();
  if (!store) return;
  try {
    const { file, ...saved } = resumeSession;
    store.setItem(SESSION_KEY, JSON.stringify({ ...saved, file: file ? {
      type: file.type,
      lastModified: file.lastModified,
    } : null }));
  } catch {
    // Keep the in-memory session if this browser blocks or fills session storage.
  }
}

export async function persistResumeFile(file) {
  const store = storage();
  const write = ++pdfWrite;
  if (!store) return;
  try { store.removeItem(PDF_KEY); } catch { return; }
  if (!file) {
    persistResumeSession();
    return;
  }
  try {
    const encoded = encode(new Uint8Array(await file.arrayBuffer()));
    if (write !== pdfWrite || resumeSession.file !== file) return;
    store.setItem(PDF_KEY, encoded);
    persistResumeSession();
  } catch {
    // File remains available for the current page even if session storage is unavailable.
  }
}

export function resetResumeSession() {
  pdfWrite += 1;
  Object.assign(resumeSession, {
    userId: null,
    file: null,
    analysis: null,
    openId: null,
    selectedId: null,
    page: 1,
    scrollTop: 0,
    targetLevel: DEFAULT_RESUME_TARGET_LEVEL,
  });
  const store = storage();
  try {
    store?.removeItem(SESSION_KEY);
    store?.removeItem(PDF_KEY);
  } catch { /* In-memory reset still applies. */ }
}

export function resumeDemoSource(isDevelopment, enabled, url) {
  return isDevelopment && enabled === "true" ? url : "";
}
