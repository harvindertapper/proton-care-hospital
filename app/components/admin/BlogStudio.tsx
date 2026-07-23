"use client";

import React, { useState, useCallback, useMemo } from "react";
import {
  Eye,
  EyeOff,
  Archive,
  ExternalLink,
  Search,
  XCircle,
  Newspaper,
  CheckCircle,
  AlertCircle,
  Plus,
  Pencil,
  Image as ImageIcon,
} from "lucide-react";
import { slugify } from "@/app/lib/utils";
import MediaPickerDialog from "@/app/components/admin/MediaPickerDialog";

/* -------------------------------------------------------------------------- */
/*                                  Types                                     */
/* -------------------------------------------------------------------------- */

export type BlogMutateResult =
  | { ok: true; outcome: string; data?: { blogId?: string; version?: number; slug?: string } }
  | { ok: false; error: string };

type Props = {
  busy: boolean;
  csrf: string;
  role?: "SUPER_ADMIN" | "STAFF";
  blogs: Record<string, string | number | null>[];
  blogMutate: (payload: Record<string, unknown>) => Promise<BlogMutateResult>;
};

type FormState = {
  title: string;
  slug: string;
  excerpt: string;
  body: string;
  coverMediaId: string;
  coverMediaVerified: boolean;
  expectedVersion: number;
};

type FormErrors = {
  title: string;
  slug: string;
  body: string;
  excerpt: string;
};

type Lifecycle = "live" | "hidden" | "archived" | "draft";

type CoverMeta = { id: string; verified: boolean } | null;

const EMPTY_FORM: FormState = {
  title: "",
  slug: "",
  excerpt: "",
  body: "",
  coverMediaId: "",
  coverMediaVerified: false,
  expectedVersion: 0,
};

const EMPTY_ERRORS: FormErrors = { title: "", slug: "", body: "", excerpt: "" };

/* -------------------------------------------------------------------------- */
/*                              Helpers                                       */
/* -------------------------------------------------------------------------- */

function getLifecycle(row: Record<string, string | number | null>): Lifecycle {
  if (row.is_deleted === 1) return "archived";
  if (
    String(row.lifecycle_status || "").toUpperCase() === "ARCHIVED"
  ) return "archived";
  if (
    String(row.status || "").toUpperCase() === "APPROVED" &&
    row.is_visible === 1 &&
    String(row.lifecycle_status || "").toUpperCase() === "PUBLISHED"
  ) return "live";
  if (
    String(row.status || "").toUpperCase() === "HIDDEN" &&
    row.is_visible === 0
  ) return "hidden";
  if (
    row.is_visible === 0 &&
    String(row.lifecycle_status || "").toUpperCase() === "DRAFT"
  ) return "hidden";
  return "draft";
}

function validateForm(form: FormState): FormErrors {
  const errors: FormErrors = { title: "", slug: "", body: "", excerpt: "" };
  if (!form.title.trim()) errors.title = "Blog title is required.";
  const effectiveSlug = form.slug.trim() || slugify(form.title);
  if (!effectiveSlug) errors.slug = "Blog slug is required.";
  if (!form.body.trim()) errors.body = "Blog body is required.";
  if (!form.excerpt.trim()) errors.excerpt = "Excerpt is required.";
  return errors;
}

function formHasChanges(a: FormState, b: FormState): boolean {
  return (
    a.title.trim() !== b.title.trim() ||
    a.slug.trim() !== b.slug.trim() ||
    a.excerpt.trim() !== b.excerpt.trim() ||
    a.body.trim() !== b.body.trim() ||
    a.coverMediaId !== b.coverMediaId
  );
}

function isStaffRole(role?: string): boolean {
  return role === "STAFF";
}

function roleLabelSave(isStaff: boolean, isEditing: boolean): string {
  if (isStaff && isEditing) return "Submit changes for approval";
  if (isStaff) return "Submit for approval";
  return isEditing ? "Update Blog" : "Save Blog";
}

function roleLabelPublish(isStaff: boolean): string {
  return isStaff ? "Propose publication" : "Publish";
}

function roleLabelHide(isStaff: boolean): string {
  return isStaff ? "Propose hide" : "Hide";
}

