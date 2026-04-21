export interface Profile {
  id:   string;
  name: string;
}

const PROFILES_KEY = "gtp_profiles";
const ACTIVE_KEY   = "gtp_active";

export function getProfiles(): Profile[] {
  try { return JSON.parse(localStorage.getItem(PROFILES_KEY) ?? "[]"); }
  catch { return []; }
}

export function getActiveId(): string {
  return localStorage.getItem(ACTIVE_KEY) ?? "";
}

export function getActiveProfile(): Profile | null {
  const id = getActiveId();
  return getProfiles().find(p => p.id === id) ?? null;
}

// Namespace any localStorage key under the active profile.
export function profileKey(dataKey: string): string {
  const id = getActiveId();
  return `gtp_${id || "default"}_${dataKey}`;
}

export function createProfile(name: string): Profile {
  const slug = name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "") || "player";
  const id   = `${slug}_${Date.now()}`;
  const p: Profile = { id, name };
  localStorage.setItem(PROFILES_KEY, JSON.stringify([...getProfiles(), p]));
  return p;
}

export function setActiveProfile(id: string): void {
  localStorage.setItem(ACTIVE_KEY, id);
}

export function renameProfile(id: string, name: string): void {
  localStorage.setItem(PROFILES_KEY, JSON.stringify(
    getProfiles().map(p => p.id === id ? { ...p, name } : p),
  ));
}

export function deleteProfile(id: string): void {
  localStorage.setItem(PROFILES_KEY, JSON.stringify(getProfiles().filter(p => p.id !== id)));
  const toDelete: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(`gtp_${id}_`)) toDelete.push(k);
  }
  toDelete.forEach(k => localStorage.removeItem(k));
}

// Ensure at least one profile exists and active ID is valid. Call on app boot.
export function ensureProfiles(): Profile[] {
  let profiles = getProfiles();
  if (profiles.length === 0) {
    const p = createProfile("Player 1");
    setActiveProfile(p.id);
    profiles = [p];
  } else {
    const id = getActiveId();
    if (!id || !profiles.find(p => p.id === id)) {
      setActiveProfile(profiles[0].id);
    }
  }
  return getProfiles();
}
