"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { detectSignature } from "@/app/lib/media-policy";

type Props = {
  csrf: string;
  onClose: () => void;
  onUploaded: () => void;
};

const ACCEPTED = "image/jpeg,image/png,image/webp";
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export default function MediaUploadDialog({ csrf, onClose, onUploaded }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [consentNote, setConsentNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleBackdrop = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setError(null);
      const selected = e.target.files?.[0] ?? null;

      if (!selected) {
        setFile(null);
        return;
      }

      if (!ALLOWED_TYPES.has(selected.type)) {
        setError("Only JPEG, PNG, and WebP images are allowed.");
        return;
      }

      if (selected.size > MAX_BYTES) {
        setError("Image must be 5 MB or smaller.");
        return;
      }

      setFile(selected);
    },
    [],
  );

  const handleUpload = useCallback(async () => {
    if (!file) return;

    setUploading(true);
    setError(null);

    try {
      const arrayBuf = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuf);

      const signature = detectSignature(bytes);
      if (!signature) {
        setError("Unsupported file format.");
        setUploading(false);
        return;
      }
      if (signature !== file.type) {
        setError("Declared type does not match file content.");
        setUploading(false);
        return;
      }

      const formData = new FormData();
      formData.append("file", file);
      formData.append("purpose", "gallery");
      if (consentNote.trim()) {
        formData.append("consentNote", consentNote.trim());
      }

      const uploadRes = await fetch("/api/admin/media", {
        method: "POST",
        headers: { "x-csrf-token": csrf },
        body: formData,
      });

      const uploadData = (await uploadRes.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
        id?: string;
        version?: number;
      } | null;

      if (!uploadRes.ok || !uploadData?.success) {
        setError(uploadData?.error ?? "Upload failed.");
        setUploading(false);
        return;
      }

      const assetId = uploadData.id;
      const assetVersion = uploadData.version ?? 1;

      if (assetId) {
        const patchRes = await fetch(
          `/api/admin/media/library/${encodeURIComponent(assetId)}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              "x-csrf-token": csrf,
            },
            body: JSON.stringify({
              lifecycleStatus: "DRAFT",
              status: "NEEDS_REVIEW",
              isVisible: 0,
              expectedVersion: assetVersion,
            }),
          },
        );

        const patchData = (await patchRes.json().catch(() => null)) as {
          success?: boolean;
          error?: string;
        } | null;

        if (!patchRes.ok || !patchData?.success) {
          setError(patchData?.error ?? "Upload succeeded but failed to set draft status.");
          setUploading(false);
          return;
        }
      }

      onUploaded();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
      setUploading(false);
    }
  }, [file, consentNote, csrf, onUploaded, onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Upload Gallery Media"
      onClick={handleBackdrop}
      ref={dialogRef}
      tabIndex={-1}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1500,
        outline: "none",
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          padding: 24,
          width: "100%",
          maxWidth: 500,
          maxHeight: "90vh",
          overflowY: "auto",
          position: "relative",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            background: "none",
            border: "none",
            fontSize: 20,
            cursor: "pointer",
            padding: "4px 8px",
            borderRadius: 4,
            color: "#64748b",
            lineHeight: 1,
          }}
          aria-label="Close"
        >
          ✕
        </button>

        <h2 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 20px" }}>
          Upload Gallery Media
        </h2>

        <label style={{ display: "block", marginBottom: 14 }}>
          <span style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
            Image File
          </span>
          <input
            type="file"
            accept={ACCEPTED}
            onChange={handleFileChange}
            disabled={uploading}
            style={{
              width: "100%",
              padding: "8px 12px",
              border: "1px solid var(--border)",
              borderRadius: 6,
              fontSize: 14,
            }}
          />
        </label>

        {file && !uploading && (
          <p style={{ fontSize: 13, color: "#475569", margin: "0 0 14px" }}>
            {file.name} ({(file.size / (1024 * 1024)).toFixed(2)} MB)
          </p>
        )}

        <label style={{ display: "block", marginBottom: 14 }}>
          <span style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
            Consent Note (optional)
          </span>
          <textarea
            maxLength={1000}
            rows={3}
            value={consentNote}
            onChange={(e) => setConsentNote(e.target.value)}
            disabled={uploading}
            placeholder="Optional consent or licensing note for this image"
            style={{
              width: "100%",
              padding: "8px 12px",
              border: "1px solid var(--border)",
              borderRadius: 6,
              resize: "vertical",
              fontSize: 14,
              boxSizing: "border-box",
            }}
          />
        </label>

        {error && (
          <p
            role="alert"
            style={{ color: "red", fontSize: 13, marginBottom: 12 }}
          >
            {error}
          </p>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="button secondary" onClick={onClose} disabled={uploading}>
            Cancel
          </button>
          <button
            className="button primary"
            onClick={handleUpload}
            disabled={uploading || !file}
          >
            {uploading ? "Uploading\u2026" : "Upload"}
          </button>
        </div>
      </div>
    </div>
  );
}
