import type {
  MediaAssetDto,
  GallerySectionDto,
  GalleryItemDto,
  Pagination,
  MediaLibraryFilters,
} from "./admin-media-types";

type ApiResponse<T> = { success: boolean; error?: string } & T;

function authHeaders(csrf: string): Record<string, string> {
  return { "Content-Type": "application/json", "x-csrf-token": csrf };
}

function qs(params: Record<string, string>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== "" && v !== "ALL");
  return entries.length > 0 ? `?${new URLSearchParams(entries).toString()}` : "";
}

/* ──────────── Media Library ──────────── */

export async function fetchMediaLibrary(
  csrf: string,
  filters: MediaLibraryFilters,
  limit: number,
  offset: number,
): Promise<{ items: MediaAssetDto[]; pagination: Pagination }> {
  const params: Record<string, string> = {
    limit: String(limit),
    offset: String(offset),
  };
  if (filters.search) params.search = filters.search;
  if (filters.storageType && filters.storageType !== "ALL") params.storageType = filters.storageType;
  if (filters.category && filters.category !== "ALL") params.category = filters.category;
  if (filters.purpose && filters.purpose !== "ALL") params.purpose = filters.purpose;
  if (filters.lifecycleStatus && filters.lifecycleStatus !== "ALL") params.lifecycleStatus = filters.lifecycleStatus;

  const res = await fetch(`/api/admin/media/library${qs(params)}`, {
    headers: authHeaders(csrf),
  });
  const data = (await res.json()) as ApiResponse<{ items: MediaAssetDto[]; pagination: Pagination }>;
  if (!res.ok || !data.success) throw new Error(String(data.error || "Failed to load media library."));
  return { items: data.items, pagination: data.pagination };
}

export async function patchMediaAsset(
  csrf: string,
  id: string,
  expectedVersion: number,
  fields: Record<string, unknown>,
): Promise<MediaAssetDto> {
  const res = await fetch(`/api/admin/media/library/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: authHeaders(csrf),
    body: JSON.stringify({ ...fields, expectedVersion }),
  });
  const data = (await res.json()) as ApiResponse<{ outcome: string; item: MediaAssetDto }>;
  if (!res.ok) throw new Error(String(data.error || "Failed to update media asset."));
  return data.item;
}

export async function deleteMediaAsset(
  csrf: string,
  id: string,
  expectedVersion: number,
): Promise<void> {
  const res = await fetch(`/api/admin/media/library/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: authHeaders(csrf),
    body: JSON.stringify({ expectedVersion }),
  });
  const data = (await res.json()) as ApiResponse<Record<string, never>>;
  if (!res.ok) throw new Error(String(data.error || "Failed to archive media asset."));
}

/* ──────────── Gallery Sections ──────────── */

export async function fetchGallerySections(
  csrf: string,
  limit: number,
  offset: number,
  lifecycleStatus?: string,
): Promise<{ sections: GallerySectionDto[]; pagination: Pagination }> {
  const params: Record<string, string> = {
    limit: String(limit),
    offset: String(offset),
  };
  if (lifecycleStatus && lifecycleStatus !== "ALL") params.lifecycleStatus = lifecycleStatus;

  const res = await fetch(`/api/admin/gallery/sections${qs(params)}`, {
    headers: authHeaders(csrf),
  });
  const data = (await res.json()) as ApiResponse<{ sections: GallerySectionDto[]; pagination: Pagination }>;
  if (!res.ok || !data.success) throw new Error(String(data.error || "Failed to load gallery sections."));
  return { sections: data.sections, pagination: data.pagination };
}

export async function createGallerySection(
  csrf: string,
  payload: { name: string; slug?: string; description?: string; sortOrder?: number },
): Promise<{ outcome: string }> {
  const res = await fetch("/api/admin/gallery/sections", {
    method: "POST",
    headers: authHeaders(csrf),
    body: JSON.stringify(payload),
  });
  const data = (await res.json()) as ApiResponse<{ outcome: string }>;
  if (!res.ok) throw new Error(String(data.error || "Failed to create gallery section."));
  return { outcome: data.outcome };
}

