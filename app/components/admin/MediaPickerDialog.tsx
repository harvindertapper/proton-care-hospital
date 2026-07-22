"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { MediaAssetDto } from "./admin-media-types";
import { fetchMediaLibrary } from "./admin-media-api";

type Props = {
  csrf: string;
  onClose: () => void;
  onSelect: (asset: MediaAssetDto) => void;
  category?: string;
  title?: string;
  categoryLabel?: string;
  selectedId?: string | null;
};

const LIMIT = 24;

const LIFECYCLE_OPTIONS = [
  { value: "ALL", label: "All" },
  { value: "DRAFT", label: "Draft" },
  { value: "PUBLISHED", label: "Published" },
  { value: "IN_REVIEW", label: "In Review" },
  { value: "HIDDEN", label: "Hidden" },
  { value: "ARCHIVED", label: "Archived" },
];

function lifecycleBadgeStyle(status: string): { background: string; color: string } {
  switch (status) {
    case "PUBLISHED":
      return { background: "#ecfdf5", color: "#059669" };
    case "DRAFT":
      return { background: "#fef9c3", color: "#a16207" };
    case "IN_REVIEW":
      return { background: "#eff6ff", color: "#2563eb" };
    case "HIDDEN":
      return { background: "#fef2f2", color: "#dc2626" };
    case "ARCHIVED":
      return { background: "#f1f5f9", color: "#64748b" };
    default:
      return { background: "#f1f5f9", color: "#64748b" };
  }
}