function roleLabelArchive(isStaff: boolean): string {
  return isStaff ? "Propose archive" : "Archive";
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
  studio: {
    fontFamily: "inherit",
    color: "#1e293b",
  },
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
  summary: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
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
  content: {
    display: "flex",
    gap: 24,
    alignItems: "flex-start",
  },
  editor: {
    width: 420,
    minWidth: 340,
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
    fontSize: 15,
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
    fontSize: 15,
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
    fontSize: 15,
    fontFamily: "inherit",
    color: "#1e293b",
    outline: "none",
    resize: "vertical" as const,
    minHeight: 80,
    width: "100%",
    boxSizing: "border-box" as const,
  },
  textareaError: {
    padding: "10px 12px",
    border: "2px solid #ef4444",
    borderRadius: 10,
    fontSize: 15,
    fontFamily: "inherit",
    color: "#1e293b",
    outline: "none",
    resize: "vertical" as const,
    minHeight: 80,
    width: "100%",
    boxSizing: "border-box" as const,
  },
  textareaBody: {
    padding: "10px 12px",
    border: "1px solid #E2E8F0",
    borderRadius: 10,
    fontSize: 15,
    fontFamily: "inherit",
    color: "#1e293b",
    outline: "none",
    resize: "vertical" as const,
    minHeight: 180,
    width: "100%",
    boxSizing: "border-box" as const,
  },
  textareaBodyError: {
    padding: "10px 12px",
    border: "2px solid #ef4444",
    borderRadius: 10,
    fontSize: 15,
    fontFamily: "inherit",
    color: "#1e293b",
    outline: "none",
    resize: "vertical" as const,
    minHeight: 180,
    width: "100%",
    boxSizing: "border-box" as const,
  },
  error: {
    color: "#ef4444",
    fontSize: 12,
    marginTop: 3,
    fontWeight: 500,
  },
  helper: {
    color: "#94a3b8",
    fontSize: 12,
    marginTop: 3,
    fontWeight: 400,
  },
  coverSection: {
    borderTop: "1px solid #E2E8F0",
    paddingTop: 14,
    marginTop: 4,
    marginBottom: 16,
  },
  coverLabel: {
    fontSize: 13,
    fontWeight: 600,
    color: "#334155",
    marginBottom: 8,
  },
  coverPreview: {
    borderRadius: 10,
    overflow: "hidden",
    border: "1px solid #E2E8F0",
    maxHeight: 200,
    marginBottom: 8,
  },
  coverPreviewImg: {
    width: "100%",
    height: "auto",
    display: "block",
    objectFit: "cover" as const,
  },
  library: {
    flex: 1,
    minWidth: 0,
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
    gap: 18,
    alignContent: "start",
  },
  card: {
    background: "#ffffff",
    border: "1px solid #E2E8F0",
    borderRadius: 18,
    overflow: "hidden",
    boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
    transition: "transform 0.2s ease, box-shadow 0.2s ease",
    cursor: "default",
  },
  cardCover: {
    position: "relative" as const,
    width: "100%",
    paddingTop: "50%",
    background: "#0f172a",
    overflow: "hidden",
  },
  cardCoverImg: {
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
    if (lifecycle === "archived")
      return { ...base, background: "#e2e8f0", color: "#475569" };
    return { ...base, background: "#eff6ff", color: "#1d4ed8" };
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
  cardExcerpt: {
    fontSize: 13,
    color: "#64748b",
    marginTop: 8,
    lineHeight: 1.5,
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical" as const,
    overflow: "hidden",
  },
  cardActions: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: 6,
    marginTop: 12,
  },
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
    width: "100%",
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
    width: "100%",
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

export default function BlogStudio({ busy, csrf, role, blogs, blogMutate }: Props) {
  /* ------------------------------------------------------------------ */
  /*  State                                                             */
  /* ------------------------------------------------------------------ */

  const [selectedBlogId, setSelectedBlogId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<FormErrors>(EMPTY_ERRORS);
  const [showCoverPicker, setShowCoverPicker] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [notice, setNotice] = useState("");
  const [noticeType, setNoticeType] = useState<"success" | "error">("success");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<
    "all" | "live" | "hidden" | "draft" | "archived"
  >("all");
  const [coverImgFailed, setCoverImgFailed] = useState(false);
  const [slugTouched, setSlugTouched] = useState(false);
  const [coverMeta, setCoverMeta] = useState<CoverMeta>(null);
  const [pendingNotice, setPendingNotice] = useState("");

  /* ------------------------------------------------------------------ */
  /*  Derived state                                                     */
  /* ------------------------------------------------------------------ */

  const isEditing = Boolean(selectedBlogId);

  const resolvedBlogs = useMemo(() => {
    return blogs.map(
      (row): Record<string, string | number | null> & { _lifecycle: Lifecycle } => ({
        ...row,
        _lifecycle: getLifecycle(row),
      }),
    );
  }, [blogs]);

  const counts = useMemo(() => {
    let total = 0;
    let live = 0;
    let hidden = 0;
    let draft = 0;
    let archived = 0;
    for (const b of resolvedBlogs) {
      total++;
      if (b._lifecycle === "live") live++;
      else if (b._lifecycle === "hidden") hidden++;
      else if (b._lifecycle === "draft") draft++;
      else archived++;
    }
    return { total, live, hidden, draft, archived };
  }, [resolvedBlogs]);

  const filteredBlogs = useMemo(() => {
    let result = resolvedBlogs;
    if (activeFilter !== "all") {
      result = result.filter((b) => b._lifecycle === activeFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(
        (b) =>
          String(b.title || "")
            .toLowerCase()
            .includes(q) ||
          String(b.slug || "")
            .toLowerCase()
            .includes(q),
      );
    }
    return result;
  }, [resolvedBlogs, activeFilter, searchQuery]);

  const baselineRef = React.useRef<FormState>(EMPTY_FORM);

  const currentErrors = useMemo(() => validateForm(form), [form]);

  const isArchivedEdit =
    selectedBlogId &&
    resolvedBlogs.find(
      (b) => String(b.id) === selectedBlogId && b._lifecycle === "archived",
    );

  const canSave =
    isDirty &&
    !currentErrors.title &&
    !currentErrors.slug &&
    !currentErrors.body &&
    !currentErrors.excerpt &&
    !busy &&
    !isArchivedEdit;

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
    [],
  );

  /* ------------------------------------------------------------------ */
  /*  Dirty tracking                                                    */
  /* ------------------------------------------------------------------ */

  const markDirty = useCallback(
    (patch: Partial<FormState>) => {
      setForm((prev) => {
        const next = { ...prev, ...patch };
        setIsDirty(formHasChanges(next, baselineRef.current));
        return next;
      });
    },
    [],
  );

  /* ------------------------------------------------------------------ */
  /*  Form switching guard                                              */
  /* ------------------------------------------------------------------ */

  const guardDirty = useCallback((): boolean => {
    if (!isDirty) return true;
    return window.confirm("Discard unsaved blog changes?");
  }, [isDirty]);

  /* ------------------------------------------------------------------ */
  /*  Handlers                                                         */
  /* ------------------------------------------------------------------ */

  const handleSelectBlog = useCallback(
    (row: Record<string, string | number | null>) => {
      if (!guardDirty()) return;
      const blogId = String(row.id || "");
      const coverId = String(row.cover_media_id || "");
      const snapshot: FormState = {
        title: String(row.title || ""),
        slug: String(row.slug || ""),
        excerpt: String(row.excerpt || ""),
        body: String(row.body || ""),
        coverMediaId: coverId,
        coverMediaVerified: Boolean(coverId),
        expectedVersion: Number(row.version || 0),
      };
      setSelectedBlogId(blogId);
      setForm(snapshot);
      baselineRef.current = snapshot;
      setFormErrors(EMPTY_ERRORS);
      setIsDirty(false);
      setCoverImgFailed(false);
      setSlugTouched(true);
      setCoverMeta(coverId ? { id: coverId, verified: true } : null);
      setPendingNotice("");
    },
    [guardDirty],
  );

  const handleAddNew = useCallback(() => {
    if (!guardDirty()) return;
    setSelectedBlogId(null);
    setForm(EMPTY_FORM);
    baselineRef.current = EMPTY_FORM;
    setFormErrors(EMPTY_ERRORS);
    setIsDirty(false);
    setCoverImgFailed(false);
    setSlugTouched(false);
    setCoverMeta(null);
    setPendingNotice("");
  }, [guardDirty]);

  const handleSave = useCallback(async () => {
    const errors = validateForm(form);
    setFormErrors(errors);
    if (errors.title || errors.slug || errors.body || errors.excerpt) return;

    const effectiveSlug = form.slug.trim() || slugify(form.title);

    const isUpdate = isEditing && Boolean(selectedBlogId);
    const mode = isUpdate ? "UPDATE" : "CREATE";

    const payload: Record<string, unknown> = {
      action: "blog.save",
      mode,
      title: form.title.trim(),
      slug: effectiveSlug,
      excerpt: form.excerpt.trim(),
      body: form.body.trim(),
    };

    if (isUpdate && selectedBlogId) {
      payload.blogId = selectedBlogId;
      payload.expectedVersion = form.expectedVersion;

      if (form.coverMediaId !== baselineRef.current.coverMediaId) {
        payload.coverMediaId = form.coverMediaId || null;
      }
    } else {
      if (form.coverMediaId) {
        payload.coverMediaId = form.coverMediaId;
      }
    }

    const result = await blogMutate(payload);
    const staff = isStaffRole(role);

    if (result.ok) {
      const outcome = String(result.outcome || "APPLIED").toUpperCase();

      if (outcome === "PENDING_APPROVAL" || outcome === "NO_OP" && staff) {
        const msg = staff
          ? "Change submitted for Super Admin approval."
          : "Blog updated.";
        setPendingNotice(msg);
        showNotice(msg, "success");
        return;
      }

      if (outcome === "NO_OP") {
        showNotice("Blog is already in this state.", "success");
        return;
      }

      const serverBlogId = result.data?.blogId;
      const serverVersion = result.data?.version;
      const serverSlug = result.data?.slug || effectiveSlug;

      if (isUpdate && selectedBlogId) {
        const updatedVersion = serverVersion ?? form.expectedVersion + 1;
        const snapshot: FormState = {
          ...form,
          slug: serverSlug,
          expectedVersion: updatedVersion,
          coverMediaVerified: true,
        };
        baselineRef.current = snapshot;
        setForm(snapshot);
        setIsDirty(false);
        showNotice("Blog updated successfully.", "success");
      } else {
        if (!serverBlogId) {
          showNotice("Save succeeded but server did not return a blog ID. Refresh and verify.", "error");
          return;
        }
        const updatedVersion = serverVersion ?? 1;
        const snapshot: FormState = {
          title: form.title.trim(),
          slug: serverSlug,
          excerpt: form.excerpt.trim(),
          body: form.body.trim(),
          coverMediaId: form.coverMediaId,
          coverMediaVerified: Boolean(form.coverMediaId),
          expectedVersion: updatedVersion,
        };
        setSelectedBlogId(serverBlogId);
        baselineRef.current = snapshot;
        setForm(snapshot);
        setIsDirty(false);
        setSlugTouched(true);
        showNotice(
          staff ? "Blog submitted for approval." : "Blog created as draft. Publish it when ready.",
          "success",
        );
      }
    } else {
      showNotice(result.error || "Save failed.", "error");
    }
  }, [form, isEditing, selectedBlogId, blogMutate, showNotice, role]);

  const handlePublish = useCallback(
    async (blogId: string, version: number) => {
      const result = await blogMutate({
        action: "blog.visibility",
        payload: { blogId, action: "publish", expectedVersion: version },
      });
      const staff = isStaffRole(role);
      if (result.ok) {
        const outcome = String(result.outcome || "APPLIED").toUpperCase();
        if (outcome === "NO_OP") {
          showNotice("Blog is already published.", "success");
        } else if (outcome === "PENDING_APPROVAL") {
          showNotice("Publication submitted for Super Admin approval.", "success");
        } else {
          showNotice(staff ? "Publication submitted for approval." : "Blog published.", "success");
        }
      } else {
        showNotice(result.error || "Publish failed.", "error");
      }
    },
    [blogMutate, showNotice, role],
  );

  const handleHide = useCallback(
    async (blogId: string, version: number) => {
      const result = await blogMutate({
        action: "blog.visibility",
        payload: { blogId, action: "hide", expectedVersion: version },
      });
      const staff = isStaffRole(role);
      if (result.ok) {
        const outcome = String(result.outcome || "APPLIED").toUpperCase();
        if (outcome === "NO_OP") {
          showNotice("Blog is already hidden.", "success");
        } else if (outcome === "PENDING_APPROVAL") {
          showNotice("Hide submitted for Super Admin approval.", "success");
        } else {
          showNotice(staff ? "Hide submitted for approval." : "Blog hidden.", "success");
        }
      } else {
        showNotice(result.error || "Hide failed.", "error");
      }
    },
    [blogMutate, showNotice, role],
  );

  const handleArchive = useCallback(
    async (blogId: string, version: number, title: string) => {
      if (
        !window.confirm(
          `Are you sure you want to archive the blog "${title}"?`,
        )
      )
        return;
      const result = await blogMutate({
        action: "blog.archive",
        blogId,
        expectedVersion: version,
      });
      const staff = isStaffRole(role);
      if (result.ok) {
        const outcome = String(result.outcome || "APPLIED").toUpperCase();
        if (outcome === "PENDING_APPROVAL") {
          showNotice("Archive submitted for Super Admin approval.", "success");
        } else {
          showNotice(staff ? "Archive submitted for approval." : "Blog archived.", "success");
        }
        if (selectedBlogId === blogId && !staff) {
          handleAddNew();
        }
      } else {
        showNotice(result.error || "Archive failed.", "error");
      }
    },
    [blogMutate, showNotice, selectedBlogId, handleAddNew, role],
  );

  const handleFormSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      handleSave();
    },
    [handleSave],
  );

  /* ------------------------------------------------------------------ */
  /*  Re-sync version from refreshed blog rows                          */
  /* ------------------------------------------------------------------ */

  React.useEffect(() => {
    if (!selectedBlogId) return;
    if (pendingNotice) return;
    const match = blogs.find((b) => String(b.id) === selectedBlogId);
    if (match) {
      const freshVersion = Number(match.version || 0);
      if (freshVersion > baselineRef.current.expectedVersion) {
        setForm((prev) => {
          if (prev.expectedVersion !== freshVersion) {
            const next = { ...prev, expectedVersion: freshVersion };
            baselineRef.current = { ...next };
            return next;
          }
          return prev;
        });
      }
    }
  }, [blogs, selectedBlogId, pendingNotice]);

  /* ------------------------------------------------------------------ */
  /*  Render                                                            */
  /* ------------------------------------------------------------------ */

  const lifecycleLabel: Record<Lifecycle, string> = {
    live: "Live",
    hidden: "Hidden",
    draft: "Draft",
    archived: "Archived",
  };

  return (
    <div style={S.studio} className="bs-studio">
      {/* ────────── Notice ────────── */}
      {notice && (
        <div style={S.notice(noticeType)}>
          {noticeType === "success" ? (
            <CheckCircle size={15} />
          ) : (
            <AlertCircle size={15} />
          )}
          {notice}
        </div>
      )}

      {/* ────────── Header ────────── */}
      <div style={S.header} className="bs-header">
        <div>
          <h2 style={S.headerTitle}>Blog Studio</h2>
          <p style={S.headerSub}>
            Create, edit, and publish blog posts for the hospital website.
          </p>
        </div>
        <button
          type="button"
          style={S.buttonPrimary}
          className="button primary"
          onClick={handleAddNew}
          disabled={busy}
        >
          <Plus size={16} /> New Blog
        </button>
      </div>

      {/* ────────── Summary Cards ────────── */}
      <div style={S.summary} className="bs-summary">
        <div style={S.summaryCard} className="bs-summary-card">
          <span style={S.summaryLabel}>Total</span>
          <span style={{ ...S.summaryValue, color: "#0f172a" }}>
            {counts.total}
          </span>
        </div>
        <div style={S.summaryCard} className="bs-summary-card">
          <span style={S.summaryLabel}>
            <CheckCircle size={12} style={{ verticalAlign: -2 }} /> Live
          </span>
          <span style={{ ...S.summaryValue, color: "#059669" }}>
            {counts.live}
          </span>
        </div>
        <div style={S.summaryCard} className="bs-summary-card">
          <span style={S.summaryLabel}>
            <EyeOff size={12} style={{ verticalAlign: -2 }} /> Hidden
          </span>
          <span style={{ ...S.summaryValue, color: "#d97706" }}>
            {counts.hidden}
          </span>
        </div>
        <div style={S.summaryCard} className="bs-summary-card">
          <span style={S.summaryLabel}>
            <Pencil size={12} style={{ verticalAlign: -2 }} /> Draft
          </span>
          <span style={{ ...S.summaryValue, color: "#2563eb" }}>
            {counts.draft}
          </span>
        </div>
        <div style={S.summaryCard} className="bs-summary-card">
          <span style={S.summaryLabel}>
            <Archive size={12} style={{ verticalAlign: -2 }} /> Archived
          </span>
          <span style={{ ...S.summaryValue, color: "#64748b" }}>
            {counts.archived}
          </span>
        </div>
      </div>

      {/* ────────── Filters + Search ────────── */}
      <div style={S.filters} className="bs-filters">
        <div style={S.filterChips} className="bs-filter-chips">
          {(
            [
              ["all", "All"],
              ["live", "Live"],
              ["hidden", "Hidden"],
              ["draft", "Draft"],
              ["archived", "Archived"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              style={activeFilter === key ? S.chipActive : S.chip}
              className={`bs-chip${activeFilter === key ? " active" : ""}`}
              onClick={() => setActiveFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>

        <div style={S.search} className="bs-search">
          <Search size={16} color="#94a3b8" />
          <input
            type="text"
            placeholder="Search blogs..."
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

        <span style={S.resultCount} className="bs-result-count">
          {filteredBlogs.length} result
          {filteredBlogs.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* ────────── Main Content ────────── */}
      <div style={S.content} className="bs-content">
        {/* ─── Editor Panel ─── */}
        <div style={S.editor} className="bs-editor">
          <h3 style={S.editorTitle}>
            {isEditing
              ? `Editing: ${form.title || "Untitled"}`
              : "New blog post"}
          </h3>

          {isEditing && (
            <div
              style={{
                background: "#eff6ff",
                color: "#1d4ed8",
                padding: "10px 14px",
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 500,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 16,
              }}
            >
              <span>
                v{form.expectedVersion} &middot;{" "}
                {isArchivedEdit ? "Archived" : "Editing"}
              </span>
              <button
                type="button"
                style={{
                  background: "none",
                  border: "none",
                  color: "#1d4ed8",
                  fontWeight: 600,
                  cursor: "pointer",
                  fontSize: 13,
                  padding: "2px 6px",
                  borderRadius: 4,
                  fontFamily: "inherit",
                }}
                onClick={handleAddNew}
              >
                Create New
              </button>
            </div>
          )}

          {pendingNotice && (
            <div
              style={{
                background: "#fefce8",
                color: "#854d0e",
                padding: "10px 14px",
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 500,
                marginBottom: 16,
                border: "1px solid #fde68a",
              }}
            >
              {pendingNotice}
            </div>
          )}

          <form onSubmit={handleFormSubmit}>
            {/* Title */}
            <label style={S.editorLabel}>
              Title
              <input
                type="text"
                value={form.title}
                onChange={(e) => {
                  if (!slugTouched) {
                    markDirty({
                      title: e.target.value,
                      slug: slugify(e.target.value),
                    });
                  } else {
                    markDirty({ title: e.target.value });
                  }
                }}
                style={
                  formErrors.title ? S.editorInputError : S.editorInput
                }
                placeholder="e.g. Understanding Diabetes Management"
                disabled={busy}
              />
              {formErrors.title && (
                <span style={S.error}>{formErrors.title}</span>
              )}
            </label>

            {/* Slug */}
            <label style={S.editorLabel}>
              Slug
              <input
                type="text"
                value={form.slug}
                onChange={(e) => { setSlugTouched(true); markDirty({ slug: slugify(e.target.value) }); }}
                style={
                  formErrors.slug ? S.editorInputError : S.editorInput
                }
                placeholder="e.g. understanding-diabetes-management"
                disabled={busy}
              />
              {formErrors.slug && (
                <span style={S.error}>{formErrors.slug}</span>
              )}
              <span style={S.helper}>
                Controls the public Blog URL.
              </span>
            </label>

            {/* Excerpt */}
            <label style={S.editorLabel}>
              Excerpt
              <textarea
                rows={3}
                value={form.excerpt}
                onChange={(e) => markDirty({ excerpt: e.target.value })}
                style={
                  formErrors.excerpt
                    ? S.textareaError
                    : S.textarea
                }
                placeholder="Short summary for blog listing and SEO..."
                disabled={busy}
              />
              {formErrors.excerpt && (
                <span style={S.error}>{formErrors.excerpt}</span>
              )}
            </label>

            {/* Body */}
            <label style={S.editorLabel}>
              Body
              <textarea
                rows={10}
                value={form.body}
                onChange={(e) => markDirty({ body: e.target.value })}
                style={
                  formErrors.body
                    ? S.textareaBodyError
                    : S.textareaBody
                }
                placeholder="Full blog content (supports HTML)..."
                disabled={busy}
              />
              {formErrors.body && (
                <span style={S.error}>{formErrors.body}</span>
              )}
            </label>

            {/* Cover Image */}
            <div style={S.coverSection}>
              <div style={S.coverLabel}>Cover Image</div>
              {form.coverMediaId && !coverImgFailed ? (
                <div style={S.coverPreview}>
                  <img
                    src={`/api/media/${form.coverMediaId}`}
                    alt={form.title || "Blog cover"}
                    style={S.coverPreviewImg}
                    onError={() => setCoverImgFailed(true)}
                  />
                </div>
              ) : form.coverMediaId && coverImgFailed ? (
                <div
                  style={{
                    ...S.coverPreview,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "#fef2f2",
                    paddingTop: 40,
                    gap: 6,
                  }}
                >
                  <ImageIcon size={32} color="#dc2626" />
                  <span style={{ fontSize: 12, color: "#dc2626", fontWeight: 500 }}>
                    Selected cover is unavailable.
                  </span>
                </div>
              ) : (
                <div
                  style={{
                    padding: "32px 16px",
                    background: "#f8fafc",
                    borderRadius: 10,
                    border: "1px dashed #cbd5e1",
                    textAlign: "center" as const,
                    fontSize: 13,
                    color: "#94a3b8",
                    marginBottom: 8,
                  }}
                >
                  No cover image set. Select Cover.
                </div>
              )}
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap" as const,
                  marginTop: 8,
                }}
              >
                <button
                  type="button"
                  style={S.button}
                  onClick={() => setShowCoverPicker(true)}
                  disabled={busy}
                >
                  <ImageIcon size={14} />{" "}
                  {form.coverMediaId ? "Replace" : "Select Cover"}
                </button>
                {form.coverMediaId && (
                  <button
                    type="button"
                    style={S.buttonDanger}
                    onClick={() => {
                      markDirty({ coverMediaId: "", coverMediaVerified: false });
                      setCoverImgFailed(false);
                      setCoverMeta(null);
                    }}
                    disabled={busy}
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>

            {/* Save button */}
            <button
              type="submit"
              style={canSave ? S.buttonPrimary : S.buttonDisabled}
              disabled={!canSave}
            >
              <Newspaper size={16} />
              {roleLabelSave(isStaffRole(role), isEditing)}
            </button>
          </form>
        </div>

        {/* ─── Blog Library ─── */}
        <div style={S.library} className="bs-library">
          {filteredBlogs.length === 0 ? (
            <div
              className="admin-empty"
              style={{
                gridColumn: "1 / -1",
                textAlign: "center",
                padding: 40,
                color: "#94a3b8",
              }}
            >
              <Newspaper size={32} style={{ marginBottom: 8 }} />
              <div>No blog posts found.</div>
            </div>
          ) : (
            filteredBlogs.map((row) => {
              const lifecycle = row._lifecycle as Lifecycle;
              const blogId = String(row.id || "");
              const version = Number(row.version || 0);
              const isDeleted = row.is_deleted === 1;
              const isPublished =
                row.status === "APPROVED" && row.is_visible === 1;

              return (
                <div
                  key={blogId}
                  style={S.card}
                  className="bs-card"
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
                  {/* Cover thumbnail */}
                  <div style={S.cardCover} className="bs-card-cover">
                    {row.cover_media_id && (
                      <img
                        src={`/api/media/${row.cover_media_id}`}
                        alt={String(row.title || "Blog cover")}
                        style={S.cardCoverImg}
                        onError={(e) => {
                          const img = e.target as HTMLImageElement;
                          img.style.display = "none";
                        }}
                      />
                    )}
                    {!row.cover_media_id && (
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
                        <Newspaper size={36} color="#334155" />
                      </div>
                    )}
                    <span style={S.cardBadge(lifecycle)} className={`bs-badge ${lifecycle}`}>
                      {lifecycle === "live" && <CheckCircle size={10} />}
                      {lifecycle === "hidden" && <EyeOff size={10} />}
                      {lifecycle === "archived" && <Archive size={10} />}
                      {lifecycle === "draft" && <Pencil size={10} />}
                      {lifecycleLabel[lifecycle]}
                    </span>
                  </div>

                  {/* Body */}
                  <div style={S.cardBody} className="bs-card-body">
                    <h4 style={S.cardTitle} title={String(row.title || "")}>
                      {row.title || "Untitled"}
                    </h4>
                    <div style={S.cardMeta}>
                      v{version} &middot; {formatDate(row.created_at)}
                      {row.slug ? ` · /${row.slug}` : ""}
                    </div>
                    {row.excerpt ? (
                      <div style={S.cardExcerpt}>
                        {String(row.excerpt)}
                      </div>
                    ) : null}

                    <div style={S.cardActions} className="bs-card-actions">
                      {/* Edit */}
                      <button
                        type="button"
                        style={S.button}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectBlog(row);
                        }}
                        disabled={isDeleted}
                        title={
                          isDeleted
                            ? "Restore this blog before editing."
                            : `Edit ${row.title}`
                        }
                        aria-label={
                          isDeleted
                            ? "Restore before editing"
                            : `Edit ${row.title}`
                        }
                      >
                        <Pencil size={14} />{" "}
                        {isDeleted ? "View" : "Edit"}
                      </button>

                      {/* Publish — allowed for any non-deleted, non-already-published row */}
                      {!isPublished && !isDeleted && (
                        <button
                          type="button"
                          style={S.buttonSuccess}
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePublish(blogId, version);
                          }}
                          disabled={busy}
                          aria-label={`${roleLabelPublish(isStaffRole(role))} ${row.title}`}
                        >
                          <CheckCircle size={14} /> {roleLabelPublish(isStaffRole(role))}
                        </button>
                      )}

                      {/* Hide — only for published rows */}
                      {isPublished && (
                        <button
                          type="button"
                          style={S.button}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleHide(blogId, version);
                          }}
                          disabled={busy}
                          aria-label={`${roleLabelHide(isStaffRole(role))} ${row.title}`}
                        >
                          <EyeOff size={14} /> {roleLabelHide(isStaffRole(role))}
                        </button>
                      )}

                      {/* Archive — non-deleted rows */}
                      {!isDeleted && (
                        <button
                          type="button"
                          style={S.buttonDanger}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleArchive(
                              blogId,
                              version,
                              String(row.title || "Untitled"),
                            );
                          }}
                          disabled={busy}
                          aria-label={`${roleLabelArchive(isStaffRole(role))} ${row.title}`}
                        >
                          <Archive size={14} /> {roleLabelArchive(isStaffRole(role))}
                        </button>
                      )}

                      {/* External link */}
                      {row.slug && !isDeleted && (
                        <a
                          href={`/blog/${row.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            ...S.button,
                            textDecoration: "none",
                          }}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Open ${row.title} on public site`}
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

      {/* ────────── Cover Media Picker Dialog ────────── */}
      {showCoverPicker && (
        <MediaPickerDialog
          csrf={csrf}
          category="BLOG"
          categoryLabel="Blog Cover"
          selectedId={form.coverMediaId || null}
          onClose={() => setShowCoverPicker(false)}
          onSelect={(asset) => {
            markDirty({ coverMediaId: asset.id, coverMediaVerified: true });
            setCoverImgFailed(false);
            setCoverMeta({ id: asset.id, verified: true });
            setShowCoverPicker(false);
          }}
        />
      )}

      {/* ────────── Responsive + Interaction Styles (injected) ────────── */}
      <style>{`
        .bs-studio {
          --bs-focus-ring: 0 0 0 2px #2563eb;
        }
        .bs-studio *:focus-visible {
          outline: 2px solid #2563eb;
          outline-offset: 2px;
          border-radius: 6px;
        }

        .bs-card {
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        .bs-chip:hover:not(.active) {
          background: #e2e8f0 !important;
          border-color: #cbd5e1 !important;
        }
        .bs-chip.active:hover {
          background: #1d4ed8 !important;
        }

        .bs-editor input:focus,
        .bs-editor textarea:focus {
          border-color: #2563eb !important;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
        }

        .bs-studio button:disabled {
          opacity: 0.6;
          cursor: not-allowed !important;
        }

        .bs-studio a:hover {
          background: #e2e8f0 !important;
        }

        /* Tablet: 2 column cards */
        @media (min-width: 641px) and (max-width: 1024px) {
          .bs-content {
            flex-direction: column !important;
          }
          .bs-editor {
            width: 100% !important;
            min-width: unset !important;
            position: static !important;
          }
          .bs-library {
            grid-template-columns: repeat(2, 1fr) !important;
          }
        }

        /* Mobile */
        @media (max-width: 640px) {
          .bs-content {
            flex-direction: column !important;
          }
          .bs-editor {
            width: 100% !important;
            min-width: unset !important;
            position: static !important;
          }
          .bs-library {
            grid-template-columns: 1fr !important;
          }
          .bs-summary {
            grid-template-columns: repeat(2, 1fr) !important;
          }
          .bs-filters {
            flex-direction: column !important;
            align-items: stretch !important;
          }
          .bs-search {
            max-width: none !important;
          }
          .bs-editor input,
          .bs-editor textarea {
            font-size: 16px !important;
          }
        }

        /* Desktop: editor sticky */
        @media (min-width: 1025px) {
          .bs-content {
            align-items: flex-start !important;
          }
        }

        /* Reduced motion */
        @media (prefers-reduced-motion: reduce) {
          .bs-card {
            transition: none !important;
          }
          .bs-chip,
          .bs-chip.active {
            transition: none !important;
          }
          .bs-card:hover {
            transform: none !important;
            box-shadow: 0 1px 3px rgba(0,0,0,0.04) !important;
          }
        }
      `}</style>
    </div>
  );
}
