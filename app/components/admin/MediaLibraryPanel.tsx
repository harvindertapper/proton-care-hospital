"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { MediaAssetDto, MediaLibraryFilters, Pagination } from "./admin-media-types";
import { fetchMediaLibrary, patchMediaAsset, deleteMediaAsset } from "./admin-media-api";
import MediaEditDialog from "./MediaEditDialog";

type Props = {
  csrf: string;
  sessionRole: "SUPER_ADMIN" | "STAFF";
  onUpload: () => void;
};

const PAGE_LIMIT = 25;

const LIFECYCLE_OPTIONS = ["ALL", "DRAFT", "IN_REVIEW", "PUBLISHED", "HIDDEN", "ARCHIVED"] as const;
const STORAGE_OPTIONS = ["ALL", "R2", "PUBLIC"] as const;
const CATEGORY_OPTIONS = ["ALL", "GENERAL", "GALLERY", "DOCTOR", "BLOG", "VIDEO_POSTER"] as const;
const PURPOSE_OPTIONS = ["ALL", "gallery", "doctor-photo", "admin-upload"] as const;

const LIFECYCLE_COLORS: Record<string, { bg: string; color: string }> = {
  PUBLISHED: { bg: "#d1fae5", color: "#065f46" },
  DRAFT: { bg: "#f1f5f9", color: "#475569" },
  IN_REVIEW: { bg: "#fef3c7", color: "#92400e" },
  HIDDEN: { bg: "#fee2e2", color: "#991b1b" },
  ARCHIVED: { bg: "#e2e8f0", color: "#64748b" },
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

export function MediaLibraryPanel({ csrf, sessionRole, onUpload }: Props) {
  const [items, setItems] = useState<MediaAssetDto[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ limit: PAGE_LIMIT, offset: 0, total: 0, hasMore: false });
  const [filters, setFilters] = useState<MediaLibraryFilters>({ search: "", storageType: "ALL", category: "ALL", purpose: "ALL", lifecycleStatus: "ALL" });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [editingAsset, setEditingAsset] = useState<MediaAssetDto | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const debouncedSearch = useDebounce(filters.search, 300);

  const loadPage = useCallback(
    async (offset: number, append: boolean) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      setError("");

      try {
        const resolvedFilters: MediaLibraryFilters = { ...filters, search: debouncedSearch };
        const result = await fetchMediaLibrary(csrf, resolvedFilters, PAGE_LIMIT, offset);
        if (controller.signal.aborted) return;
        setItems((prev) => (append ? [...prev, ...result.items] : result.items));
        setPagination(result.pagination);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Failed to load media library.");
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [csrf, filters, debouncedSearch],
  );

  useEffect(() => {
    loadPage(0, false);
  }, [loadPage]);

  const handleFilterChange = useCallback((key: keyof MediaLibraryFilters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleDelete = useCallback(
    async (asset: MediaAssetDto) => {
      if (!window.confirm(`Are you sure you want to archive "${asset.fileName}"?`)) return;
      try {
        await deleteMediaAsset(csrf, asset.id, asset.version);
        loadPage(pagination.offset, false);
      } catch (err) {
        alert(err instanceof Error ? err.message : "Failed to archive asset.");
      }
    },
    [csrf, pagination.offset, loadPage],
  );

  const handleCopyUrl = useCallback((url: string | null) => {
    if (url) navigator.clipboard.writeText(url);
  }, []);

  const getThumbSrc = (asset: MediaAssetDto) => asset.thumbnailUrl || asset.displayUrl || asset.originalUrl;
  const isAdmin = sessionRole === "SUPER_ADMIN";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Filter bar */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <input
          type="text"
          placeholder="Search media..."
          value={filters.search}
          onChange={(e) => handleFilterChange("search", e.target.value)}
          style={{ flex: "1 1 200px", padding: "8px 12px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 14 }}
        />
        <select
          value={filters.storageType}
          onChange={(e) => handleFilterChange("storageType", e.target.value)}
          style={{ padding: "8px 12px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 14 }}
        >
          {STORAGE_OPTIONS.map((v) => (
            <option key={v} value={v}>{v === "ALL" ? "All Storage" : v}</option>
          ))}
        </select>
        <select
          value={filters.category}
          onChange={(e) => handleFilterChange("category", e.target.value)}
          style={{ padding: "8px 12px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 14 }}
        >
          {CATEGORY_OPTIONS.map((v) => (
            <option key={v} value={v}>{v === "ALL" ? "All Categories" : v.replace("_", " ")}</option>
          ))}
        </select>
        <select
          value={filters.purpose}
          onChange={(e) => handleFilterChange("purpose", e.target.value)}
          style={{ padding: "8px 12px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 14 }}
        >
          {PURPOSE_OPTIONS.map((v) => (
            <option key={v} value={v}>{v === "ALL" ? "All Purposes" : v}</option>
          ))}
        </select>
        <select
          value={filters.lifecycleStatus}
          onChange={(e) => handleFilterChange("lifecycleStatus", e.target.value)}
          style={{ padding: "8px 12px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 14 }}
        >
          {LIFECYCLE_OPTIONS.map((v) => (
            <option key={v} value={v}>{v === "ALL" ? "All Statuses" : v.replace("_", " ")}</option>
          ))}
        </select>
      </div>

      {/* Stats row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 14, color: "#64748b" }}>
          {pagination.total.toLocaleString()} media asset{pagination.total !== 1 ? "s" : ""}
        </span>
        {isAdmin && (
          <button className="button primary" onClick={onUpload} style={{ fontSize: 14 }}>
            Upload New
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: "12px 16px", background: "#fee2e2", color: "#991b1b", borderRadius: 8, fontSize: 14 }}>
          {error}
        </div>
      )}

      {/* Skeleton grid */}
      {loading && items.length === 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden", background: "#fff" }}>
              <div style={{ height: 140, background: "#e2e8f0", animation: "pulse 1.5s infinite ease-in-out" }} />
              <div style={{ padding: 12 }}>
                <div style={{ height: 14, background: "#e2e8f0", borderRadius: 4, width: "70%", marginBottom: 8 }} />
                <div style={{ height: 12, background: "#e2e8f0", borderRadius: 4, width: "50%" }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && items.length === 0 && !error && (
        <div style={{ textAlign: "center", padding: 48, color: "#94a3b8", fontSize: 15 }}>
          No media assets found.
        </div>
      )}

      {/* Media grid */}
      {!loading && items.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
          {items.map((asset) => {
            const thumbSrc = getThumbSrc(asset);
            const lcColor = LIFECYCLE_COLORS[asset.lifecycleStatus] || LIFECYCLE_COLORS.DRAFT;
            return (
              <div
                key={asset.id}
                style={{
                  border: "1px solid #e2e8f0",
                  borderRadius: 12,
                  overflow: "hidden",
                  background: "#fff",
                  transition: "box-shadow 0.15s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.1)")}
                onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "none")}
              >
                {/* Thumbnail */}
                <div style={{ height: 140, background: "#f1f5f9", overflow: "hidden" }}>
                  {thumbSrc ? (
                    <img src={thumbSrc} alt={asset.altText || asset.fileName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontSize: 13 }}>
                      No Preview
                    </div>
                  )}
                </div>

                {/* Details */}
                <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={asset.fileName}>
                    {asset.fileName}
                  </div>
                  {asset.title && (
                    <div style={{ fontSize: 12, color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={asset.title}>
                      {asset.title}
                    </div>
                  )}

                  {/* Badges */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, background: "#f1f5f9", color: "#475569" }}>
                      {asset.category}
                    </span>
                    <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, background: lcColor.bg, color: lcColor.color }}>
                      {asset.lifecycleStatus.replace("_", " ")}
                    </span>
                    <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, background: "#ede9fe", color: "#6d28d9" }}>
                      {asset.storageType}
                    </span>
                    <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, background: "#f8fafc", color: "#64748b" }}>
                      {formatBytes(asset.sizeBytes)}
                    </span>
                  </div>

                  {/* Actions */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                    {asset.originalUrl && (
                      <a
                        href={asset.originalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="button subtle small"
                        style={{ fontSize: 12, textDecoration: "none" }}
                      >
                        Preview
                      </a>
                    )}
                    {asset.originalUrl && (
                      <button className="button subtle small" style={{ fontSize: 12 }} onClick={() => handleCopyUrl(asset.originalUrl)}>
                        Copy URL
                      </button>
                    )}
                    {isAdmin && (
                      <>
                        <button className="button secondary small" style={{ fontSize: 12 }} onClick={() => setEditingAsset(asset)}>
                          Edit
                        </button>
                        <button className="button subtle small" style={{ fontSize: 12, color: "#dc2626" }} onClick={() => handleDelete(asset)}>
                          Archive
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Load more */}
      {pagination.hasMore && !loading && (
        <div style={{ textAlign: "center", padding: 8 }}>
          <button
            className="button primary"
            disabled={loadingMore}
            onClick={() => loadPage(pagination.offset + PAGE_LIMIT, true)}
            style={{ fontSize: 14 }}
          >
            {loadingMore ? "Loading..." : "Load More"}
          </button>
        </div>
      )}

      {/* Edit dialog */}
      {editingAsset && (
        <MediaEditDialog
          asset={editingAsset}
          csrf={csrf}
          onClose={() => setEditingAsset(null)}
          onSaved={() => {
            setEditingAsset(null);
            loadPage(pagination.offset, false);
          }}
        />
      )}
    </div>
  );
}
