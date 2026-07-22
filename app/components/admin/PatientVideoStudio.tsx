"use client";

import React, { useMemo, useRef, useState, useCallback, useEffect } from "react";
import {
  Play,
  X,
  Eye,
  EyeOff,
  Archive,
  RotateCcw,
  ExternalLink,
  Search,
  XCircle,
  Film,
  CheckCircle,
  AlertCircle,
  Plus,
} from "lucide-react";
import {
  resolveYouTubeIdWithType,
  thumbnailUrl,
  embedUrl,
} from "@/app/lib/youtube";

/* -------------------------------------------------------------------------- */
/*                                  Types                                     */
/* -------------------------------------------------------------------------- */

type Props = {
  busy: boolean;
  csrf: string;
  videos: Record<string, string | number | null>[];
  onSave: (payload: Record<string, unknown>) => Promise<void>;
  onPublish: (id: string) => Promise<void>;
  onHide: (id: string) => Promise<void>;
  onArchive: (id: string) => Promise<void>;
  onRestore: (id: string) => Promise<void>;
};

type Lifecycle = "live" | "hidden" | "archived";

type FormState = {
  title: string;
  youtubeUrl: string;
  consentNote: string;
};

type FormErrors = {
  title: string;
  youtubeUrl: string;
  consentNote: string;
};

const EMPTY_FORM: FormState = { title: "", youtubeUrl: "", consentNote: "" };
const EMPTY_ERRORS: FormErrors = { title: "", youtubeUrl: "", consentNote: "" };

/* -------------------------------------------------------------------------- */
/*                              Helpers                                       */
/* -------------------------------------------------------------------------- */

function getLifecycle(row: Record<string, string | number | null>): Lifecycle {
  if (row.is_deleted === 1) return "archived";
  if (row.status === "APPROVED" && row.is_visible === 1) return "live";
  return "hidden";
}

function validateForm(form: FormState): FormErrors {
  const errors: FormErrors = { title: "", youtubeUrl: "", consentNote: "" };
  if (!form.title.trim()) errors.title = "Video title is required.";
  if (!form.youtubeUrl.trim()) {
    errors.youtubeUrl = "YouTube URL is required.";
  } else {
    const resolved = resolveYouTubeIdWithType({ youtubeUrl: form.youtubeUrl });
    if (!resolved) {
      errors.youtubeUrl =
        "Invalid YouTube URL. Use a watch, share, short, or embed URL.";
    }
  }
  if (form.consentNote.trim().length < 5) {
    errors.consentNote = "Consent note must be at least 5 characters.";
  }
  return errors;
}

function formHasChanges(a: FormState, b: FormState): boolean {
  return (
    a.title.trim() !== b.title.trim() ||
    a.youtubeUrl.trim() !== b.youtubeUrl.trim() ||
    a.consentNote.trim() !== b.consentNote.trim()
  );
}

function formatDate(value: string | number | null): string {
  if (!value) return "—";
  try {
    const d = new Date(String(value));
    return d.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return String(value);
  }
}

/* -------------------------------------------------------------------------- */
/*                              Inline Styles                                  */
/* -------------------------------------------------------------------------- */

