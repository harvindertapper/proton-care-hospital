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

type ActionDef = {
  label: string;
  target: string;
  destructive?: boolean;
  disabled?: boolean;
  disabledReason?: string;
};

function getSectionActions(sec: GallerySectionDto, isSuperAdmin: boolean): ActionDef[] {
  const ls = sec.lifecycleStatus;
  const hasActiveItems = (sec.itemCount ?? 0) > 0;
  const isReady = hasActiveItems && (sec.publishedItemCount ?? 0) === (sec.itemCount ?? 0);
  if (ls === "ARCHIVED") {
    return isSuperAdmin ? [{ label: "Restore Section", target: "DRAFT" }] : [];
  }
  const actions: ActionDef[] = [];
  if (ls === "DRAFT") {
    actions.push({ label: "Submit for Review", target: "IN_REVIEW" });
  }
  if (ls === "IN_REVIEW") {
    actions.push({ label: "Return to Draft", target: "DRAFT" });
    actions.push({ label: "Publish", target: "PUBLISHED", disabled: !isReady, disabledReason: isReady ? undefined : `Publish all ${sec.itemCount ?? 0} Gallery items before publishing this section.` });
  }
  if (ls === "PUBLISHED") {
    actions.push({ label: "Hide", target: "HIDDEN" });
  }
  if (ls === "HIDDEN") {
    actions.push({ label: "Publish", target: "PUBLISHED", disabled: !isReady, disabledReason: isReady ? undefined : `Publish all ${sec.itemCount ?? 0} Gallery items before publishing this section.` });
  }
  if (ls !== "PUBLISHED" && !hasActiveItems) {
    actions.push({ label: "Archive Section", target: "ARCHIVED", destructive: true });
  }
  return actions;
}

function getItemActions(item: GalleryItemDto): ActionDef[] {
  const ls = item.lifecycleStatus;
  if (ls === "ARCHIVED") return [];
  const mediaReady = item.mediaLifecycleStatus === "PUBLISHED" && item.mediaApprovalStatus === "APPROVED" && item.mediaVisible === 1 && item.mediaCategory === "GALLERY";
  const actions: ActionDef[] = [];
  if (ls === "DRAFT") {
    actions.push({ label: "Submit for Review", target: "IN_REVIEW" });
  }
  if (ls === "IN_REVIEW") {
    actions.push({ label: "Return to Draft", target: "DRAFT" });
    actions.push({ label: "Publish", target: "PUBLISHED", disabled: !mediaReady, disabledReason: mediaReady ? undefined : getMediaReadinessIssue(item) });
  }
  if (ls === "PUBLISHED") {
    actions.push({ label: "Hide", target: "HIDDEN" });
  }
  if (ls === "HIDDEN") {
    actions.push({ label: "Publish", target: "PUBLISHED", disabled: !mediaReady, disabledReason: mediaReady ? undefined : getMediaReadinessIssue(item) });
  }
  actions.push({ label: "Remove from Gallery", target: "ARCHIVED", destructive: true });
  return actions;
}

