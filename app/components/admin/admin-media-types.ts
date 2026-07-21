export type MediaAssetDto = {
  id: string;
  storageType: string;
  category: string;
  purpose: string;
  title: string;
  altText: string;
  caption: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  rightsStatus: string;
  rightsSource: string;
  sourceUrl: string | null;
  status: string;
  isVisible: number;
  lifecycleStatus: string;
  version: number;
  createdAt: string;
  updatedAt: string | null;
  publishedAt: string | null;
  deletedAt: string | null;
  purgeStatus: string;
  originalUrl: string | null;
  displayUrl: string | null;
  thumbnailUrl: string | null;
};

export type GallerySectionDto = {
  id: string;
  slug: string;
  name: string;
  description: string;
  sortOrder: number;
  lifecycleStatus: string;
  version: number;
  createdBy: string;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  deletedAt: string | null;
  itemCount: number;
  publishedItemCount: number;
};

export type GalleryItemDto = {
  id: string;
  sectionId: string;
  mediaId: string;
  slotKey: string | null;
  titleOverride: string;
  altTextOverride: string;
  captionOverride: string;
  sortOrder: number;
  lifecycleStatus: string;
  version: number;
  createdBy: string;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  deletedAt: string | null;
  originalUrl: string;
  displayUrl: string;
  thumbnailUrl: string;
  mediaCategory: string;
  mediaLifecycleStatus: string;
  mediaApprovalStatus: string;
  mediaVisible: number;
};

export type Pagination = {
  limit: number;
  offset: number;
  total: number;
  hasMore: boolean;
};

export type MediaLibraryFilters = {
  search: string;
  storageType: string;
  category: string;
  purpose: string;
  lifecycleStatus: string;
  status?: string;
  rightsStatus?: string;
};

export const LIFECYCLE_STATUSES = ["DRAFT", "IN_REVIEW", "PUBLISHED", "HIDDEN", "ARCHIVED"] as const;
export const MEDIA_STATUSES = ["NEW", "NEEDS_REVIEW", "APPROVED", "HIDDEN"] as const;
export const STORAGE_TYPES = ["R2", "PUBLIC"] as const;
export const MEDIA_CATEGORIES = ["GENERAL", "GALLERY", "DOCTOR", "BLOG", "VIDEO_POSTER"] as const;
export const PURPOSES = ["gallery", "doctor-photo", "admin-upload"] as const;
export const RIGHTS_STATUSES = ["UNVERIFIED", "VERIFIED_INTERNAL", "LICENSED", "PUBLIC_DOMAIN"] as const;
