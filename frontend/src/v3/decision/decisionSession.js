const SNAPSHOT_KEY = "brick_alpha_v3_decision_snapshot";

let memorySnapshot = null;

function persistable(snapshot) {
  if (!snapshot) {
    return snapshot;
  }
  const imageUrl = String(snapshot.imageUrl || "");
  if (imageUrl.startsWith("data:")) {
    return { ...snapshot, imageUrl: "" };
  }
  return snapshot;
}

export function saveDecisionSnapshot(snapshot) {
  memorySnapshot = snapshot;
  try {
    window.sessionStorage.setItem(SNAPSHOT_KEY, JSON.stringify(persistable(snapshot)));
  } catch {
    // Quota or private mode — the in-memory snapshot still serves this session.
  }
}

export function clearDecisionSnapshot() {
  memorySnapshot = null;
  try {
    window.sessionStorage.removeItem(SNAPSHOT_KEY);
  } catch {
    // The in-memory snapshot is already cleared.
  }
}

export function readDecisionSnapshot() {
  if (memorySnapshot) {
    return memorySnapshot;
  }
  try {
    const raw = window.sessionStorage.getItem(SNAPSHOT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