function getMediaReadinessIssue(item: GalleryItemDto): string {
  const issues: string[] = [];
  if (item.mediaCategory !== "GALLERY") issues.push("Media category must be Gallery");
  if (item.mediaApprovalStatus !== "APPROVED") issues.push("Media approval required");
  if (item.mediaLifecycleStatus !== "PUBLISHED") issues.push("Publish the Media Library asset first");
  if (item.mediaVisible !== 1) issues.push("Media is hidden");
  return issues.length > 0 ? issues.join(". ") + "." : "Media not ready";
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
      if (e instanceof AdminApiError && e.status === 409) {
        setError("Stale version conflict. " + e.message);
        await loadSections();
        setEditingSection(null);
        setCreatingSection(false);
      } else if (e instanceof AdminApiError && e.status === 404) {
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
    if (!confirm("Archive this section? First remove all Gallery items. The section can later be restored by a Super Admin.")) return;
    setBusy(true);
    setError("");
    try {
      const result = await deleteGallerySection(csrf, sec.id, sec.version);
      if (result.outcome === "APPLIED") {
        showNotice("Section archived.");
        if (selectedSection?.id === sec.id) setSelectedSection(null);
      } else if (result.outcome === "PENDING_APPROVAL") {
        showNotice("Section archive submitted for approval.");
      } else {
        showNotice("Section archive submitted for approval.");
      }
      await loadSections();
    } catch (e: unknown) {
      if (e instanceof AdminApiError && e.status === 409) {
        setError(e.message);
        await loadSections();
      } else if (e instanceof AdminApiError && e.status === 404) {
        await loadSections();
        setError(e.message);
      } else {
        setError(e instanceof Error ? e.message : "Failed to archive section");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleLifecycleTransitionSection(sec: GallerySectionDto, targetLifecycle: string) {
    if (targetLifecycle === "PUBLISHED") {
      const readyCount = sec.publishedItemCount ?? 0;
      const totalCount = sec.itemCount ?? 0;
      if (totalCount === 0 || readyCount !== totalCount) {
        setError(`Not ready to publish: ${readyCount}/${totalCount} items published. All items must be published before the section.`);
        return;
      }
    }
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
          showNotice(targetLifecycle === "DRAFT" ? "Section restored." : `Section ${targetLifecycle.toLowerCase()}ed.`);
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
        } else if (msg.includes("archived") || msg.includes("restore")) {
          setError(err.message);
        } else {
          setError("Stale version. The latest section data has been loaded. " + err.message);
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
          showNotice("Submitted for approval");
        } else {
          if (result.outcome === "APPLIED") {
            showNotice("Item updated.");
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
          showNotice("Item added — submitted for approval.");
        } else {
          showNotice("Item added. You can remove it from the Gallery if needed.");
        }
      }
      await loadItems(selectedSection.id);
      await loadSections();
      clearForm();
    } catch (e: unknown) {
      if (e instanceof AdminApiError && e.status === 409) {
        setError("This Gallery item changed elsewhere. The latest version has been loaded. " + e.message);
        if (selectedSection) await loadItems(selectedSection.id);
        await loadSections();
        setEditingItem(null);
        setCreatingItem(false);
      } else if (e instanceof AdminApiError && e.status === 404) {
        if (selectedSection) await loadItems(selectedSection.id);
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
    if (!confirm("Remove this item from the Gallery? The original Media Library asset and file will be preserved.")) return;
    setBusy(true);
    setError("");
    try {
      const result = await deleteGalleryItem(csrf, item.id, item.version);
      if (result.outcome === "APPLIED") {
        showNotice("Item removed from Gallery.");
      } else if (result.outcome === "PENDING_APPROVAL") {
        showNotice("Removal submitted for approval.");
      } else {
        showNotice("Removal submitted for approval.");
      }
      if (selectedSection) await loadItems(selectedSection.id);
      await loadSections();
    } catch (e: unknown) {
      if (e instanceof AdminApiError && e.status === 409) {
        setError(e.message);
        if (selectedSection) await loadItems(selectedSection.id);
        await loadSections();
      } else if (e instanceof AdminApiError && e.status === 404) {
        if (selectedSection) await loadItems(selectedSection.id);
        await loadSections();
        setError(e.message);
      } else {
        setError(e instanceof Error ? e.message : "Failed to remove item from Gallery");
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
      } else if (result.outcome === "APPLIED") {
        showNotice("Order saved.");
      } else {
        showNotice("Reorder submitted for review.");
      }
      await loadItems(selectedSection.id);
      setReorderMode(false);
    } catch (e: unknown) {
      if (e instanceof AdminApiError && e.status === 409) {
        setError("Order changed elsewhere. Reloaded the latest Gallery order. " + e.message);
        await loadItems(selectedSection.id);
        setReorderMode(false);
      } else if (e instanceof AdminApiError && e.status === 404) {
        await loadItems(selectedSection.id);
        setReorderMode(false);
        setError(e.message);
      } else {
        setError(e instanceof Error ? e.message : "Failed to save order");
        setReorderMode(false);
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

  const renderActionButtons = <T extends GallerySectionDto | GalleryItemDto>(
    entity: T,
    actions: ActionDef[],
    onTransition: (entity: T, target: string) => void,
    onDelete?: (entity: T) => void,
  ) => {
    if (actions.length === 0) return null;
    return (
      <div style={styles.lifecycleToolbar}>
        {actions.map((action) => (
          <button
            key={action.target}
            type="button"
            className={`button ${action.destructive ? "subtle" : "secondary"} small`}
            style={action.destructive ? { color: "#dc2626" } : undefined}
            title={action.disabled ? action.disabledReason : undefined}
            onClick={(e) => {
              e.stopPropagation();
              if (action.disabled) return;
              if (action.target === "ARCHIVED" && onDelete) {
                onDelete(entity);
              } else {
                onTransition(entity, action.target);
              }
            }}
            disabled={busy || !!action.disabled}
          >
            {action.label}
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
        {!isEdit && (
          <div style={{ padding: "8px 12px", borderRadius: 6, background: "#f0f9ff", border: "1px solid #bae6fd", fontSize: 12, color: "#0369a1", marginBottom: 12 }}>
            Adding an item includes the selected Media Library asset in this Gallery section. It does not publish the section automatically.
          </div>
        )}
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
                  <span style={statusBadge(sec.lifecycleStatus)}>{sec.lifecycleStatus === "ARCHIVED" ? "Archived" : sec.lifecycleStatus === "PUBLISHED" ? "Published" : sec.lifecycleStatus === "HIDDEN" ? "Hidden" : sec.lifecycleStatus === "IN_REVIEW" ? "Needs Review" : "Draft"}</span>
                  <span>Order: {sec.sortOrder ?? 0}</span>
                  {sec.lifecycleStatus !== "ARCHIVED" && (
                    <span style={{ color: (sec.publishedItemCount ?? 0) === (sec.itemCount ?? 0) && (sec.itemCount ?? 0) > 0 ? "#065f46" : "#92400e", fontWeight: 600 }}>
                      {(sec.itemCount ?? 0) > 0
                        ? (sec.publishedItemCount ?? 0) === (sec.itemCount ?? 0)
                          ? `Ready to publish: ${sec.publishedItemCount}/${sec.itemCount} items`
                          : `Not ready: ${sec.publishedItemCount ?? 0}/${sec.itemCount ?? 0} items published`
                        : "No items"}
                    </span>
                  )}
                </div>
                {renderActionButtons(sec, getSectionActions(sec, sessionRole === "SUPER_ADMIN"), handleLifecycleTransitionSection, handleDeleteSection)}
                <div style={styles.sectionActions}>
                  {sec.lifecycleStatus !== "ARCHIVED" && (
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
                  )}
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
                      <span style={statusBadge(item.lifecycleStatus)}>{item.lifecycleStatus === "ARCHIVED" ? "Removed" : item.lifecycleStatus === "PUBLISHED" ? "Published" : item.lifecycleStatus === "HIDDEN" ? "Hidden" : item.lifecycleStatus === "IN_REVIEW" ? "Needs Review" : "Draft"}</span>
                      <span>Order: {item.sortOrder ?? 0}</span>
                      {item.lifecycleStatus !== "ARCHIVED" && (
                        <span style={{ fontSize: 11, color: item.mediaCategory === "GALLERY" && item.mediaApprovalStatus === "APPROVED" && item.mediaLifecycleStatus === "PUBLISHED" && item.mediaVisible === 1 ? "#065f46" : "#92400e" }}>
                          {item.mediaCategory === "GALLERY" && item.mediaApprovalStatus === "APPROVED" && item.mediaLifecycleStatus === "PUBLISHED" && item.mediaVisible === 1 ? "Media ready" : "Media not ready"}
                        </span>
                      )}
                    </div>
                    {renderActionButtons(item, getItemActions(item), handleLifecycleTransitionItem, handleDeleteItem)}
                  </div>
                  <div style={styles.itemActions}>
                    {item.lifecycleStatus !== "ARCHIVED" && (
                      <button type="button" className="button secondary small" onClick={() => startEditItem(item)}>
                        Edit
                      </button>
                    )}
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
