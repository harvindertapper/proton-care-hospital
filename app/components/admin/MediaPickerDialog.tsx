"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { MediaAssetDto } from "./admin-media-types";
import { fetchMediaLibrary } from "./admin-media-api";

type Props = {
  csrf: string;
  onClose: () => void;
  onSelect: (asset: MediaAssetDto) => void;
};

export default function MediaPickerDialog({ csrf, onClose, onSelect }: Props) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("GALLERY");
  const [lifecycleStatus, setLifecycleStatus] = useState("PUBLISHED");
  const [assets, setAssets] = useState<MediaAssetDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const offsetRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const LIMIT = 24;

  const loadAssets = useCallback(
    async (reset: boolean) => {
      setLoading(true);
      try {
        const offset = reset ? 0 : offsetRef.current;
        const result = await fetchMediaLibrary(csrf, {
          search,
          storageType: "ALL",
          category: category || "ALL",
          purpose: "ALL",
          lifecycleStatus: lifecycleStatus || "ALL",
        }, LIMIT, offset);
        const items = result.items ?? [];
        if (reset) {
          setAssets(items);
          offsetRef.current = items.length;
        } else {
          setAssets((prev) => [...prev, ...items]);
          offsetRef.current = offset + items.length;
        }
        setHasMore(items.length >= LIMIT);
      } catch {
        // silently fail — assets stays as-is
      } finally {
        setLoading(false);
      }
    },
    [csrf, search, category, lifecycleStatus],
  );

  // reset and reload when filters change
  useEffect(() => {
    offsetRef.current = 0;
    loadAssets(true);
  }, [loadAssets]);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      offsetRef.current = 0;
      loadAssets(true);
    }, 300);
  };

  const handleLoadMore = () => {
    if (!loading && hasMore) loadAssets(false);
  };

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  const handleSelect = (asset: MediaAssetDto) => {
    setSelectedId(asset.id);
    onSelect(asset);
  };

  const categoryOptions = [
    { value: "GALLERY", label: "Gallery" },
    { value: "ICON", label: "Icon" },
    { value: "BANNER", label: "Banner" },
    { value: "DOCUMENT", label: "Document" },
    { value: "AVATAR", label: "Avatar" },
    { value: "", label: "All" },
  ];

  const lifecycleOptions = [
    { value: "PUBLISHED", label: "Published" },
    { value: "DRAFT", label: "Draft" },
    { value: "ARCHIVED", label: "Archived" },
    { value: "", label: "All" },
  ];

  return (
    <div
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
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
            Select Media Asset
          </h2>
          <button
            onClick={onClose}
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
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Search */}
        <input
          type="text"
          placeholder="Search assets..."
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
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

        {/* Filters */}
        <div
          style={{
            display: "flex",
            gap: 12,
            marginBottom: 16,
            flexWrap: "wrap",
          }}
        >
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            style={{
              padding: "6px 10px",
              borderRadius: 6,
              border: "1px solid var(--border)",
              fontSize: 13,
            }}
          >
            {categoryOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <select
            value={lifecycleStatus}
            onChange={(e) => setLifecycleStatus(e.target.value)}
            style={{
              padding: "6px 10px",
              borderRadius: 6,
              border: "1px solid var(--border)",
              fontSize: 13,
            }}
          >
            {lifecycleOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Grid */}
        {loading && assets.length === 0 ? (
          <div style={{ textAlign: "center", padding: 32, color: "#94a3b8" }}>
            <div
              style={{
                width: 24,
                height: 24,
                border: "3px solid #e2e8f0",
                borderTopColor: "#0d9488",
                borderRadius: "50%",
                animation: "spin 0.8s linear infinite",
                margin: "0 auto 8px",
              }}
            />
            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
            Loading...
          </div>
        ) : assets.length === 0 ? (
          <div style={{ textAlign: "center", padding: 32, color: "#94a3b8" }}>
            No assets found.
          </div>
        ) : (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 12,
              }}
            >
              <style>{`
                @media (max-width: 768px) {
                  .media-picker-grid { grid-template-columns: repeat(2, 1fr) !important; }
                }
                @media (max-width: 480px) {
                  .media-picker-grid { grid-template-columns: 1fr !important; }
                }
                .media-picker-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
              `}</style>
              <div className="media-picker-grid" style={{ display: "contents" }}>
                {assets.map((asset) => {
                  const isSelected = selectedId === asset.id;
                  return (
                    <div
                      key={asset.id}
                      className="media-picker-card"
                      onClick={() => handleSelect(asset)}
                      style={{
                        background: "#fff",
                        border: isSelected
                          ? "2px solid #0d9488"
                          : "1px solid #e2e8f0",
                        borderRadius: 8,
                        padding: 8,
                        cursor: "pointer",
                        transition: "box-shadow 0.15s",
                      }}
                    >
                      <img
                        src={asset.thumbnailUrl || asset.displayUrl || asset.originalUrl || ""}
                        alt={asset.title || asset.fileName}
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
                        >
                          {asset.fileName}
                        </div>
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
                              background:
                                asset.lifecycleStatus === "PUBLISHED"
                                  ? "#ecfdf5"
                                  : asset.lifecycleStatus === "DRAFT"
                                    ? "#fef9c3"
                                    : "#f1f5f9",
                              color:
                                asset.lifecycleStatus === "PUBLISHED"
                                  ? "#059669"
                                  : asset.lifecycleStatus === "DRAFT"
                                    ? "#a16207"
                                    : "#64748b",
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
                        style={{ width: "100%", marginTop: 8 }}
                      >
                        Select
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Load More */}
            {hasMore && (
              <div style={{ textAlign: "center", marginTop: 16 }}>
                <button
                  className="button primary small"
                  onClick={handleLoadMore}
                  disabled={loading}
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