const S = {
  /* studio wrapper */
  studio: {
    fontFamily: "inherit",
    color: "#1e293b",
  },

  /* header */
  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    marginBottom: 24,
    flexWrap: "wrap" as const,
  },
  headerTitle: {
    margin: 0,
    fontSize: 22,
    fontWeight: 700,
    color: "#0f172a",
    lineHeight: 1.3,
  },
  headerSub: {
    margin: 0,
    fontSize: 14,
    color: "#64748b",
    marginTop: 4,
  },

  /* summary cards */
  summary: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: 14,
    marginBottom: 24,
  },
  summaryCard: {
    background: "#ffffff",
    border: "1px solid #E2E8F0",
    borderRadius: 14,
    padding: "18px 20px",
    display: "flex",
    flexDirection: "column" as const,
    gap: 4,
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: 600,
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
    color: "#64748b",
  },
  summaryValue: {
    fontSize: 28,
    fontWeight: 700,
    lineHeight: 1.1,
  },

  /* filter bar */
  filters: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap" as const,
    marginBottom: 20,
    background: "#ffffff",
    border: "1px solid #E2E8F0",
    borderRadius: 14,
    padding: "12px 16px",
  },
  filterChips: {
    display: "flex",
    gap: 6,
    flexWrap: "wrap" as const,
  },
  chip: {
    padding: "6px 14px",
    borderRadius: 20,
    border: "1px solid #E2E8F0",
    background: "#f8fafc",
    fontSize: 13,
    fontWeight: 500,
    color: "#475569",
    cursor: "pointer",
    transition: "all 0.15s ease",
    lineHeight: 1.4,
  },
  chipActive: {
    padding: "6px 14px",
    borderRadius: 20,
    border: "1px solid #2563eb",
    background: "#2563eb",
    fontSize: 13,
    fontWeight: 600,
    color: "#ffffff",
    cursor: "pointer",
    transition: "all 0.15s ease",
    lineHeight: 1.4,
  },
  search: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    flex: 1,
    minWidth: 180,
    maxWidth: 320,
    background: "#f8fafc",
    border: "1px solid #E2E8F0",
    borderRadius: 10,
    padding: "6px 12px",
  },
  searchInput: {
    border: "none",
    outline: "none",
    background: "transparent",
    fontSize: 14,
    flex: 1,
    color: "#1e293b",
    fontFamily: "inherit",
    minWidth: 0,
  },
  resultCount: {
    fontSize: 13,
    color: "#94a3b8",
    whiteSpace: "nowrap" as const,
  },

  /* main content area */
  content: {
    display: "flex",
    gap: 24,
    alignItems: "flex-start",
  },

  /* editor panel */
  editor: {
    width: 400,
    minWidth: 320,
    flexShrink: 0,
    background: "#ffffff",
    border: "1px solid #E2E8F0",
    borderRadius: 18,
    padding: 24,
    position: "sticky" as const,
    top: 24,
  },
  editorTitle: {
    margin: "0 0 20px 0",
    fontSize: 16,
    fontWeight: 700,
    color: "#0f172a",
  },
  editorLabel: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 4,
    marginBottom: 16,
    fontSize: 13,
    fontWeight: 600,
    color: "#334155",
  },
  editorInput: {
    padding: "10px 12px",
    border: "1px solid #E2E8F0",
    borderRadius: 10,
    fontSize: 16,
    fontFamily: "inherit",
    color: "#1e293b",
    outline: "none",
    transition: "border-color 0.15s ease",
    width: "100%",
    boxSizing: "border-box" as const,
  },
  editorInputError: {
    padding: "10px 12px",
    border: "2px solid #ef4444",
    borderRadius: 10,
    fontSize: 16,
    fontFamily: "inherit",
    color: "#1e293b",
    outline: "none",
    width: "100%",
    boxSizing: "border-box" as const,
  },
  textarea: {
    padding: "10px 12px",
    border: "1px solid #E2E8F0",
    borderRadius: 10,
    fontSize: 16,
    fontFamily: "inherit",
    color: "#1e293b",
    outline: "none",
    resize: "vertical" as const,
    minHeight: 90,
    width: "100%",
    boxSizing: "border-box" as const,
  },
  textareaError: {
    padding: "10px 12px",
    border: "2px solid #ef4444",
    borderRadius: 10,
    fontSize: 16,
    fontFamily: "inherit",
    color: "#1e293b",
    outline: "none",
    resize: "vertical" as const,
    minHeight: 90,
    width: "100%",
    boxSizing: "border-box" as const,
  },
  error: {
    color: "#ef4444",
    fontSize: 12,
    marginTop: 3,
    fontWeight: 500,
  },
  valid: {
    color: "#059669",
    fontSize: 12,
    marginTop: 3,
    fontWeight: 500,
  },
  thumbPreview: {
    marginTop: 8,
    borderRadius: 10,
    overflow: "hidden",
    border: "1px solid #E2E8F0",
    maxHeight: 180,
  },
  thumbPreviewImg: {
    width: "100%",
    height: "auto",
    display: "block",
    objectFit: "cover" as const,
  },

  /* library */
  library: {
    flex: 1,
    minWidth: 0,
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
    gap: 18,
    alignContent: "start",
  },

  /* video card */
  card: {
    background: "#ffffff",
    border: "1px solid #E2E8F0",
    borderRadius: 18,
    overflow: "hidden",
    boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
    transition: "transform 0.2s ease, box-shadow 0.2s ease",
    cursor: "default",
  },
  cardMedia: {
    position: "relative" as const,
    width: "100%",
    paddingTop: "56.25%",
    background: "#0f172a",
    overflow: "hidden",
  },
  cardImg: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover" as const,
  },
  cardBadge: (lifecycle: Lifecycle): React.CSSProperties => {
    const base: React.CSSProperties = {
      position: "absolute",
      top: 10,
      left: 10,
      padding: "3px 10px",
      borderRadius: 6,
      fontSize: 11,
      fontWeight: 700,
      textTransform: "uppercase" as const,
      letterSpacing: "0.03em",
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      lineHeight: 1.3,
    };
    if (lifecycle === "live")
      return { ...base, background: "#d1fae5", color: "#065f46" };
    if (lifecycle === "hidden")
      return { ...base, background: "#fef3c7", color: "#92400e" };
    return { ...base, background: "#e2e8f0", color: "#475569" };
  },
  cardBody: {
    padding: "14px 16px 16px",
  },
  cardTitle: {
    margin: 0,
    fontSize: 15,
    fontWeight: 600,
    color: "#0f172a",
    lineHeight: 1.3,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  cardMeta: {
    fontSize: 12,
    color: "#94a3b8",
    marginTop: 4,
  },
  cardActions: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: 6,
    marginTop: 12,
  },

  /* buttons */
  button: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: "8px 14px",
    borderRadius: 10,
    border: "1px solid #E2E8F0",
    background: "#f8fafc",
    fontSize: 13,
    fontWeight: 500,
    color: "#334155",
    cursor: "pointer",
    transition: "all 0.15s ease",
    minHeight: 44,
    lineHeight: 1.3,
    fontFamily: "inherit",
  },
  buttonPrimary: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: "10px 20px",
    borderRadius: 10,
    border: "none",
    background: "#2563eb",
    fontSize: 14,
    fontWeight: 600,
    color: "#ffffff",
    cursor: "pointer",
    transition: "all 0.15s ease",
    minHeight: 44,
    lineHeight: 1.3,
    fontFamily: "inherit",
  },
  buttonDisabled: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: "10px 20px",
    borderRadius: 10,
    border: "none",
    background: "#93c5fd",
    fontSize: 14,
    fontWeight: 600,
    color: "#ffffff",
    cursor: "not-allowed",
    minHeight: 44,
    lineHeight: 1.3,
    fontFamily: "inherit",
  },
  buttonDanger: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: "8px 14px",
    borderRadius: 10,
    border: "1px solid #fecaca",
    background: "#fef2f2",
    fontSize: 13,
    fontWeight: 500,
    color: "#dc2626",
    cursor: "pointer",
    transition: "all 0.15s ease",
    minHeight: 44,
    lineHeight: 1.3,
    fontFamily: "inherit",
  },
  buttonSuccess: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: "8px 14px",
    borderRadius: 10,
    border: "1px solid #a7f3d0",
    background: "#ecfdf5",
    fontSize: 13,
    fontWeight: 500,
    color: "#059669",
    cursor: "pointer",
    transition: "all 0.15s ease",
    minHeight: 44,
    lineHeight: 1.3,
    fontFamily: "inherit",
  },

  /* preview modal */
  previewModal: {
    border: "none",
    borderRadius: 18,
    padding: 0,
    maxWidth: "90vw",
    width: 800,
    maxHeight: "90vh",
    overflow: "hidden",
    boxShadow: "0 25px 60px rgba(0,0,0,0.3)",
  },
  previewHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "16px 20px",
    borderBottom: "1px solid #E2E8F0",
    background: "#f8fafc",
  },
  previewTitle: {
    margin: 0,
    fontSize: 16,
    fontWeight: 600,
    color: "#0f172a",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
    flex: 1,
    marginRight: 12,
  },
  previewPlayer: {
    position: "relative" as const,
    width: "100%",
    paddingTop: "56.25%",
    background: "#000000",
  },
  previewIframe: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    border: "none",
  },

  /* notice banner */
  notice: (type: "success" | "error"): React.CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 16px",
    borderRadius: 10,
    fontSize: 13,
    fontWeight: 500,
    marginBottom: 16,
    background: type === "success" ? "#ecfdf5" : "#fef2f2",
    color: type === "success" ? "#059669" : "#dc2626",
    border: `1px solid ${type === "success" ? "#a7f3d0" : "#fecaca"}`,
  }),
};

