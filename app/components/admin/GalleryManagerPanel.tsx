"use client";

import { useState, useEffect, useCallback } from "react";
import type { GallerySectionDto, GalleryItemDto, MediaAssetDto } from "./admin-media-types";
import {
  fetchGallerySections,
  createGallerySection,
  patchGallerySection,
  deleteGallerySection,
  fetchGalleryItems,
  createGalleryItem,
  patchGalleryItem,
  deleteGalleryItem,
  reorderGalleryItems,
  AdminApiError,
} from "./admin-media-api";
import MediaPickerDialog from "./MediaPickerDialog";

type Props = {
  csrf: string;
  sessionRole: "SUPER_ADMIN" | "STAFF";
};

const STATUS_BADGE: Record<string, { bg: string; color: string }> = {
  PUBLISHED: { bg: "#d1fae5", color: "#065f46" },
  DRAFT: { bg: "#f1f5f9", color: "#475569" },
  IN_REVIEW: { bg: "#fef3c7", color: "#92400e" },
  PENDING_APPROVAL: { bg: "#fef3c7", color: "#92400e" },
  HIDDEN: { bg: "#fee2e2", color: "#991b1b" },
  ARCHIVED: { bg: "#e2e8f0", color: "#64748b" },
};

function statusBadge(status: string) {
  const s = STATUS_BADGE[status] ?? { bg: "#f1f5f9", color: "#475569" };
  return {
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 600 as const,
    background: s.bg,
    color: s.color,
  };
}

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function getTransitions(current: string): string[] {
  switch (current) {
    case "DRAFT":
      return ["IN_REVIEW", "HIDDEN", "ARCHIVED"];
    case "IN_REVIEW":
      return ["PUBLISHED", "HIDDEN", "ARCHIVED"];
    case "PUBLISHED":
      return ["HIDDEN"];
    case "HIDDEN":
      return ["PUBLISHED", "ARCHIVED"];
    default:
      return [];
  }
}