export async function patchGallerySection(
  csrf: string,
  id: string,
  expectedVersion: number,
  fields: Record<string, unknown>,
): Promise<GallerySectionDto> {
  const res = await fetch(`/api/admin/gallery/sections/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: authHeaders(csrf),
    body: JSON.stringify({ ...fields, expectedVersion }),
  });
  const data = (await res.json()) as ApiResponse<{ outcome: string; item: GallerySectionDto }>;
  if (!res.ok) throw new Error(String(data.error || "Failed to update gallery section."));
  return data.item;
}

export async function deleteGallerySection(
  csrf: string,
  id: string,
  expectedVersion: number,
): Promise<{ outcome: string }> {
  const res = await fetch(`/api/admin/gallery/sections/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: authHeaders(csrf),
    body: JSON.stringify({ expectedVersion }),
  });
  const data = (await res.json()) as ApiResponse<{ outcome: string }>;
  if (!res.ok) throw new Error(String(data.error || "Failed to delete gallery section."));
  return { outcome: data.outcome };
}

/* ──────────── Gallery Items ──────────── */

export async function fetchGalleryItems(
  csrf: string,
  sectionId: string,
  limit: number,
  offset: number,
  lifecycleStatus?: string,
): Promise<{ items: GalleryItemDto[]; pagination: Pagination }> {
  const params: Record<string, string> = {
    sectionId,
    limit: String(limit),
    offset: String(offset),
  };
  if (lifecycleStatus && lifecycleStatus !== "ALL") params.lifecycleStatus = lifecycleStatus;

  const res = await fetch(`/api/admin/gallery/items${qs(params)}`, {
    headers: authHeaders(csrf),
  });
  const data = (await res.json()) as ApiResponse<{ items: GalleryItemDto[]; pagination: Pagination }>;
  if (!res.ok || !data.success) throw new Error(String(data.error || "Failed to load gallery items."));
  return { items: data.items, pagination: data.pagination };
}

export async function createGalleryItem(
  csrf: string,
  payload: {
    sectionId: string;
    mediaId: string;
    slotKey?: string;
    titleOverride?: string;
    altTextOverride?: string;
    captionOverride?: string;
    sortOrder?: number;
  },
): Promise<{ outcome: string }> {
  const res = await fetch("/api/admin/gallery/items", {
    method: "POST",
    headers: authHeaders(csrf),
    body: JSON.stringify(payload),
  });
  const data = (await res.json()) as ApiResponse<{ outcome: string }>;
  if (!res.ok) throw new Error(String(data.error || "Failed to create gallery item."));
  return { outcome: data.outcome };
}

export async function patchGalleryItem(
  csrf: string,
  id: string,
  expectedVersion: number,
  fields: Record<string, unknown>,
): Promise<GalleryItemDto> {
  const res = await fetch(`/api/admin/gallery/items/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: authHeaders(csrf),
    body: JSON.stringify({ ...fields, expectedVersion }),
  });
  const data = (await res.json()) as ApiResponse<{ outcome: string; item: GalleryItemDto }>;
  if (!res.ok) throw new Error(String(data.error || "Failed to update gallery item."));
  return data.item;
}

export async function deleteGalleryItem(
  csrf: string,
  id: string,
  expectedVersion: number,
): Promise<{ outcome: string }> {
  const res = await fetch(`/api/admin/gallery/items/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: authHeaders(csrf),
    body: JSON.stringify({ expectedVersion }),
  });
  const data = (await res.json()) as ApiResponse<{ outcome: string }>;
  if (!res.ok) throw new Error(String(data.error || "Failed to delete gallery item."));
  return { outcome: data.outcome };
}

/* ──────────── Gallery Reorder ──────────── */

export async function reorderGalleryItems(
  csrf: string,
  sectionId: string,
  itemOrder: { id: string; version: number }[],
): Promise<{ outcome: string }> {
  const res = await fetch("/api/admin/gallery/items/reorder", {
    method: "POST",
    headers: authHeaders(csrf),
    body: JSON.stringify({ sectionId, itemOrder }),
  });
  const data = (await res.json()) as ApiResponse<{ outcome: string }>;
  if (!res.ok) throw new Error(String(data.error || "Failed to reorder gallery items."));
  return { outcome: data.outcome };
}
