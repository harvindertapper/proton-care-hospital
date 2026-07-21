import type {
  MediaAssetDto,
  GallerySectionDto,
  GalleryItemDto,
  Pagination,
  MediaLibraryFilters,
} from "./admin-media-types";

export class AdminApiError extends Error {
  status: number;
  outcome?: string;
  revision?: unknown;
  constructor(message: string, status: number, opts?: { outcome?: string; revision?: unknown }) {
    super(message);
    this.name = "AdminApiError";
    this.status = status;
    this.outcome = opts?.outcome;
    this.revision = opts?.revision;
  }
}

type ApiResponse<T> = { success: boolean; error?: string } & T;

function authHeaders(csrf: string): Record<string, string> {
  return { "Content-Type": "application/json", "x-csrf-token": csrf };
}

function qs(params: Record<string, string>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== "" && v !== "ALL");
  return entries.length > 0 ? `?${new URLSearchParams(entries).toString()}` : "";
}

async function handleResponse<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({ error: "Network error." }))) as ApiResponse<T>;
  if (!res.ok || !data.success) {
    throw new AdminApiError(
      String(data.error || "Request failed."),
      res.status,
      { outcome: (data as Record<string, unknown>).outcome as string | undefined, revision: (data as Record<string, unknown>).revision },
    );
  }
  return data as T;
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
  if ((filters as Record<string, unknown>).status && (filters as Record<string, unknown>).status !== "ALL") params.status = String((filters as Record<string, unknown>).status);
  if ((filters as Record<string, unknown>).rightsStatus && (filters as Record<string, unknown>).rightsStatus !== "ALL") params.rightsStatus = String((filters as Record<string, unknown>).rightsStatus);

  const res = await fetch(`/api/admin/media/library${qs(params)}`, {
    headers: authHeaders(csrf),
  });
  return handleResponse<{ items: MediaAssetDto[]; pagination: Pagination }>(res);
}

export async function patchMediaAsset(
  csrf: string,
  id: string,
  expectedVersion: number,
  fields: Record<string, unknown>,
): Promise<{ outcome: string; item: MediaAssetDto }> {
  const res = await fetch(`/api/admin/media/library/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: authHeaders(csrf),
    body: JSON.stringify({ ...fields, expectedVersion }),
  });
  return handleResponse<{ outcome: string; item: MediaAssetDto }>(res);
}

export async function deleteMediaAsset(
  csrf: string,
  id: string,
  expectedVersion: number,
): Promise<{ outcome: string }> {
  const res = await fetch(`/api/admin/media/library/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: authHeaders(csrf),
    body: JSON.stringify({ expectedVersion }),
  });
  return handleResponse<{ outcome: string }>(res);
}

export async function uploadMediaAsset(
  csrf: string,
  formData: FormData,
): Promise<{ id: string; r2_key: string; url: string; purpose: string; [k: string]: unknown }> {
  const res = await fetch("/api/admin/media", {
    method: "POST",
    headers: { "x-csrf-token": csrf },
    body: formData,
  });
  return handleResponse<{ id: string; r2_key: string; url: string; purpose: string }>(res);
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
  return handleResponse<{ sections: GallerySectionDto[]; pagination: Pagination }>(res);
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
  return handleResponse<{ outcome: string }>(res);
}

export async function patchGallerySection(
  csrf: string,
  id: string,
  expectedVersion: number,
  fields: Record<string, unknown>,
): Promise<{ outcome: string; item: GallerySectionDto }> {
  const res = await fetch(`/api/admin/gallery/sections/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: authHeaders(csrf),
    body: JSON.stringify({ ...fields, expectedVersion }),
  });
  return handleResponse<{ outcome: string; item: GallerySectionDto }>(res);
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
  return handleResponse<{ outcome: string }>(res);
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
  return handleResponse<{ items: GalleryItemDto[]; pagination: Pagination }>(res);
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
  return handleResponse<{ outcome: string }>(res);
}

export async function patchGalleryItem(
  csrf: string,
  id: string,
  expectedVersion: number,
  fields: Record<string, unknown>,
): Promise<{ outcome: string; item: GalleryItemDto }> {
  const res = await fetch(`/api/admin/gallery/items/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: authHeaders(csrf),
    body: JSON.stringify({ ...fields, expectedVersion }),
  });
  return handleResponse<{ outcome: string; item: GalleryItemDto }>(res);
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
  return handleResponse<{ outcome: string }>(res);
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
  return handleResponse<{ outcome: string }>(res);
}
