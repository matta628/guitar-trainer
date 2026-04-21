import { useEffect, useRef, useState } from "react";
import type { Screen } from "../types";
import {
  ensureProfiles, getProfiles, getActiveId, Profile,
  createProfile, setActiveProfile, renameProfile, deleteProfile,
  profileKey,
} from "../utils/profiles";
import { getAllUnlockedVoicings } from "../utils/voicings";

interface Props { onSelect: (screen: Screen) => void; }

function readProfileStats(id: string) {
  // Temporarily swap active ID to read that profile's scoped keys
  const prev = localStorage.getItem("gtp_active") ?? "";
  localStorage.setItem("gtp_active", id);
  const chords = Object.keys(getAllUnlockedVoicings()).length;
  const best   = parseInt(localStorage.getItem(profileKey("arcade_best")) ?? "0", 10);
  localStorage.setItem("gtp_active", prev);
  return { chords, best };
}

// ── Manage modal ──────────────────────────────────────────────────────────────
function ManageModal({ profile, canDelete, onClose, onUpdate, onDelete }: {
  profile: Profile;
  canDelete: boolean;
  onClose: () => void;
  onUpdate: () => void;
  onDelete: () => void;
}) {
  const [name, setName]           = useState(profile.name);
  const [confirming, setConfirming] = useState<"reset" | "delete" | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  function saveName() {
    if (name.trim() && name.trim() !== profile.name) {
      renameProfile(profile.id, name.trim());
      onUpdate();
    }
    onClose();
  }

  function resetData() {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(`gtp_${profile.id}_`)) keys.push(k);
    }
    keys.forEach(k => localStorage.removeItem(k));
    setConfirming(null);
    onUpdate();
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-title">Manage Profile</div>

        <label className="modal-label">Name</label>
        <input
          ref={inputRef}
          className="modal-input"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") saveName(); if (e.key === "Escape") onClose(); }}
        />

        <div className="modal-actions">
          <button className="btn btn-primary" onClick={saveName}>Save</button>
          <button className="btn btn-back" onClick={onClose}>Cancel</button>
        </div>

        <div className="modal-divider" />

        {confirming === "reset" ? (
          <div className="modal-confirm-row">
            <span className="modal-confirm-text">Reset all data for {profile.name}?</span>
            <button className="btn btn-danger" onClick={resetData}>Yes, reset</button>
            <button className="btn btn-back" onClick={() => setConfirming(null)}>Cancel</button>
          </div>
        ) : confirming === "delete" ? (
          <div className="modal-confirm-row">
            <span className="modal-confirm-text">Delete {profile.name}? This can't be undone.</span>
            <button className="btn btn-danger" onClick={onDelete}>Yes, delete</button>
            <button className="btn btn-back" onClick={() => setConfirming(null)}>Cancel</button>
          </div>
        ) : (
          <div className="modal-danger-row">
            <button className="btn btn-danger-ghost" onClick={() => setConfirming("reset")}>
              Reset data…
            </button>
            {canDelete && (
              <button className="btn btn-danger-ghost" onClick={() => setConfirming("delete")}>
                Delete profile…
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Home ──────────────────────────────────────────────────────────────────────
export default function Home({ onSelect }: Props) {
  const [profiles, setProfiles]     = useState(() => ensureProfiles());
  const [activeId, setActiveId]     = useState(() => getActiveId());
  const [dropdownOpen, setDropdown] = useState(false);
  const [managing, setManaging]     = useState<Profile | null>(null);
  const [addingNew, setAddingNew]   = useState(false);
  const [newName, setNewName]       = useState("");
  const newInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const active = profiles.find(p => p.id === activeId) ?? profiles[0];

  useEffect(() => { if (addingNew) newInputRef.current?.focus(); }, [addingNew]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    function handler(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdown(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dropdownOpen]);

  function switchTo(id: string) {
    setActiveProfile(id);
    setActiveId(id);
    setDropdown(false);
    setAddingNew(false);
  }

  function refresh() {
    setProfiles(getProfiles());
  }

  function confirmAdd() {
    if (!newName.trim()) { setAddingNew(false); return; }
    const p = createProfile(newName.trim());
    refresh();
    setNewName("");
    setAddingNew(false);
    switchTo(p.id);
  }

  function handleDeleteFromManage(id: string) {
    if (profiles.length <= 1) return;
    deleteProfile(id);
    const remaining = getProfiles();
    setProfiles(remaining);
    if (activeId === id) switchTo(remaining[0].id);
    setManaging(null);
  }

  const others = profiles.filter(p => p.id !== active?.id);

  return (
    <div className="home">

      {/* ── Topbar ── */}
      <div className="home-topbar">
        <span className="home-topbar-title">Guitar Trainer</span>

        <div className="profile-dropdown-anchor" ref={dropdownRef}>
          <button
            className="profile-pill"
            onClick={() => setDropdown(v => !v)}
          >
            <span className="profile-pill-name">{active?.name ?? "Player"}</span>
            <span className="profile-pill-caret">{dropdownOpen ? "▲" : "▼"}</span>
          </button>

          {dropdownOpen && (
            <div className="profile-dropdown">

              {/* Active profile row */}
              <div className="profile-drop-row profile-drop-row-active">
                <span className="profile-drop-name">{active?.name}</span>
                {(() => { const s = readProfileStats(active.id); return (
                  <span className="profile-drop-stats">{s.chords} chords · best {s.best}</span>
                ); })()}
                <button
                  className="profile-drop-gear"
                  title="Manage profile"
                  onClick={e => { e.stopPropagation(); setDropdown(false); setManaging(active); }}
                >⚙</button>
              </div>

              {/* Other profiles */}
              {others.map(p => {
                const s = readProfileStats(p.id);
                return (
                  <button key={p.id} className="profile-drop-row profile-drop-row-other" onClick={() => switchTo(p.id)}>
                    <span className="profile-drop-name">{p.name}</span>
                    <span className="profile-drop-stats">{s.chords} chords · best {s.best}</span>
                  </button>
                );
              })}

              <div className="profile-drop-divider" />

              {/* Add profile */}
              {addingNew ? (
                <div className="profile-drop-add-row">
                  <input
                    ref={newInputRef}
                    className="profile-drop-input"
                    placeholder="Player name…"
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter") confirmAdd();
                      if (e.key === "Escape") { setAddingNew(false); setNewName(""); }
                    }}
                    onClick={e => e.stopPropagation()}
                  />
                  <button className="profile-drop-confirm" onClick={confirmAdd}>Add</button>
                </div>
              ) : (
                <button className="profile-drop-row profile-drop-row-add" onClick={() => setAddingNew(true)}>
                  + Add profile
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Main menu ── */}
      <div className="home-body">
        <div>
          <p className="home-subtitle">Choose your mode</p>
        </div>

        <div className="mode-grid">
          <button className="mode-card" onClick={() => onSelect("arcade")}>
            <span className="mode-card-icon">🎸</span>
            <span className="mode-card-name">Chord Arcade</span>
            <span className="mode-card-desc">
              Play chords against the clock. Streak multipliers, auto-leveling difficulty.
            </span>
          </button>

          <button className="mode-card" onClick={() => onSelect("scale")}>
            <span className="mode-card-icon">🎵</span>
            <span className="mode-card-name">Scale Trainer</span>
            <span className="mode-card-desc">
              Practice major pentatonic scales on an interactive fretboard.
            </span>
          </button>

          <button className="mode-card" onClick={() => onSelect("library")}>
            <span className="mode-card-icon">📖</span>
            <span className="mode-card-name">Chord Library</span>
            <span className="mode-card-desc">
              Browse all chord voicings. Cycle through shapes and set your preferred fingering.
            </span>
          </button>
        </div>
      </div>

      {/* ── Manage modal ── */}
      {managing && (
        <ManageModal
          profile={managing}
          canDelete={profiles.length > 1}
          onClose={() => setManaging(null)}
          onUpdate={refresh}
          onDelete={() => handleDeleteFromManage(managing.id)}
        />
      )}
    </div>
  );
}