export function GalleryManagerPanel({ csrf, sessionRole }: Props) {
  const [sections, setSections] = useState<GallerySectionDto[]>([]);
  const [selectedSection, setSelectedSection] = useState<GallerySectionDto | null>(null);
  const [items, setItems] = useState<GalleryItemDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editingSection, setEditingSection] = useState<GallerySectionDto | null>(null);
  const [creatingSection, setCreatingSection] = useState(false);
  const [editingItem, setEditingItem] = useState<GalleryItemDto | null>(null);
  const [creatingItem, setCreatingItem] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [reorderMode, setReorderMode] = useState(false);
  const [reorderList, setReorderList] = useState<GalleryItemDto[]>([]);
  const [selectedMedia, setSelectedMedia] = useState<MediaAssetDto | null>(null);
  const [busy, setBusy] = useState(false);

  const [formName, setFormName] = useState("");
  const [formSlug, setFormSlug] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formSortOrder, setFormSortOrder] = useState(0);
  const [formTitleOverride, setFormTitleOverride] = useState("");
  const [formAltText, setFormAltText] = useState("");
  const [formCaption, setFormCaption] = useState("");
  const [formSlotKey, setFormSlotKey] = useState("");
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);

  function showNotice(msg: string) {
    setNotice(msg);
    setTimeout(() => setNotice(""), 3000);
  }

  const loadSections = useCallback(async () => {
    try {
      const data = await fetchGallerySections(csrf, 100, 0);
      setSections(data.sections);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load sections");
    }
  }, [csrf]);

  const loadItems = useCallback(
    async (sectionId: string) => {
      try {
        const data = await fetchGalleryItems(csrf, sectionId, 100, 0);
        setItems(data.items);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to load items");
      }
    },
    [csrf]
  );

  useEffect(() => {
    let cancelled = false;
    fetchGallerySections(csrf, 100, 0).then(
      (data) => {
        if (!cancelled) { setSections(data.sections); setLoading(false); }
      },
      (e: unknown) => {
        if (!cancelled) { setError(e instanceof Error ? e.message : "Failed to load sections"); setLoading(false); }
      },
    );
    return () => { cancelled = true; };
  }, [csrf]);

  useEffect(() => {
    if (!selectedSection) return;
    let cancelled = false;
    fetchGalleryItems(csrf, selectedSection.id, 100, 0).then(
      (data) => { if (!cancelled) setItems(data.items); },
      (e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load items"); },
    );
    return () => { cancelled = true; };
  }, [selectedSection, csrf]);

  function clearForm() {
    setFormName("");
    setFormSlug("");
    setFormDescription("");
    setFormSortOrder(0);
    setFormTitleOverride("");
    setFormAltText("");
    setFormCaption("");
    setFormSlotKey("");
    setSlugManuallyEdited(false);
    setSelectedMedia(null);
    setCreatingSection(false);
    setEditingSection(null);
    setCreatingItem(false);
    setEditingItem(null);
  }

  function startCreateSection() {
    clearForm();
    setCreatingSection(true);
    setEditingSection(null);
    if (sections.length > 0) {
      const maxSort = Math.max(...sections.map((s) => s.sortOrder ?? 0));
      setFormSortOrder(maxSort + 1);
    }
  }

  function startEditSection(sec: GallerySectionDto) {
    clearForm();
    setEditingSection(sec);
    setFormName(sec.name);
    setFormSlug(sec.slug);
    setFormDescription(sec.description ?? "");
    setFormSortOrder(sec.sortOrder ?? 0);
    setSlugManuallyEdited(true);
  }

  async function saveSection() {
    if (!formName.trim()) {
      setError("Section name is required");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (editingSection) {
        const result = await patchGallerySection(csrf, editingSection.id, editingSection.version, {
          name: formName.trim(),
          slug: formSlug.trim() || slugify(formName),
          description: formDescription.trim() || undefined,
          sortOrder: formSortOrder,
        });
        if (result.outcome === "PENDING_APPROVAL") {
          showNotice("Submitted for approval");
        } else {
          showNotice("Section updated");
        }
        await loadSections();
      } else {
        const result = await createGallerySection(csrf, {
          name: formName.trim(),
          slug: formSlug.trim() || slugify(formName),
          description: formDescription.trim() || undefined,
          sortOrder: formSortOrder,
        });
        if (result.outcome === "PENDING_APPROVAL") {
          showNotice("Submitted for approval");
        } else {
          showNotice("Section created");
        }
        await loadSections();
      }
      clearForm();
    } catch (e: unknown) {
      if (e instanceof AdminApiError && e.status === 404) {
        await loadSections();
        setError(e.message);
      } else {
        setError(e instanceof Error ? e.message : "Failed to save section");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteSection(sec: GallerySectionDto) {
    if (!confirm(`Delete section "${sec.name}"? This cannot be undone.`)) return;
    setBusy(true);
    setError("");
    try {
      await deleteGallerySection(csrf, sec.id, sec.version);
      showNotice("Section deleted");
      if (selectedSection?.id === sec.id) setSelectedSection(null);
      await loadSections();
    } catch (e: unknown) {
      if (e instanceof AdminApiError && e.status === 404) {
        await loadSections();
        setError(e.message);
      } else {
        setError(e instanceof Error ? e.message : "Failed to delete section");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleLifecycleTransitionSection(sec: GallerySectionDto, targetLifecycle: string) {
    setBusy(true);
    setError("");
    try {
      const result = await patchGallerySection(csrf, sec.id, sec.version, { lifecycleStatus: targetLifecycle });
      if (sessionRole === "STAFF") {
        if (result.outcome === "PENDING_APPROVAL") {
          showNotice("Submitted for approval");
        } else {
          showNotice("Submitted for approval");
        }
      } else {
        if (result.outcome === "APPLIED") {
          showNotice("Applied");
        } else {
          showNotice("Submitted for approval");
        }
      }
      await loadSections();
    } catch (err: unknown) {
      if (err instanceof AdminApiError && err.status === 409) {
        const msg = err.message.toLowerCase();
        if (msg.includes("eligibility") || msg.includes("guard")) {
          setError("Publication eligibility not met. " + err.message);
        } else {
          setError("Stale version. Please reload. " + err.message);
          await loadSections();
        }
      } else if (err instanceof AdminApiError && err.status === 404) {
        await loadSections();
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : "Failed to update section");
      }
    } finally {
      setBusy(false);
    }
  }

  function startCreateItem() {
    if (!selectedSection) return;
    clearForm();
    setCreatingItem(true);
    setEditingItem(null);
    setCreatingSection(false);
    setEditingSection(null);
    if (items.length > 0) {
      const maxSort = Math.max(...items.map((i) => i.sortOrder ?? 0));
      setFormSortOrder(maxSort + 1);
    }
  }

  function startEditItem(item: GalleryItemDto) {
    clearForm();
    setEditingItem(item);
    setFormTitleOverride(item.titleOverride ?? "");
    setFormAltText(item.altTextOverride ?? "");
    setFormCaption(item.captionOverride ?? "");
    setFormSlotKey(item.slotKey ?? "");
    setFormSortOrder(item.sortOrder ?? 0);
    if (item.originalUrl) {
      setSelectedMedia({
        id: item.mediaId,
        originalUrl: item.originalUrl,
        displayUrl: item.displayUrl ?? item.originalUrl,
        thumbnailUrl: item.thumbnailUrl ?? item.displayUrl ?? item.originalUrl,
      } as MediaAssetDto);
    }
  }

  async function saveItem() {
    if (!selectedSection) return;
    if (!editingItem && !selectedMedia) {
      setError("Please select a media asset");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (editingItem) {
        const fields: Record<string, unknown> = {};
        fields.titleOverride = formTitleOverride.trim() || undefined;
        fields.altTextOverride = formAltText.trim() || undefined;
        fields.captionOverride = formCaption.trim() || undefined;
        fields.slotKey = formSlotKey.trim() || undefined;
        fields.sortOrder = formSortOrder;
        const result = await patchGalleryItem(csrf, editingItem.id, editingItem.version, fields);
        if (sessionRole === "STAFF") {
          if (result.outcome === "PENDING_APPROVAL") {
            showNotice("Submitted for approval");
          } else {
            showNotice("Submitted for approval");
          }
        } else {
          if (result.outcome === "APPLIED") {
            showNotice("Applied");
          } else {
            showNotice("Submitted for approval");
          }
        }
      } else {
        const result = await createGalleryItem(csrf, {
          sectionId: selectedSection.id,
          mediaId: selectedMedia!.id,
          titleOverride: formTitleOverride.trim() || undefined,
          altTextOverride: formAltText.trim() || undefined,
          captionOverride: formCaption.trim() || undefined,
          slotKey: formSlotKey.trim() || undefined,
          sortOrder: formSortOrder,
        });
        if (result.outcome === "PENDING_APPROVAL") {
          showNotice("Submitted for approval");
        } else {
          showNotice("Item created");
        }
      }
      await loadItems(selectedSection.id);
      await loadSections();
      clearForm();
    } catch (e: unknown) {
      if (e instanceof AdminApiError && e.status === 404) {
        await loadItems(selectedSection.id);
        await loadSections();
        setError(e.message);
      } else {
        setError(e instanceof Error ? e.message : "Failed to save item");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteItem(item: GalleryItemDto) {
    if (!confirm(`Delete item "${item.titleOverride ?? "Untitled"}"? This cannot be undone.`)) return;
    setBusy(true);
    setError("");
    try {
      await deleteGalleryItem(csrf, item.id, item.version);
      showNotice("Item deleted");
      if (selectedSection) await loadItems(selectedSection.id);
      await loadSections();
    } catch (e: unknown) {
      if (e instanceof AdminApiError && e.status === 404) {
        if (selectedSection) await loadItems(selectedSection.id);
        await loadSections();
        setError(e.message);
      } else {
        setError(e instanceof Error ? e.message : "Failed to delete item");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleLifecycleTransitionItem(item: GalleryItemDto, targetLifecycle: string) {
    setBusy(true);
    setError("");
    try {
      const result = await patchGalleryItem(csrf, item.id, item.version, { lifecycleStatus: targetLifecycle });
      if (sessionRole === "STAFF") {
        if (result.outcome === "PENDING_APPROVAL") {
          showNotice("Submitted for approval");
        } else {
          showNotice("Submitted for approval");
        }
      } else {
        if (result.outcome === "APPLIED") {
          showNotice("Applied");
        } else {
          showNotice("Submitted for approval");
        }
      }
      if (selectedSection) await loadItems(selectedSection.id);
      await loadSections();
    } catch (err: unknown) {
      if (err instanceof AdminApiError && err.status === 409) {
        const msg = err.message.toLowerCase();
        if (msg.includes("eligibility") || msg.includes("guard")) {
          setError("Publication eligibility not met. " + err.message);
        } else {
          setError("Stale version. Please reload. " + err.message);
          if (selectedSection) await loadItems(selectedSection.id);
        }
      } else if (err instanceof AdminApiError && err.status === 404) {
        if (selectedSection) await loadItems(selectedSection.id);
        await loadSections();
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : "Failed to update item");
      }
    } finally {
      setBusy(false);
    }
  }

  function enterReorderMode() {
    setReorderList([...items].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)));
    setReorderMode(true);
  }

  function moveReorderItem(index: number, direction: -1 | 1) {
    setReorderList((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function saveReorder() {
    if (!selectedSection) return;
    setBusy(true);
    setError("");
    try {
      const order = reorderList.map((item) => ({
        id: item.id,
        version: item.version,
      }));
      const result = await reorderGalleryItems(csrf, selectedSection.id, order);
      if (result.outcome === "PENDING_APPROVAL") {
        showNotice("Reorder submitted for review.");
      } else {
        showNotice("Order saved.");
      }
      await loadItems(selectedSection.id);
      setReorderMode(false);
    } catch (e: unknown) {
      if (e instanceof AdminApiError && e.status === 404) {
        await loadItems(selectedSection.id);
        setError(e.message);
      } else {
        setError(e instanceof Error ? e.message : "Failed to save order");
      }
    } finally {
      setBusy(false);
    }
  }

  function handleMediaSelected(media: MediaAssetDto) {
    setSelectedMedia(media);
    setShowPicker(false);
  }

  const styles = {
    wrapper: { display: "flex", gap: 24, minHeight: 500 },
    leftPanel: { flex: "0 0 40%", maxWidth: "40%" },
    rightPanel: { flex: "1 1 60%", minWidth: 0 },
    panelHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
    panelTitle: { fontSize: 16, fontWeight: 700, color: "#0f172a" },
    sectionCard: (selected: boolean): React.CSSProperties => ({
      background: "#fff",
      border: selected ? "2px solid #0d9488" : "1px solid #e2e8f0",
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
      cursor: "pointer",
      transition: "box-shadow 0.15s",
      boxShadow: "none",
    }),
    sectionName: { fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 2 },
    sectionSlug: { fontSize: 12, color: "#94a3b8", marginBottom: 6 },
    sectionMeta: {
      fontSize: 12,
      color: "#64748b",
      display: "flex",
      gap: 12,
      flexWrap: "wrap" as const,
      alignItems: "center",
      marginBottom: 8,
    },
    sectionActions: { display: "flex", gap: 6, marginTop: 8 },
    lifecycleToolbar: { display: "flex", gap: 4, flexWrap: "wrap" as const, marginTop: 6 },
    itemCard: {
      background: "#fff",
      border: "1px solid #e2e8f0",
      borderRadius: 8,
      padding: 12,
      marginBottom: 8,
      display: "flex",
      alignItems: "center",
      gap: 12,
    },
    itemThumb: {
      width: 60,
      height: 60,
      objectFit: "cover" as const,
      borderRadius: 6,
      background: "#f1f5f9",
      flexShrink: 0,
    },
    itemInfo: { flex: 1, minWidth: 0 },
    itemTitle: { fontSize: 13, fontWeight: 600, color: "#0f172a", marginBottom: 2 },
    itemMeta: { fontSize: 11, color: "#64748b", display: "flex", gap: 10, alignItems: "center" },
    itemActions: { display: "flex", gap: 6, flexShrink: 0 },
    formRow: { marginBottom: 12 },
    label: { display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4 },
    input: {
      width: "100%",
      padding: "8px 12px",
      border: "1px solid #d1d5db",
      borderRadius: 6,
      fontSize: 13,
      outline: "none",
      boxSizing: "border-box" as const,
    },
    textarea: {
      width: "100%",
      padding: "8px 12px",
      border: "1px solid #d1d5db",
      borderRadius: 6,
      fontSize: 13,
      outline: "none",
      boxSizing: "border-box" as const,
      minHeight: 60,
      resize: "vertical" as const,
    },
    formActions: { display: "flex", gap: 8, marginTop: 16 },
    inlineForm: {
      background: "#f8fafc",
      border: "1px solid #e2e8f0",
      borderRadius: 12,
      padding: 16,
      marginBottom: 16,
    },
    error: {
      padding: "10px 14px",
      borderRadius: 8,
      marginBottom: 16,
      fontSize: 13,
      fontWeight: 500,
      background: "#fee2e2",
      color: "#991b1b",
    },
    success: {
      padding: "10px 14px",
      borderRadius: 8,
      marginBottom: 16,
      fontSize: 13,
      fontWeight: 500,
      background: "#d1fae5",
      color: "#065f46",
    },
    emptyState: { textAlign: "center" as const, padding: "40px 20px", color: "#94a3b8", fontSize: 13 },
    reorderItem: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "10px 12px",
      background: "#fff",
      border: "1px solid #e2e8f0",
      borderRadius: 8,
      marginBottom: 6,
    },
    reorderNumber: {
      width: 28,
      height: 28,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "#f1f5f9",
      borderRadius: 6,
      fontSize: 12,
      fontWeight: 700,
      color: "#475569",
      flexShrink: 0,
    },
    mediaPreview: { width: 48, height: 48, objectFit: "cover" as const, borderRadius: 6, background: "#f1f5f9" },
    immutabilityNote: { fontSize: 11, color: "#92400e", fontStyle: "italic" as const, marginTop: 4 },
  };

  const renderLifecycleToolbar = <T extends GallerySectionDto | GalleryItemDto>(
    entity: T,
    onTransition: (entity: T, target: string) => void
  ) => {
    const transitions = getTransitions(entity.lifecycleStatus);
    if (transitions.length === 0) return null;
    return (
      <div style={styles.lifecycleToolbar}>
        {transitions.map((target) => (
          <button
            key={target}
            type="button"
            className="button subtle small"
            aria-label={`Transition to ${target}`}
            onClick={(e) => {
              e.stopPropagation();
              onTransition(entity, target);
            }}
            disabled={busy}
          >
            &rarr; {target}
          </button>
        ))}
      </div>
    );
  };

  const renderSectionForm = () => {
    if (!creatingSection && !editingSection) return null;
    return (
      <div style={styles.inlineForm}>
        <h4 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700, color: "#0f172a" }}>
          {editingSection ? "Edit Section" : "New Section"}
        </h4>
        <div style={styles.formRow}>
          <label style={styles.label}>Name *</label>
          <input
            style={styles.input}
            value={formName}
            onChange={(e) => {
              setFormName(e.target.value);
              if (!slugManuallyEdited) setFormSlug(slugify(e.target.value));
            }}
            placeholder="e.g. Hero Gallery"
          />
        </div>
        <div style={styles.formRow}>
          <label style={styles.label}>Slug</label>
          <input
            style={styles.input}
            value={formSlug}
            onChange={(e) => {
              setFormSlug(e.target.value);
              setSlugManuallyEdited(true);
            }}
            placeholder="auto-generated-from-name"
          />
        </div>
        <div style={styles.formRow}>
          <label style={styles.label}>Description</label>
          <textarea
            style={styles.textarea}
            value={formDescription}
            onChange={(e) => setFormDescription(e.target.value)}
            placeholder="Optional description"
            rows={2}
          />
        </div>
        <div style={styles.formRow}>
          <label style={styles.label}>Sort Order</label>
          <input
            style={{ ...styles.input, width: 100 }}
            type="number"
            min={0}
            value={formSortOrder}
            onChange={(e) => setFormSortOrder(Number(e.target.value))}
          />
        </div>
        <div style={styles.formActions}>
          <button type="submit" className="button primary small" onClick={saveSection} disabled={busy}>
            {busy ? "Saving..." : editingSection ? "Update" : "Create"}
          </button>
          <button type="button" className="button secondary small" onClick={clearForm} disabled={busy}>
            Cancel
          </button>
        </div>
      </div>
    );
  };

  const renderItemForm = () => {
    if (!creatingItem && !editingItem) return null;
    const isEdit = !!editingItem;
    return (
      <div style={styles.inlineForm}>
        <h4 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700, color: "#0f172a" }}>
          {isEdit ? "Edit Item" : "New Item"}
        </h4>
        <div style={styles.formRow}>
          <label style={styles.label}>Media Asset *</label>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {selectedMedia && (
              <img
                src={selectedMedia.thumbnailUrl || selectedMedia.displayUrl || selectedMedia.originalUrl || ""}
                alt="Selected"
                style={styles.mediaPreview}
              />
            )}
            {isEdit ? (
              <p style={styles.immutabilityNote}>
                Media cannot be replaced on an existing Gallery item. Archive this item and create a new one to use
                different media.
              </p>
            ) : (
              <button type="button" className="button secondary small" onClick={() => setShowPicker(true)}>
                {selectedMedia ? "Change Media" : "Select Media"}
              </button>
            )}
            {selectedMedia && <span style={{ fontSize: 12, color: "#64748b" }}>Selected</span>}
          </div>
        </div>
        <div style={styles.formRow}>
          <label style={styles.label}>Title Override</label>
          <input
            style={styles.input}
            value={formTitleOverride}
            onChange={(e) => setFormTitleOverride(e.target.value)}
            placeholder="Custom title"
          />
        </div>
        <div style={styles.formRow}>
          <label style={styles.label}>Alt Text Override</label>
          <input
            style={styles.input}
            value={formAltText}
            onChange={(e) => setFormAltText(e.target.value)}
            placeholder="Descriptive alt text"
          />
        </div>
        <div style={styles.formRow}>
          <label style={styles.label}>Caption Override</label>
          <textarea
            style={styles.textarea}
            value={formCaption}
            onChange={(e) => setFormCaption(e.target.value)}
            placeholder="Optional caption"
            rows={2}
          />
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ ...styles.formRow, flex: 1 }}>
            <label style={styles.label}>Slot Key</label>
            <input
              style={styles.input}
              value={formSlotKey}
              onChange={(e) => setFormSlotKey(e.target.value)}
              placeholder="e.g. hero-1"
            />
          </div>
          <div style={{ ...styles.formRow, flex: 1 }}>
            <label style={styles.label}>Sort Order</label>
            <input
              style={styles.input}
              type="number"
              min={0}
              value={formSortOrder}
              onChange={(e) => setFormSortOrder(Number(e.target.value))}
            />
          </div>
        </div>
        <div style={styles.formActions}>
          <button type="submit" className="button primary small" onClick={saveItem} disabled={busy}>
            {busy ? "Saving..." : isEdit ? "Update" : "Create"}
          </button>
          <button type="button" className="button secondary small" onClick={clearForm} disabled={busy}>
            Cancel
          </button>
        </div>
      </div>
    );
  };

  return (
    <div>
      {error && (
        <div style={styles.error} role="alert">
          {error}
        </div>
      )}
      {notice && <div style={styles.success}>{notice}</div>}

      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>Loading gallery...</div>
      ) : (
        <div style={styles.wrapper}>
          <div style={styles.leftPanel}>
            <div style={styles.panelHeader}>
              <span style={styles.panelTitle}>Gallery Sections</span>
              {!creatingSection && !editingSection && (
                <button type="button" className="button primary small" onClick={startCreateSection}>
                  Add Section
                </button>
              )}
            </div>
            {renderSectionForm()}
            {sections.length === 0 && !creatingSection && (
              <div style={styles.emptyState}>No sections yet. Create one to get started.</div>
            )}
            {sections.map((sec) => (
              <div
                key={sec.id}
                style={styles.sectionCard(selectedSection?.id === sec.id)}
                onClick={() => {
                  if (!creatingSection && !editingSection) setSelectedSection(sec);
                }}
              >
                <div style={styles.sectionName}>{sec.name}</div>
                <div style={styles.sectionSlug}>{sec.slug}</div>
                <div style={styles.sectionMeta}>
                  <span style={statusBadge(sec.lifecycleStatus)}>{sec.lifecycleStatus}</span>
                  <span>Order: {sec.sortOrder ?? 0}</span>
                  <span>v{sec.version ?? 1}</span>
                  <span>
                    Items: {sec.publishedItemCount ?? 0}/{sec.itemCount ?? 0}
                  </span>
                </div>
                {renderLifecycleToolbar(sec, handleLifecycleTransitionSection)}
                {sec.lifecycleStatus === "IN_REVIEW" && (
                  <div style={{ fontSize: 11, color: "#92400e", marginTop: 4 }}>
                    Publication requires all items to be PUBLISHED.
                  </div>
                )}
                {sec.lifecycleStatus === "DRAFT" && (
                  <div style={{ fontSize: 11, color: "#92400e", marginTop: 4 }}>
                    Publication requires all items to be PUBLISHED.
                  </div>
                )}
                <div style={styles.sectionActions}>
                  <button
                    type="button"
                    className="button secondary small"
                    onClick={(e) => {
                      e.stopPropagation();
                      startEditSection(sec);
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="button secondary small"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteSection(sec);
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div style={styles.rightPanel}>
            <div style={styles.panelHeader}>
              <span style={styles.panelTitle}>
                {selectedSection ? `${selectedSection.name} - Items` : "Select a Section"}
              </span>
              <div style={{ display: "flex", gap: 8 }}>
                {selectedSection && !reorderMode && !creatingItem && !editingItem && (
                  <>
                    <button type="button" className="button secondary small" onClick={enterReorderMode}>
                      Reorder
                    </button>
                    <button type="button" className="button primary small" onClick={startCreateItem}>
                      Add Item
                    </button>
                  </>
                )}
                {reorderMode && (
                  <>
                    <button type="button" className="button primary small" onClick={saveReorder} disabled={busy}>
                      {busy ? "Saving..." : "Save Order"}
                    </button>
                    <button
                      type="button"
                      className="button secondary small"
                      onClick={() => setReorderMode(false)}
                      disabled={busy}
                    >
                      Cancel
                    </button>
                  </>
                )}
              </div>
            </div>

            {!selectedSection && (
              <div style={styles.emptyState}>Select a gallery section to view its items.</div>
            )}
            {selectedSection && renderItemForm()}
            {selectedSection && !reorderMode && items.length === 0 && !creatingItem && !editingItem && (
              <div style={styles.emptyState}>No items in this section. Add one to get started.</div>
            )}

            {selectedSection && reorderMode && (
              <div>
                {reorderList.map((item, idx) => (
                  <div key={item.id} style={styles.reorderItem}>
                    <div style={styles.reorderNumber}>{idx + 1}</div>
                    {item.thumbnailUrl && (
                      <img
                        src={item.thumbnailUrl}
                        alt={item.titleOverride ?? ""}
                        style={{ width: 32, height: 32, objectFit: "cover", borderRadius: 4 }}
                      />
                    )}
                    <span style={{ flex: 1, fontSize: 13, color: "#0f172a" }}>{item.titleOverride || "Untitled"}</span>
                    <button
                      type="button"
                      className="button secondary small"
                      onClick={() => moveReorderItem(idx, -1)}
                      disabled={idx === 0}
                      style={{ padding: "4px 8px" }}
                    >
                      &uarr;
                    </button>
                    <button
                      type="button"
                      className="button secondary small"
                      onClick={() => moveReorderItem(idx, 1)}
                      disabled={idx === reorderList.length - 1}
                      style={{ padding: "4px 8px" }}
                    >
                      &darr;
                    </button>
                  </div>
                ))}
              </div>
            )}

            {selectedSection &&
              !reorderMode &&
              items.map((item) => (
                <div key={item.id} style={styles.itemCard}>
                  {item.thumbnailUrl ? (
                    <img src={item.thumbnailUrl} alt={item.titleOverride ?? ""} style={styles.itemThumb} />
                  ) : (
                    <div
                      style={{
                        ...styles.itemThumb,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 11,
                        color: "#94a3b8",
                      }}
                    >
                      No img
                    </div>
                  )}
                  <div style={styles.itemInfo}>
                    <div style={styles.itemTitle}>{item.titleOverride || "Untitled"}</div>
                    <div style={styles.itemMeta}>
                      <span style={statusBadge(item.lifecycleStatus)}>{item.lifecycleStatus}</span>
                      {item.slotKey && <span>Slot: {item.slotKey}</span>}
                      <span>Order: {item.sortOrder ?? 0}</span>
                      <span>v{item.version ?? 1}</span>
                    </div>
                    {renderLifecycleToolbar(item, handleLifecycleTransitionItem)}
                    {(item.lifecycleStatus === "IN_REVIEW" || item.lifecycleStatus === "DRAFT") && (
                      <div style={{ fontSize: 11, color: "#92400e", marginTop: 4 }}>
                        Media must be GALLERY category, PUBLISHED, APPROVED, visible.
                      </div>
                    )}
                  </div>
                  <div style={styles.itemActions}>
                    <button type="button" className="button secondary small" onClick={() => startEditItem(item)}>
                      Edit
                    </button>
                    <button type="button" className="button secondary small" onClick={() => handleDeleteItem(item)}>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {showPicker && (
        <MediaPickerDialog
          csrf={csrf}
          onSelect={handleMediaSelected}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}
