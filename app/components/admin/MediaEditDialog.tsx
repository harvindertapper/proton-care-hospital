"use client";

import { useState, useCallback, useEffect } from "react";
import type { MediaAssetDto } from "./admin-media-types";
import { patchMediaAsset, AdminApiError } from "./admin-media-api";

const CATEGORIES = ["GENERAL", "GALLERY", "DOCTOR", "BLOG", "VIDEO_POSTER"] as const;
const RIGHTS_STATUSES = ["UNVERIFIED", "VERIFIED_INTERNAL", "LICENSED", "PUBLIC_DOMAIN"] as const;
const STATUSES = ["NEW", "NEEDS_REVIEW", "APPROVED", "HIDDEN"] as const;
const LIFECYCLE_STATUSES = ["DRAFT", "IN_REVIEW", "PUBLISHED", "HIDDEN", "ARCHIVED"] as const;

type EditableFields = {
  title: string;
  altText: string;
  caption: string;
  category: string;
  rightsStatus: string;
  rightsSource: string;
  sourceUrl: string;
  status: string;
  isVisible: number;
  lifecycleStatus: string;
};

type Props = {
  asset: MediaAssetDto;
  csrf: string;
  onClose: () => void;
  onSaved: (updated: MediaAssetDto) => void;
};

function buildInitial(asset: MediaAssetDto): EditableFields {
  return {
    title: asset.title,
    altText: asset.altText,
    caption: asset.caption,
    category: asset.category,
    rightsStatus: asset.rightsStatus,
    rightsSource: asset.rightsSource,
    sourceUrl: asset.sourceUrl ?? "",
    status: asset.status,
    isVisible: asset.isVisible,
    lifecycleStatus: asset.lifecycleStatus,
  };
}

function pickChanged(original: EditableFields, current: EditableFields): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const keys = Object.keys(current) as (keyof EditableFields)[];
  for (const k of keys) {
    if (current[k] !== original[k]) {
      patch[k] = current[k];
    }
  }
  return patch;
}

export default function MediaEditDialog({ asset, csrf, onClose, onSaved }: Props) {
  const initial = buildInitial(asset);
  const [form, setForm] = useState<EditableFields>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const set = useCallback(
    <K extends keyof EditableFields>(key: K, value: EditableFields[K]) => {
      setForm((prev) => {
        const next = { ...prev, [key]: value };

        if (key === "lifecycleStatus") {
          if (value === "PUBLISHED") {
            if (next.status !== "APPROVED") next.status = "APPROVED";
            if (next.isVisible !== 1) next.isVisible = 1;
          } else if (value === "ARCHIVED") {
            if (next.isVisible !== 0) next.isVisible = 0;
          }
        }

        return next;
      });
    },
    [],
  );

  const handleBackdrop = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    const changed = pickChanged(initial, form);
    if (Object.keys(changed).length === 0) {
      setError("No changes to save.");
      setSaving(false);
      return;
    }

    try {
      const result = await patchMediaAsset(csrf, asset.id, asset.version, changed);
      setSuccess("Saved.");
      onSaved(result.item);
    } catch (err) {
      if (err instanceof AdminApiError && err.status === 409) {
        setError("Stale version conflict. " + err.message);
      } else {
        setError(err instanceof Error ? err.message : "Save failed.");
      }
    } finally {
      setSaving(false);
    }
  }, [csrf, asset.id, asset.version, initial, form, onSaved]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Edit media asset"
      onClick={handleBackdrop}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1500,
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          padding: 24,
          width: "100%",
          maxWidth: 600,
          maxHeight: "90vh",
          overflowY: "auto",
          position: "relative",
        }}
      >
        <button
          onClick={onClose}
          className="button secondary small"
          aria-label="Close"
          style={{ position: "absolute", top: 12, right: 12 }}
        >
          ✕
        </button>

        <h2 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 20px" }}>
          Edit Media Asset
        </h2>

        <label style={{ display: "block", marginBottom: 14 }}>
          <span style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
            Title
          </span>
          <input
            type="text"
            maxLength={200}
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 6 }}
          />
        </label>

        <label style={{ display: "block", marginBottom: 14 }}>
          <span style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
            Alt Text
          </span>
          <input
            type="text"
            maxLength={300}
            value={form.altText}
            onChange={(e) => set("altText", e.target.value)}
            style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 6 }}
          />
        </label>

        <label style={{ display: "block", marginBottom: 14 }}>
          <span style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
            Caption
          </span>
          <textarea
            maxLength={1000}
            rows={3}
            value={form.caption}
            onChange={(e) => set("caption", e.target.value)}
            style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 6, resize: "vertical" }}
          />
        </label>

        <label style={{ display: "block", marginBottom: 14 }}>
          <span style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
            Category
          </span>
          <select
            value={form.category}
            onChange={(e) => set("category", e.target.value)}
            style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 6 }}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>

        <label style={{ display: "block", marginBottom: 14 }}>
          <span style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
            Rights Status
          </span>
          <select
            value={form.rightsStatus}
            onChange={(e) => set("rightsStatus", e.target.value)}
            style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 6 }}
          >
            {RIGHTS_STATUSES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </label>

        <label style={{ display: "block", marginBottom: 14 }}>
          <span style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
            Rights Source
          </span>
          <input
            type="text"
            maxLength={600}
            value={form.rightsSource}
            onChange={(e) => set("rightsSource", e.target.value)}
            style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 6 }}
          />
        </label>

        <label style={{ display: "block", marginBottom: 14 }}>
          <span style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
            Source URL
          </span>
          <input
            type="url"
            maxLength={1000}
            value={form.sourceUrl}
            onChange={(e) => set("sourceUrl", e.target.value)}
            placeholder="https://"
            style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 6 }}
          />
        </label>

        <label style={{ display: "block", marginBottom: 14 }}>
          <span style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
            Status
          </span>
          <select
            value={form.status}
            onChange={(e) => set("status", e.target.value)}
            style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 6 }}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>

        <label style={{ display: "block", marginBottom: 14 }}>
          <span style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
            Lifecycle Status
          </span>
          <select
            value={form.lifecycleStatus}
            onChange={(e) => set("lifecycleStatus", e.target.value)}
            style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 6 }}
          >
            {LIFECYCLE_STATUSES.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </label>

        <label
          style={{ marginBottom: 20, display: "flex", alignItems: "center", gap: 8 }}
        >
          <input
            type="checkbox"
            checked={form.isVisible === 1}
            onChange={(e) => set("isVisible", e.target.checked ? 1 : 0)}
          />
          <span style={{ fontSize: 13, fontWeight: 500 }}>Visible</span>
        </label>

        {error && <p style={{ color: "red", fontSize: 13, marginBottom: 12 }}>{error}</p>}
        {success && <p style={{ color: "green", fontSize: 13, marginBottom: 12 }}>{success}</p>}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="button secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="button primary" onClick={handleSave} disabled={saving}>
            {saving ? "Saving\u2026" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
