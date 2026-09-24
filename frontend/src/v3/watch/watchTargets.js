const STORAGE_KEY = "brick_alpha_v3_watch_targets";

function memory() {
  return [];
}

export function readWatchTargets(storage) {
  if (!storage) {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return memory();
    }
  }
  return Array.isArray(storage) ? storage : [];
}

export function writeWatchTargets(targets, storage) {
  const next = Array.isArray(targets) ? targets : [];
  if (!storage) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // The caller still holds the list for this session.
    }
  }
  return next;
}

export function upsertWatchTarget(targets, target) {
  const list = Array.isArray(targets) ? targets : [];
  const id = target.setNumber || target.collectibleId || target.name;
  const next = {
    id,
    setNumber: target.setNumber || "",
    name: target.name || "LEGO set",
    collectibleId: target.collectibleId || "",
    currentValue: target.currentValue ?? null,
    targetBuyPrice: target.targetBuyPrice,
    targetVerdict: target.targetVerdict || "",
    retirementState: target.retirementState || "",
    createdAt: target.createdAt || new Date().toISOString(),
  };
  const without = list.filter((item) => item.id !== id);
  return [next, ...without];
}

export function applyWatchTriggers(targets, liveValueBySet = {}) {
  return (targets || []).map((target) => {
    const live = liveValueBySet[target.setNumber];
    const current = live == null ? target.currentValue : live;
    const price = Number(target.targetBuyPrice);
    const value = Number(current);
    const triggered = Number.isFinite(price) && Number.isFinite(value) && value <= price;
    return {
      ...target,
      currentValue: Number.isFinite(value) ? value : null,
      triggered,
    };
  });
}