export default function MediaPickerDialog({ csrf, onClose, onSelect, category = "GALLERY", title, categoryLabel, selectedId: externalSelectedId }: Props) {
  const [search, setSearch] = useState("");
  const [lifecycleStatus, setLifecycleStatus] = useState("ALL");
  const [assets, setAssets] = useState<MediaAssetDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hasMore, setHasMore] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(externalSelectedId ?? null);
  const offsetRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const dialogTitle = title || (category === "DOCTOR" ? "Select Doctor Photo" : "Select Gallery Asset");
  const filterLabel = categoryLabel || (category === "DOCTOR" ? "Doctor" : "Gallery");
  const selectLabel = category === "DOCTOR" ? "Select Photo" : "Select";

  const [debouncedSearch, setDebouncedSearch] = useState("");

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(value);
    }, 300);
  }, []);

  useEffect(() => {
    let cancelled = false;
    offsetRef.current = 0;
    fetchMediaLibrary(
      csrf,
      {
        search: debouncedSearch,
        storageType: "ALL",
        category,
        purpose: "ALL",
        lifecycleStatus,
      },
      LIMIT,
      0,
    ).then(
      (result) => {
        if (cancelled) return;
        setAssets(result.items ?? []);
        offsetRef.current = (result.items ?? []).length;
        setHasMore((result.items ?? []).length >= LIMIT);
        setLoading(false);
      },
      (err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load assets.");
          setLoading(false);
        }
      },
    );
    return () => { cancelled = true; };
  }, [csrf, debouncedSearch, lifecycleStatus, category]);

  const loadMore = useCallback(() => {
    if (loading || !hasMore) return;
    setLoading(true);
    (async () => {
      try {
        const result = await fetchMediaLibrary(
          csrf,
          {
            search: debouncedSearch,
            storageType: "ALL",
            category,
            purpose: "ALL",
            lifecycleStatus,
          },
          LIMIT,
          offsetRef.current,
        );
        const items = result.items ?? [];
        setAssets((prev) => [...prev, ...items]);
        offsetRef.current += items.length;
        setHasMore(items.length >= LIMIT);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load more assets.");
      } finally {
        setLoading(false);
      }
    })();
  }, [csrf, debouncedSearch, lifecycleStatus, category, loading, hasMore]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  const handleSelect = (asset: MediaAssetDto) => {
    setSelectedId(asset.id);
    onSelect(asset);
  };

  const handleCardKeyDown = (e: React.KeyboardEvent, asset: MediaAssetDto) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleSelect(asset);
    }
  };

  const retry = () => {
    setError("");
    setLoading(true);
    (async () => {
      try {
        const result = await fetchMediaLibrary(
          csrf,
          {
            search: debouncedSearch,
            storageType: "ALL",
            category,
            purpose: "ALL",
            lifecycleStatus,
          },
          LIMIT,
          offsetRef.current,
        );
        setAssets((prev) => {
          const ids = new Set(prev.map((a) => a.id));
          const newItems = (result.items ?? []).filter((a) => !ids.has(a.id));
          return [...prev, ...newItems];
        });
        offsetRef.current += (result.items ?? []).length;
        setHasMore((result.items ?? []).length >= LIMIT);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load assets.");
      } finally {
        setLoading(false);
      }
    })();
  };

  const isEligible = (asset: MediaAssetDto) =>
    asset.category === category &&
    asset.lifecycleStatus === "PUBLISHED" &&
    asset.status === "APPROVED" &&
    asset.isVisible === 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Select media asset"
      ref={dialogRef}
      tabIndex={-1}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1500,
      }}
      onClick={handleOverlayClick}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          padding: 24,
          width: "100%",
          maxWidth: 900,
          maxHeight: "85vh",
          overflowY: "auto",
          position: "relative",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
            {dialogTitle}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            style={{
              background: "none",
              border: "none",
              fontSize: 20,
              cursor: "pointer",
              padding: "4px 8px",
              borderRadius: 4,
              color: "#64748b",
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        <input
          type="text"
          placeholder="Search assets..."
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          aria-label="Search media assets"
          style={{
            width: "100%",
            padding: "8px 12px",
            border: "1px solid var(--border)",
            borderRadius: 6,
            marginBottom: 12,
            fontSize: 14,
            boxSizing: "border-box",
          }}
        />

        <div
          style={{
            display: "flex",
            gap: 12,
            marginBottom: 16,
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: 13, color: "#64748b", fontWeight: 500 }}>{filterLabel}</span>
          <select
            value={lifecycleStatus}
            onChange={(e) => setLifecycleStatus(e.target.value)}
            aria-label="Filter by lifecycle status"
            style={{
              padding: "6px 10px",
              borderRadius: 6,
              border: "1px solid var(--border)",
              fontSize: 13,
            }}
          >
            {LIFECYCLE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <div
            role="alert"
            aria-live="assertive"
            style={{
              padding: "10px 14px",
              marginBottom: 12,
              borderRadius: 6,
              background: "#fef2f2",
              border: "1px solid #fecaca",
              color: "#991b1b",
              fontSize: 13,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span>{error}</span>
            <button
              onClick={retry}
              aria-label="Retry loading assets"
              style={{
                marginLeft: 12,
                padding: "4px 12px",
                borderRadius: 4,
                border: "1px solid #dc2626",
                background: "#fff",
                color: "#dc2626",
                fontSize: 12,
                cursor: "pointer",
                fontWeight: 600,
                whiteSpace: "nowrap",
              }}
            >
              Retry
            </button>
          </div>
        )}

        {loading && assets.length === 0 && !error ? (
          <div
            role="status"
            aria-live="polite"
            style={{ textAlign: "center", padding: 32, color: "#94a3b8" }}
          >
            <div
              style={{
                width: 24,
                height: 24,
                border: "3px solid #e2e8f0",
                borderTopColor: "#0d9488",
                borderRadius: "50%",
                animation: "media-picker-spin 0.8s linear infinite",
                margin: "0 auto 8px",
              }}
            />
            <style>{`@keyframes media-picker-spin { to { transform: rotate(360deg) } }`}</style>
            Loading...
          </div>
        ) : assets.length === 0 && !error ? (
          <div
            role="status"
            aria-live="polite"
            style={{ textAlign: "center", padding: 32, color: "#94a3b8" }}
          >
            No assets found.
          </div>
        ) : (
          <>
            <div
              className="media-picker-grid"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 12,
              }}
              role="list"
              aria-label="Media assets"
            >
              <style>{`
                @media (max-width: 768px) {
                  .media-picker-grid { grid-template-columns: repeat(2, 1fr) !important; }
                }
                @media (max-width: 480px) {
                  .media-picker-grid { grid-template-columns: 1fr !important; }
                }
                .media-picker-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
                .media-picker-card:focus-visible { outline: 2px solid #0d9488; outline-offset: 2px; }
              `}</style>
              {assets.map((asset) => {
                const isSelected = selectedId === asset.id;
                const eligible = isEligible(asset);
                const lcStyle = lifecycleBadgeStyle(asset.lifecycleStatus);
                return (
                  <div
                    key={asset.id}
                    role="listitem"
                    className="media-picker-card"
                    tabIndex={0}
                    onClick={() => handleSelect(asset)}
                    onKeyDown={(e) => handleCardKeyDown(e, asset)}
                    aria-label={`${asset.title || asset.fileName} — ${asset.lifecycleStatus}, ${asset.status}, ${asset.isVisible ? "visible" : "hidden"}, ${asset.storageType}`}
                    style={{
                      background: "#fff",
                      border: isSelected ? "2px solid #0d9488" : "1px solid #e2e8f0",
                      borderRadius: 8,
                      padding: 8,
                      cursor: "pointer",
                      transition: "box-shadow 0.15s",
                    }}
                  >
                    <img
                      src={asset.thumbnailUrl || asset.displayUrl || asset.originalUrl || ""}
                      alt={asset.altText || asset.title || asset.fileName}
                      style={{
                        width: "100%",
                        height: 120,
                        objectFit: "cover",
                        borderRadius: 4,
                        display: "block",
                      }}
                    />
                    <div style={{ marginTop: 6 }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                        title={asset.title || asset.fileName}
                      >
                        {asset.title || asset.fileName}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "#94a3b8",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                        title={asset.fileName}
                      >
                        {asset.fileName}
                      </div>
                      {eligible && (
                        <span
                          style={{
                            display: "inline-block",
                            padding: "1px 6px",
                            borderRadius: 4,
                            fontSize: 10,
                            fontWeight: 700,
                            background: "#059669",
                            color: "#fff",
                            marginTop: 4,
                          }}
                        >
                          PUBLICATION ELIGIBLE
                        </span>
                      )}
                      <div
                        style={{
                          display: "flex",
                          gap: 4,
                          marginTop: 4,
                          flexWrap: "wrap",
                        }}
                      >
                        <span
                          style={{
                            display: "inline-block",
                            padding: "2px 8px",
                            borderRadius: 4,
                            fontSize: 11,
                            fontWeight: 600,
                            background: lcStyle.background,
                            color: lcStyle.color,
                          }}
                        >
                          {asset.lifecycleStatus}
                        </span>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "2px 8px",
                            borderRadius: 4,
                            fontSize: 11,
                            fontWeight: 600,
                            background: asset.status === "APPROVED" ? "#ecfdf5" : "#f1f5f9",
                            color: asset.status === "APPROVED" ? "#059669" : "#475569",
                          }}
                        >
                          {asset.status}
                        </span>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "2px 8px",
                            borderRadius: 4,
                            fontSize: 11,
                            fontWeight: 600,
                            background: "#f1f5f9",
                            color: "#475569",
                          }}
                        >
                          {asset.isVisible ? "Visible" : "Hidden"}
                        </span>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "2px 8px",
                            borderRadius: 4,
                            fontSize: 11,
                            fontWeight: 600,
                            background: "#f1f5f9",
                            color: "#475569",
                          }}
                        >
                          {asset.storageType}
                        </span>
                      </div>
                    </div>
                    <button
                      className="button primary small"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelect(asset);
                      }}
                      aria-label={`Select ${asset.title || asset.fileName}`}
                      style={{ width: "100%", marginTop: 8 }}
                    >
                      {selectLabel}
                    </button>
                  </div>
                );
              })}
            </div>

            {hasMore && (
              <div style={{ textAlign: "center", marginTop: 16 }}>
                <button
                  className="button primary small"
                  onClick={loadMore}
                  disabled={loading}
                  aria-label="Load more assets"
                >
                  {loading ? "Loading..." : "Load More"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