/* -------------------------------------------------------------------------- */
/*                             Component                                      */
/* -------------------------------------------------------------------------- */

export default function PatientVideoStudio({
  busy,
  csrf,
  videos,
  onSave,
  onPublish,
  onHide,
  onArchive,
  onRestore,
}: Props) {
  /* ------------------------------------------------------------------ */
  /*  State                                                             */
  /* ------------------------------------------------------------------ */

  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<
    "all" | "live" | "hidden" | "archived"
  >("all");
  const [selectedVideo, setSelectedVideo] = useState<Record<string, string | number | null> | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<FormErrors>(EMPTY_ERRORS);
  const [previewVideo, setPreviewVideo] = useState<Record<string, string | number | null> | null>(null);
  const [notice, setNotice] = useState("");
  const [noticeType, setNoticeType] = useState<"success" | "error">("success");

  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const closingRef = useRef(false);

  /* ------------------------------------------------------------------ */
  /*  Derived state                                                     */
  /* ------------------------------------------------------------------ */

  const resolvedVideos = useMemo(() => {
    return videos.map((row): Record<string, string | number | null> & { _lifecycle: Lifecycle; _resolvedId: string; _sourceType: string } => {
      const resolvedId = resolveYouTubeIdWithType({
        youtubeUrl: String(row.youtube_url || ""),
      });
      return {
        ...row,
        _lifecycle: getLifecycle(row),
        _resolvedId: resolvedId?.id ?? "",
        _sourceType: resolvedId?.sourceType ?? "Unknown",
      };
    });
  }, [videos]);

  const counts = useMemo(() => {
    let total = 0;
    let live = 0;
    let hidden = 0;
    let archived = 0;
    for (const v of resolvedVideos) {
      total++;
      if (v._lifecycle === "live") live++;
      else if (v._lifecycle === "hidden") hidden++;
      else archived++;
    }
    return { total, live, hidden, archived };
  }, [resolvedVideos]);

  const filteredVideos = useMemo(() => {
    let result = resolvedVideos;
    if (activeFilter !== "all") {
      result = result.filter((v) => v._lifecycle === activeFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((v) =>
        String(v.title || "")
          .toLowerCase()
          .includes(q)
      );
    }
    return result;
  }, [resolvedVideos, activeFilter, searchQuery]);

  /* ------------------------------------------------------------------ */
  /*  Derived form state                                                */
  /* ------------------------------------------------------------------ */

  const isDirty = useMemo(() => {
    const initial: FormState = selectedVideo
      ? {
          title: String(selectedVideo.title || ""),
          youtubeUrl: String(selectedVideo.youtube_url || ""),
          consentNote: String(selectedVideo.consent_note || ""),
        }
      : EMPTY_FORM;
    return formHasChanges(form, initial);
  }, [form, selectedVideo]);

  const currentErrors = useMemo(() => validateForm(form), [form]);

  const canSave = isDirty && !currentErrors.title && !currentErrors.youtubeUrl && !currentErrors.consentNote && !busy;

  const resolved = useMemo(() => {
    if (!form.youtubeUrl.trim()) return null;
    return resolveYouTubeIdWithType({ youtubeUrl: form.youtubeUrl });
  }, [form.youtubeUrl]);

  /* ------------------------------------------------------------------ */
  /*  Notice helper                                                     */
  /* ------------------------------------------------------------------ */

  const showNotice = useCallback(
    (msg: string, type: "success" | "error") => {
      setNotice(msg);
      setNoticeType(type);
      if (type === "success") {
        setTimeout(() => setNotice(""), 5000);
      }
    },
    []
  );

  /* ------------------------------------------------------------------ */
  /*  Dialog open / close                                               */
  /* ------------------------------------------------------------------ */

  useEffect(() => {
    if (previewVideo && dialogRef.current) {
      closingRef.current = false;
      dialogRef.current.showModal();
    }
  }, [previewVideo]);

  const handleClosePreview = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setPreviewVideo(null);
    if (triggerRef.current) {
      triggerRef.current.focus();
    }
  }, []);

  /* ------------------------------------------------------------------ */
  /*  Form switching guard                                              */
  /* ------------------------------------------------------------------ */

  const guardDirty = useCallback((): boolean => {
    if (!isDirty) return true;
    return window.confirm("Discard unsaved video changes?");
  }, [isDirty]);

  /* ------------------------------------------------------------------ */
  /*  Handlers                                                         */
  /* ------------------------------------------------------------------ */

  const handleSelectVideo = useCallback(
    (row: Record<string, string | number | null>) => {
      if (!guardDirty()) return;
      setSelectedVideo(row);
      setIsCreating(false);
      setForm({
        title: String(row.title || ""),
        youtubeUrl: String(row.youtube_url || ""),
        consentNote: String(row.consent_note || ""),
      });
      setFormErrors(EMPTY_ERRORS);
    },
    [guardDirty]
  );

  const handleAddNew = useCallback(() => {
    if (!guardDirty()) return;
    setSelectedVideo(null);
    setIsCreating(true);
    setForm(EMPTY_FORM);
    setFormErrors(EMPTY_ERRORS);
  }, [guardDirty]);

  const handleSave = useCallback(async () => {
    const errors = validateForm(form);
    setFormErrors(errors);
    if (errors.title || errors.youtubeUrl || errors.consentNote) return;

    try {
      const payload: Record<string, unknown> = selectedVideo
        ? {
            id: selectedVideo.id,
            title: form.title.trim(),
            youtubeUrl: form.youtubeUrl.trim(),
            consentNote: form.consentNote.trim(),
          }
        : {
            isNew: true,
            title: form.title.trim(),
            youtubeUrl: form.youtubeUrl.trim(),
            consentNote: form.consentNote.trim(),
          };
      await onSave(payload);
      showNotice(
        selectedVideo ? "Video updated successfully." : "Video created successfully.",
        "success"
      );
      if (!selectedVideo) {
        setForm(EMPTY_FORM);
        setIsCreating(false);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Save failed.";
      showNotice(msg, "error");
    }
  }, [form, selectedVideo, onSave, showNotice]);

  const handlePublish = useCallback(
    async (id: string) => {
      try {
        await onPublish(id);
        showNotice("Video published.", "success");
      } catch (err: unknown) {
        showNotice(err instanceof Error ? err.message : "Publish failed.", "error");
      }
    },
    [onPublish, showNotice]
  );

  const handleHide = useCallback(
    async (id: string) => {
      try {
        await onHide(id);
        showNotice("Video hidden.", "success");
      } catch (err: unknown) {
        showNotice(err instanceof Error ? err.message : "Hide failed.", "error");
      }
    },
    [onHide, showNotice]
  );

  const handleArchive = useCallback(
    async (id: string) => {
      if (!window.confirm("Archive this video? It can be restored later.")) return;
      try {
        await onArchive(id);
        showNotice("Video archived.", "success");
      } catch (err: unknown) {
        showNotice(err instanceof Error ? err.message : "Archive failed.", "error");
      }
    },
    [onArchive, showNotice]
  );

  const handleRestore = useCallback(
    async (id: string) => {
      try {
        await onRestore(id);
        showNotice("Video restored to hidden.", "success");
      } catch (err: unknown) {
        showNotice(err instanceof Error ? err.message : "Restore failed.", "error");
      }
    },
    [onRestore, showNotice]
  );

  const handlePreview = useCallback(
    (row: Record<string, string | number | null>, event: React.MouseEvent) => {
      event.stopPropagation();
      triggerRef.current = event.currentTarget as HTMLButtonElement;
      setPreviewVideo(row);
    },
    []
  );

  const handleFormSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      handleSave();
    },
    [handleSave]
  );

  /* ------------------------------------------------------------------ */
  /*  Render                                                            */
  /* ------------------------------------------------------------------ */

  const lifecycleLabel: Record<Lifecycle, string> = {
    live: "Live",
    hidden: "Hidden",
    archived: "Archived",
  };

  return (
    <div style={S.studio} className="vs-studio">
      {/* ────────── Notice ────────── */}
      {notice && (
        <div style={S.notice(noticeType)}>
          {noticeType === "success" ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
          {notice}
        </div>
      )}

      {/* ────────── Header ────────── */}
      <div style={S.header} className="vs-header">
        <div>
          <h2 style={S.headerTitle}>Patient Video Studio</h2>
          <p style={S.headerSub}>
            Manage consent-backed patient stories before publishing them on the
            hospital website.
          </p>
        </div>
        <button
          type="button"
          style={S.buttonPrimary}
          className="button primary"
          onClick={handleAddNew}
          disabled={busy}
        >
          <Plus size={16} /> Add Video
        </button>
      </div>

      {/* ────────── Summary Cards ────────── */}
      <div style={S.summary} className="vs-summary">
        <div style={S.summaryCard} className="vs-summary-card">
          <span style={S.summaryLabel}>Total</span>
          <span style={{ ...S.summaryValue, color: "#0f172a" }}>{counts.total}</span>
        </div>
        <div style={S.summaryCard} className="vs-summary-card">
          <span style={S.summaryLabel}>
            <CheckCircle size={12} style={{ verticalAlign: -2 }} /> Live
          </span>
          <span style={{ ...S.summaryValue, color: "#059669" }}>{counts.live}</span>
        </div>
        <div style={S.summaryCard} className="vs-summary-card">
          <span style={S.summaryLabel}>
            <EyeOff size={12} style={{ verticalAlign: -2 }} /> Hidden
          </span>
          <span style={{ ...S.summaryValue, color: "#d97706" }}>{counts.hidden}</span>
        </div>
        <div style={S.summaryCard} className="vs-summary-card">
          <span style={S.summaryLabel}>
            <Archive size={12} style={{ verticalAlign: -2 }} /> Archived
          </span>
          <span style={{ ...S.summaryValue, color: "#64748b" }}>{counts.archived}</span>
        </div>
      </div>

      {/* ────────── Filters + Search ────────── */}
      <div style={S.filters} className="vs-filters">
        <div style={S.filterChips} className="vs-filter-chips">
          {(
            [
              ["all", "All"],
              ["live", "Live"],
              ["hidden", "Hidden"],
              ["archived", "Archived"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              style={activeFilter === key ? S.chipActive : S.chip}
              className={`vs-chip${activeFilter === key ? " active" : ""}`}
              onClick={() => setActiveFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>

        <div style={S.search} className="vs-search">
          <Search size={16} color="#94a3b8" />
          <input
            type="text"
            placeholder="Search videos..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={S.searchInput}
          />
          {searchQuery && (
            <button
              type="button"
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 2,
                display: "flex",
                alignItems: "center",
              }}
              onClick={() => setSearchQuery("")}
              aria-label="Clear search"
            >
              <XCircle size={14} color="#94a3b8" />
            </button>
          )}
        </div>

        <span style={S.resultCount} className="vs-result-count">
          {filteredVideos.length} result
          {filteredVideos.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* ────────── Main Content ────────── */}
      <div style={S.content} className="vs-content">
        {/* ─── Editor Panel ─── */}
        <div style={S.editor} className="vs-editor">
          <h3 style={S.editorTitle}>
            {selectedVideo
              ? `Editing: ${selectedVideo.title}`
              : "New patient video"}
          </h3>

          <form onSubmit={handleFormSubmit}>
            {/* Title */}
            <label style={S.editorLabel}>
              Video Title
              <input
                type="text"
                value={form.title}
                onChange={(e) =>
                  setForm((f) => ({ ...f, title: e.target.value }))
                }
                style={
                  formErrors.title ? S.editorInputError : S.editorInput
                }
                placeholder="e.g. Maria's Recovery Story"
                disabled={busy}
              />
              {formErrors.title && (
                <span style={S.error}>{formErrors.title}</span>
              )}
            </label>

            {/* YouTube URL */}
            <label style={S.editorLabel}>
              YouTube URL
              <input
                type="url"
                value={form.youtubeUrl}
                onChange={(e) =>
                  setForm((f) => ({ ...f, youtubeUrl: e.target.value }))
                }
                style={
                  formErrors.youtubeUrl
                    ? S.editorInputError
                    : S.editorInput
                }
                placeholder="https://www.youtube.com/watch?v=..."
                disabled={busy}
              />
              {resolved && !formErrors.youtubeUrl && (
                <span style={S.valid}>
                  <Play size={11} style={{ verticalAlign: -1 }} /> Valid
                  &mdash; {resolved.sourceType}
                </span>
              )}
              {formErrors.youtubeUrl && (
                <span style={S.error}>{formErrors.youtubeUrl}</span>
              )}
              {resolved && (
                <div style={S.thumbPreview}>
                  <img
                    src={thumbnailUrl(resolved.id, false)}
                    alt="YouTube thumbnail preview"
                    style={S.thumbPreviewImg}
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = thumbnailUrl(
                        resolved.id,
                        true
                      );
                    }}
                  />
                </div>
              )}
            </label>

            {/* Consent Note */}
            <label style={S.editorLabel}>
              Consent / Source Note
              <textarea
                rows={4}
                value={form.consentNote}
                onChange={(e) =>
                  setForm((f) => ({ ...f, consentNote: e.target.value }))
                }
                style={
                  formErrors.consentNote
                    ? S.textareaError
                    : S.textarea
                }
                placeholder="Patient consent details or source reference..."
                disabled={busy}
              />
              {formErrors.consentNote && (
                <span style={S.error}>{formErrors.consentNote}</span>
              )}
            </label>

            {/* Save button */}
            <button
              type="submit"
              style={canSave ? S.buttonPrimary : S.buttonDisabled}
              disabled={!canSave}
            >
              <Film size={16} />
              {selectedVideo ? "Update Video" : "Save Video"}
            </button>
          </form>
        </div>

        {/* ─── Video Library ─── */}
        <div style={S.library} className="vs-library">
          {filteredVideos.length === 0 ? (
            <div className="admin-empty" style={{ gridColumn: "1 / -1", textAlign: "center", padding: 40, color: "#94a3b8" }}>
              <Film size={32} style={{ marginBottom: 8 }} />
              <div>No videos found.</div>
            </div>
          ) : (
            filteredVideos.map((row) => {
              const lifecycle = row._lifecycle as Lifecycle;
              return (
                <div
                  key={String(row.id)}
                  style={S.card}
                  className="vs-card"
                  onMouseEnter={(e) => {
                    const el = e.currentTarget;
                    el.style.transform = "translateY(-3px)";
                    el.style.boxShadow = "0 6px 20px rgba(0,0,0,0.08)";
                  }}
                  onMouseLeave={(e) => {
                    const el = e.currentTarget;
                    el.style.transform = "translateY(0)";
                    el.style.boxShadow = "0 1px 3px rgba(0,0,0,0.04)";
                  }}
                >
                  {/* Thumbnail */}
                  <div style={S.cardMedia} className="vs-card-media">
                    {row._resolvedId ? (
                      <img
                        src={thumbnailUrl(row._resolvedId, false)}
                        alt={String(row.title || "Video thumbnail")}
                        style={S.cardImg}
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = thumbnailUrl(
                            row._resolvedId,
                            true
                          );
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          width: "100%",
                          height: "100%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Film size={36} color="#334155" />
                      </div>
                    )}
                    <span style={S.cardBadge(lifecycle)} className={`vs-badge ${lifecycle}`}>
                      {lifecycle === "live" && <CheckCircle size={10} />}
                      {lifecycle === "hidden" && <EyeOff size={10} />}
                      {lifecycle === "archived" && <Archive size={10} />}
                      {lifecycleLabel[lifecycle]}
                    </span>
                  </div>

                  {/* Body */}
                  <div style={S.cardBody} className="vs-card-body">
                    <h4 style={S.cardTitle} title={String(row.title || "")}>
                      {row.title || "Untitled"}
                    </h4>
                    <div style={S.cardMeta}>
                      {row._sourceType} &middot; {formatDate(row.created_at)}
                    </div>

                    <div style={S.cardActions} className="vs-card-actions">
                      {/* Preview */}
                      <button
                        type="button"
                        style={S.button}
                        onClick={(e) => handlePreview(row, e)}
                        aria-label={`Preview ${row.title}`}
                      >
                        <Play size={14} /> Preview
                      </button>

                      {/* Edit */}
                      <button
                        type="button"
                        style={S.button}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectVideo(row);
                        }}
                        aria-label={`Edit ${row.title}`}
                      >
                        <Eye size={14} /> Edit
                      </button>

                      {/* Lifecycle actions */}
                      {lifecycle === "hidden" && (
                        <button
                          type="button"
                          style={S.buttonSuccess}
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePublish(String(row.id));
                          }}
                          disabled={busy}
                          aria-label={`Publish ${row.title}`}
                        >
                          <CheckCircle size={14} /> Publish
                        </button>
                      )}

                      {lifecycle === "live" && (
                        <button
                          type="button"
                          style={S.button}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleHide(String(row.id));
                          }}
                          disabled={busy}
                          aria-label={`Hide ${row.title}`}
                        >
                          <EyeOff size={14} /> Hide
                        </button>
                      )}

                      {lifecycle === "archived" && (
                        <button
                          type="button"
                          style={S.buttonSuccess}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRestore(String(row.id));
                          }}
                          disabled={busy}
                          aria-label={`Restore ${row.title}`}
                        >
                          <RotateCcw size={14} /> Restore
                        </button>
                      )}

                      {lifecycle !== "archived" && (
                        <button
                          type="button"
                          style={S.buttonDanger}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleArchive(String(row.id));
                          }}
                          disabled={busy}
                          aria-label={`Archive ${row.title}`}
                        >
                          <Archive size={14} /> Archive
                        </button>
                      )}

                      {/* External link */}
                      {row.youtube_url && (
                        <a
                          href={String(row.youtube_url)}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            ...S.button,
                            textDecoration: "none",
                          }}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Open ${row.title} on YouTube`}
                        >
                          <ExternalLink size={14} />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ────────── Preview Modal (native dialog) ────────── */}
      {previewVideo && (
        <dialog
          ref={dialogRef}
          className="vs-preview-modal"
          style={S.previewModal}
          onClose={handleClosePreview}
        >
          <div style={S.previewHeader} className="vs-preview-header">
            <h3 style={S.previewTitle}>
              {previewVideo.title || "Untitled"}
            </h3>
            <button
              type="button"
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 6,
                display: "flex",
                alignItems: "center",
                borderRadius: 8,
                minHeight: 44,
                minWidth: 44,
                justifyContent: "center",
              }}
              onClick={() => dialogRef.current?.close()}
              aria-label="Close preview"
            >
              <X size={20} color="#64748b" />
            </button>
          </div>
          <div style={S.previewPlayer} className="vs-preview-player">
            {previewVideo._resolvedId && (
              <iframe
                src={embedUrl(String(previewVideo._resolvedId))}
                title={String(previewVideo.title || "Video preview")}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                style={S.previewIframe}
              />
            )}
          </div>
        </dialog>
      )}

      {/* ────────── Responsive + Interaction Styles (injected) ────────── */}
      <style>{`
        .vs-studio {
          --vs-focus-ring: 0 0 0 2px #2563eb;
        }
        .vs-studio *:focus-visible {
          outline: 2px solid #2563eb;
          outline-offset: 2px;
          border-radius: 6px;
        }

        .vs-card {
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        .vs-chip:hover:not(.active) {
          background: #e2e8f0 !important;
          border-color: #cbd5e1 !important;
        }
        .vs-chip.active:hover {
          background: #1d4ed8 !important;
        }

        .vs-preview-modal::backdrop {
          background: rgba(0, 0, 0, 0.5);
        }
        .vs-preview-modal[open] {
          display: flex;
          flex-direction: column;
        }

        .vs-editor input:focus,
        .vs-editor textarea:focus {
          border-color: #2563eb !important;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
        }

        .button.primary:hover:not(:disabled) {
          background: #1d4ed8;
        }

        .vs-studio button:disabled {
          opacity: 0.6;
          cursor: not-allowed !important;
        }

        .vs-studio a:hover {
          background: #e2e8f0 !important;
        }

        /* Tablet: 2 column cards */
        @media (min-width: 641px) and (max-width: 1024px) {
          .vs-content {
            flex-direction: column !important;
          }
          .vs-editor {
            width: 100% !important;
            min-width: unset !important;
            position: static !important;
          }
          .vs-library {
            grid-template-columns: repeat(2, 1fr) !important;
          }
        }

        /* Mobile */
        @media (max-width: 640px) {
          .vs-content {
            flex-direction: column !important;
          }
          .vs-editor {
            width: 100% !important;
            min-width: unset !important;
            position: static !important;
          }
          .vs-library {
            grid-template-columns: 1fr !important;
          }
          .vs-summary {
            grid-template-columns: repeat(2, 1fr) !important;
          }
          .vs-filters {
            flex-direction: column !important;
            align-items: stretch !important;
          }
          .vs-search {
            max-width: none !important;
          }
          .vs-editor input,
          .vs-editor textarea {
            font-size: 16px !important;
          }
        }

        /* Desktop: editor sticky */
        @media (min-width: 1025px) {
          .vs-content {
            align-items: flex-start !important;
          }
        }

        /* Reduced motion */
        @media (prefers-reduced-motion: reduce) {
          .vs-card {
            transition: none !important;
          }
          .vs-chip,
          .vs-chip.active {
            transition: none !important;
          }
          .vs-card:hover {
            transform: none !important;
            box-shadow: 0 1px 3px rgba(0,0,0,0.04) !important;
          }
        }
      `}</style>
    </div>
  );
}
