import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [
  adminMediaTypes,
  adminMediaApi,
  mediaLibraryPanel,
  _mediaEditDialog,
  _mediaPickerDialog,
  galleryManagerPanel,
  adminConsole,
  galleryClient,
  mediaLibraryRoute,
  mediaLibraryIdRoute,
  gallerySectionsRoute,
  gallerySectionIdRoute,
  galleryItemsRoute,
  galleryItemIdRoute,
  galleryReorderRoute,
  mediaUploadDialog,
] = await Promise.all([
  readFile(new URL("../app/components/admin/admin-media-types.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/components/admin/admin-media-api.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/components/admin/MediaLibraryPanel.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/components/admin/MediaEditDialog.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/components/admin/MediaPickerDialog.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/components/admin/GalleryManagerPanel.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/components/AdminConsole.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/gallery/GalleryClient.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/api/admin/media/library/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/api/admin/media/library/[id]/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/api/admin/gallery/sections/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/api/admin/gallery/sections/[id]/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/api/admin/gallery/items/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/api/admin/gallery/items/[id]/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/api/admin/gallery/items/reorder/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/components/admin/MediaUploadDialog.tsx", import.meta.url), "utf8"),
]);

/* ═══════════════════════════════════════════════════════════════════════════
   1. Media Library API & Types (tests 1-8)
   ═══════════════════════════════════════════════════════════════════════════ */

test("1. MediaAssetDto type has required fields", () => {
  for (const field of ["id", "storageType", "category", "lifecycleStatus", "version"]) {
    assert.ok(adminMediaTypes.includes(field), `MediaAssetDto missing field: ${field}`);
  }
  assert.match(adminMediaTypes, /export\s+type\s+MediaAssetDto\s*=/);
});

test("2. GallerySectionDto type has required fields", () => {
  for (const field of ["id", "slug", "name", "lifecycleStatus", "version", "itemCount", "publishedItemCount"]) {
    assert.ok(adminMediaTypes.includes(field), `GallerySectionDto missing field: ${field}`);
  }
  assert.match(adminMediaTypes, /export\s+type\s+GallerySectionDto\s*=/);
});

test("3. GalleryItemDto type has required fields", () => {
  for (const field of ["id", "sectionId", "mediaId", "slotKey", "lifecycleStatus", "version", "originalUrl", "displayUrl", "thumbnailUrl"]) {
    assert.ok(adminMediaTypes.includes(field), `GalleryItemDto missing field: ${field}`);
  }
  assert.match(adminMediaTypes, /export\s+type\s+GalleryItemDto\s*=/);
});

test("4. fetchMediaLibrary function has correct parameter names", () => {
  assert.match(adminMediaApi, /export\s+async\s+function\s+fetchMediaLibrary/);
  assert.ok(adminMediaApi.includes("csrf: string"), "fetchMediaLibrary must have csrf param");
  assert.ok(adminMediaApi.includes("filters: MediaLibraryFilters"), "fetchMediaLibrary must have filters param");
  assert.ok(adminMediaApi.includes("limit: number"), "fetchMediaLibrary must have limit param");
  assert.ok(adminMediaApi.includes("offset: number"), "fetchMediaLibrary must have offset param");
});

test("5. patchMediaAsset function signature", () => {
  assert.match(adminMediaApi, /export\s+async\s+function\s+patchMediaAsset/);
  assert.ok(adminMediaApi.includes("csrf: string"), "patchMediaAsset must have csrf param");
  assert.ok(adminMediaApi.includes("id: string"), "patchMediaAsset must have id param");
  assert.ok(adminMediaApi.includes("expectedVersion: number"), "patchMediaAsset must have expectedVersion param");
  assert.ok(adminMediaApi.includes("fields: Record<string, unknown>"), "patchMediaAsset must have fields param");
});

test("6. deleteMediaAsset function signature", () => {
  assert.match(adminMediaApi, /export\s+async\s+function\s+deleteMediaAsset/);
  assert.ok(adminMediaApi.includes("csrf: string"), "deleteMediaAsset must have csrf param");
  assert.ok(adminMediaApi.includes("id: string"), "deleteMediaAsset must have id param");
  assert.ok(adminMediaApi.includes("expectedVersion: number"), "deleteMediaAsset must have expectedVersion param");
});

test("7. admin-media-api exports all gallery section functions", () => {
  assert.match(adminMediaApi, /export\s+async\s+function\s+fetchGallerySections/);
  assert.match(adminMediaApi, /export\s+async\s+function\s+createGallerySection/);
  assert.match(adminMediaApi, /export\s+async\s+function\s+patchGallerySection/);
  assert.match(adminMediaApi, /export\s+async\s+function\s+deleteGallerySection/);
});

test("8. admin-media-api exports all gallery item functions", () => {
  assert.match(adminMediaApi, /export\s+async\s+function\s+fetchGalleryItems/);
  assert.match(adminMediaApi, /export\s+async\s+function\s+createGalleryItem/);
  assert.match(adminMediaApi, /export\s+async\s+function\s+patchGalleryItem/);
  assert.match(adminMediaApi, /export\s+async\s+function\s+deleteGalleryItem/);
  assert.match(adminMediaApi, /export\s+async\s+function\s+reorderGalleryItems/);
});

/* ═══════════════════════════════════════════════════════════════════════════
   2. Media Library GET Route (tests 9-13)
   ═══════════════════════════════════════════════════════════════════════════ */

test("9. mediaLibraryRoute GET uses requireAdmin() for auth", () => {
  assert.ok(mediaLibraryRoute.includes("requireAdmin()"), "GET route must call requireAdmin()");
});

test("10. mediaLibraryRoute supports search parameter with LIKE ESCAPE", () => {
  assert.ok(mediaLibraryRoute.includes('get("search")'), "Must read search param");
  assert.ok(mediaLibraryRoute.includes("LIKE ? ESCAPE"), "Must use LIKE with ESCAPE clause");
  assert.ok(mediaLibraryRoute.includes("escapeLikeWildcard"), "Must escape LIKE wildcards");
});

test("11. mediaLibraryRoute supports pagination (limit, offset)", () => {
  assert.ok(mediaLibraryRoute.includes('get("limit")'), "Must read limit param");
  assert.ok(mediaLibraryRoute.includes('get("offset")'), "Must read offset param");
  assert.ok(mediaLibraryRoute.includes("parseLimit"), "Must parse limit");
  assert.ok(mediaLibraryRoute.includes("parseOffset"), "Must parse offset");
});

test("12. mediaLibraryRoute supports lifecycleStatus filter", () => {
  assert.ok(mediaLibraryRoute.includes('get("lifecycleStatus")'), "Must read lifecycleStatus param");
  assert.ok(mediaLibraryRoute.includes("lifecycle_status = ?"), "Must filter by lifecycle_status in SQL");
});

test("13. mediaLibraryRoute supports category filter", () => {
  assert.ok(mediaLibraryRoute.includes('get("category")'), "Must read category param");
  assert.ok(mediaLibraryRoute.includes("category = ?"), "Must filter by category in SQL");
});

/* ═══════════════════════════════════════════════════════════════════════════
   3. Media Library PATCH Route (tests 14-18)
   ═══════════════════════════════════════════════════════════════════════════ */

test("14. mediaLibraryIdRoute PATCH requires SUPER_ADMIN role", () => {
  assert.ok(mediaLibraryIdRoute.includes('requireAdmin({ role: "SUPER_ADMIN" })'), "PATCH must require SUPER_ADMIN");
});

test("15. mediaLibraryIdRoute PATCH requires CSRF token", () => {
  assert.ok(mediaLibraryIdRoute.includes("verifyCsrf"), "PATCH must verify CSRF token");
});

test("16. mediaLibraryIdRoute PATCH requires expectedVersion for optimistic concurrency", () => {
  assert.ok(mediaLibraryIdRoute.includes("expectedVersion"), "PATCH must require expectedVersion");
  assert.ok(mediaLibraryIdRoute.includes("version = version + 1"), "PATCH must increment version on update");
});

test("17. mediaLibraryIdRoute PATCH validates lifecycleStatus=PUBLISHED requires status=APPROVED", () => {
  assert.ok(mediaLibraryIdRoute.includes("PUBLISHED requires status=APPROVED"), "Must enforce PUBLISHED requires APPROVED");
});

test("18. mediaLibraryIdRoute PATCH validates ARCHIVED requires isVisible=0", () => {
  assert.ok(mediaLibraryIdRoute.includes("ARCHIVED requires isVisible=0"), "Must enforce ARCHIVED requires isVisible=0");
});

/* ═══════════════════════════════════════════════════════════════════════════
   4. Media Library DELETE Route (tests 19-22)
   ═══════════════════════════════════════════════════════════════════════════ */

test("19. mediaLibraryIdRoute DELETE requires SUPER_ADMIN role", () => {
  assert.ok(mediaLibraryIdRoute.includes('requireAdmin({ role: "SUPER_ADMIN" })'), "DELETE must require SUPER_ADMIN");
});

test("20. mediaLibraryIdRoute DELETE requires CSRF token", () => {
  const deleteSection = mediaLibraryIdRoute.slice(mediaLibraryIdRoute.indexOf("DELETE"));
  assert.ok(deleteSection.includes("verifyCsrf"), "DELETE must verify CSRF");
});

test("21. mediaLibraryIdRoute DELETE uses reference-safe logical deletion (checks doctor_profiles and gallery_items)", () => {
  assert.ok(mediaLibraryIdRoute.includes("doctor_profiles"), "DELETE must reference doctor_profiles table");
  assert.ok(mediaLibraryIdRoute.includes("gallery_items"), "DELETE must reference gallery_items table");
  assert.ok(mediaLibraryIdRoute.includes("NOT EXISTS"), "DELETE must use NOT EXISTS for reference guard");
});

test("22. mediaLibraryIdRoute DELETE sets lifecycle_status to ARCHIVED", () => {
  assert.ok(mediaLibraryIdRoute.includes("lifecycle_status = 'ARCHIVED'"), "DELETE must set lifecycle_status to ARCHIVED");
  assert.ok(mediaLibraryIdRoute.includes("deleted_at = CURRENT_TIMESTAMP"), "DELETE must set deleted_at");
});

/* ═══════════════════════════════════════════════════════════════════════════
   5. Gallery Sections Route (tests 23-26)
   ═══════════════════════════════════════════════════════════════════════════ */

test("23. gallerySectionsRoute GET supports lifecycleStatus filter", () => {
  assert.ok(gallerySectionsRoute.includes('get("lifecycleStatus")'), "Must read lifecycleStatus param");
  assert.ok(gallerySectionsRoute.includes("lifecycle_status = ?"), "Must filter by lifecycle_status in SQL");
});

test("24. gallerySectionsRoute POST supports Staff revision flow (executeRoleMutation)", () => {
  assert.ok(gallerySectionsRoute.includes("executeRoleMutation"), "POST must use executeRoleMutation");
  assert.ok(gallerySectionsRoute.includes("isStaff"), "POST must check isStaff");
  assert.ok(gallerySectionsRoute.includes("createRevision"), "POST must define createRevision callback");
});

test("25. gallerySectionsRoute POST generates slug from name", () => {
  assert.ok(gallerySectionsRoute.includes("slugify(name)"), "POST must generate slug from name");
});

test("26. gallerySectionsRoute POST validates slug uniqueness", () => {
  assert.ok(gallerySectionsRoute.includes("isSectionSlugAvailable"), "POST must check slug availability");
});

/* ═══════════════════════════════════════════════════════════════════════════
   6. Gallery Section PATCH/DELETE (tests 27-29)
   ═══════════════════════════════════════════════════════════════════════════ */

test("27. gallerySectionIdRoute PATCH validates SECTION_PUBLISHED_GUARD for publication", () => {
  assert.ok(gallerySectionIdRoute.includes("SECTION_PUBLISHED_GUARD"), "PATCH must use SECTION_PUBLISHED_GUARD");
  assert.ok(gallerySectionIdRoute.includes('targetLifecycleStatus === "PUBLISHED"'), "Guard must apply when transitioning to PUBLISHED");
});

test("28. gallerySectionIdRoute DELETE prevents deletion when items exist (reference guard)", () => {
  assert.ok(gallerySectionIdRoute.includes("NOT EXISTS (SELECT 1 FROM gallery_items WHERE section_id"), "DELETE must prevent deletion when items exist");
});

test("29. gallerySectionIdRoute DELETE supports Staff revision flow", () => {
  const deleteStart = gallerySectionIdRoute.lastIndexOf("export async function DELETE");
  const deleteSection = gallerySectionIdRoute.slice(deleteStart);
  assert.ok(deleteSection.includes("executeRoleMutation"), "DELETE must use executeRoleMutation for Staff flow");
  assert.ok(deleteSection.includes("isStaff"), "DELETE must check isStaff");
});

/* ═══════════════════════════════════════════════════════════════════════════
   7. Gallery Items Route (tests 30-33)
   ═══════════════════════════════════════════════════════════════════════════ */

test("30. galleryItemsRoute GET joins with media_assets for URL resolution", () => {
  assert.ok(galleryItemsRoute.includes("INNER JOIN media_assets m ON gi.media_id = m.id"), "GET must join gallery_items with media_assets");
});

test("31. galleryItemsRoute POST validates media_id exists and is GALLERY category", () => {
  assert.ok(galleryItemsRoute.includes("mediaCategory !== \"GALLERY\""), "POST must validate media category is GALLERY");
  assert.ok(galleryItemsRoute.includes("Media asset category must be GALLERY"), "POST must return error for non-GALLERY category");
});

test("32. galleryItemsRoute POST validates section_id exists", () => {
  assert.ok(galleryItemsRoute.includes("gallery_sections WHERE id = ?"), "POST must verify section exists");
  assert.ok(galleryItemsRoute.includes("Gallery section not found"), "POST must error if section not found");
});

test("33. galleryItemsRoute POST supports Staff revision flow", () => {
  assert.ok(galleryItemsRoute.includes("executeRoleMutation"), "POST must use executeRoleMutation");
  assert.ok(galleryItemsRoute.includes("createRevision"), "POST must define createRevision callback");
});

/* ═══════════════════════════════════════════════════════════════════════════
   8. Gallery Item PATCH/DELETE (tests 34-36)
   ═══════════════════════════════════════════════════════════════════════════ */

test("34. galleryItemIdRoute PATCH enforces sectionId and mediaId immutability", () => {
  assert.ok(galleryItemIdRoute.includes("sectionId is immutable"), "PATCH must reject sectionId changes");
  assert.ok(galleryItemIdRoute.includes("mediaId is immutable"), "PATCH must reject mediaId changes");
});

test("35. galleryItemIdRoute PATCH validates ITEM_SECTION_GUARD and ITEM_MEDIA_GUARD for publication", () => {
  assert.ok(galleryItemIdRoute.includes("ITEM_SECTION_GUARD"), "PATCH must use ITEM_SECTION_GUARD");
  assert.ok(galleryItemIdRoute.includes("ITEM_MEDIA_GUARD"), "PATCH must use ITEM_MEDIA_GUARD");
});

test("36. galleryItemIdRoute DELETE supports Staff revision flow", () => {
  const deleteStart = galleryItemIdRoute.lastIndexOf("export async function DELETE");
  const deleteSection = galleryItemIdRoute.slice(deleteStart);
  assert.ok(deleteSection.includes("executeRoleMutation"), "DELETE must use executeRoleMutation for Staff flow");
  assert.ok(deleteSection.includes("isStaff"), "DELETE must check isStaff");
});

/* ═══════════════════════════════════════════════════════════════════════════
   9. Gallery Reorder Route (tests 37-39)
   ═══════════════════════════════════════════════════════════════════════════ */

test("37. galleryReorderRoute validates itemOrder is array with id and version", () => {
  assert.ok(galleryReorderRoute.includes("Array.isArray(itemOrder)"), "Must validate itemOrder is array");
  assert.ok(galleryReorderRoute.includes("typeof e.id !== \"string\""), "Must validate each entry has string id");
  assert.ok(galleryReorderRoute.includes("parseVersion(e.version)"), "Must validate each entry has valid version");
});

test("38. galleryReorderRoute validates no duplicate IDs", () => {
  assert.ok(galleryReorderRoute.includes("uniqueIds"), "Must create Set of unique IDs");
  assert.ok(galleryReorderRoute.includes("duplicate IDs"), "Must error on duplicate IDs");
});

test("39. galleryReorderRoute validates complete itemOrder (no omissions)", () => {
  assert.ok(galleryReorderRoute.includes("activeIdSet"), "Must track active item IDs");
  assert.ok(galleryReorderRoute.includes("Incomplete itemOrder"), "Must error on incomplete itemOrder");
  assert.ok(galleryReorderRoute.includes("activeIdSet.size !== itemOrder.length"), "Must validate count matches");
});

/* ═══════════════════════════════════════════════════════════════════════════
   10. GalleryManagerPanel Component (tests 40-43)
   ═══════════════════════════════════════════════════════════════════════════ */

test("40. GalleryManagerPanel imports all gallery API functions", () => {
  assert.ok(galleryManagerPanel.includes("fetchGallerySections"), "Must import fetchGallerySections");
  assert.ok(galleryManagerPanel.includes("createGallerySection"), "Must import createGallerySection");
  assert.ok(galleryManagerPanel.includes("patchGallerySection"), "Must import patchGallerySection");
  assert.ok(galleryManagerPanel.includes("deleteGallerySection"), "Must import deleteGallerySection");
  assert.ok(galleryManagerPanel.includes("fetchGalleryItems"), "Must import fetchGalleryItems");
  assert.ok(galleryManagerPanel.includes("createGalleryItem"), "Must import createGalleryItem");
  assert.ok(galleryManagerPanel.includes("patchGalleryItem"), "Must import patchGalleryItem");
  assert.ok(galleryManagerPanel.includes("deleteGalleryItem"), "Must import deleteGalleryItem");
  assert.ok(galleryManagerPanel.includes("reorderGalleryItems"), "Must import reorderGalleryItems");
});

test("41. GalleryManagerPanel has two-column layout (left panel for sections, right panel for items)", () => {
  assert.ok(galleryManagerPanel.includes("leftPanel"), "Must have leftPanel style");
  assert.ok(galleryManagerPanel.includes("rightPanel"), "Must have rightPanel style");
  assert.ok(galleryManagerPanel.includes("Gallery Sections"), "Left panel must show Gallery Sections header");
  assert.ok(galleryManagerPanel.includes("Items"), "Right panel must show Items header");
});

test("42. GalleryManagerPanel imports MediaPickerDialog for media selection", () => {
  assert.ok(galleryManagerPanel.includes("import MediaPickerDialog"), "Must import MediaPickerDialog");
  assert.ok(galleryManagerPanel.includes("<MediaPickerDialog"), "Must render MediaPickerDialog component");
});

test("43. GalleryManagerPanel supports reorder mode with up/down arrows", () => {
  assert.ok(galleryManagerPanel.includes("reorderMode"), "Must have reorderMode state");
  assert.ok(galleryManagerPanel.includes("enterReorderMode"), "Must have enterReorderMode function");
  assert.ok(galleryManagerPanel.includes("&uarr;"), "Must have up arrow button");
  assert.ok(galleryManagerPanel.includes("&darr;"), "Must have down arrow button");
  assert.ok(galleryManagerPanel.includes("moveReorderItem"), "Must have moveReorderItem function");
});

/* ═══════════════════════════════════════════════════════════════════════════
   11. MediaLibraryPanel Component (tests 44-46)
   ═══════════════════════════════════════════════════════════════════════════ */

test("44. MediaLibraryPanel has filter controls (search, storageType, category, lifecycleStatus)", () => {
  assert.ok(mediaLibraryPanel.includes("Search media..."), "Must have search input");
  assert.ok(mediaLibraryPanel.includes("STORAGE_OPTIONS"), "Must have storage type filter");
  assert.ok(mediaLibraryPanel.includes("CATEGORY_OPTIONS"), "Must have category filter");
  assert.ok(mediaLibraryPanel.includes("LIFECYCLE_OPTIONS"), "Must have lifecycle status filter");
});

test("45. MediaLibraryPanel imports MediaEditDialog for editing", () => {
  assert.ok(mediaLibraryPanel.includes("import MediaEditDialog"), "Must import MediaEditDialog");
  assert.ok(mediaLibraryPanel.includes("<MediaEditDialog"), "Must render MediaEditDialog component");
});

test("46. MediaLibraryPanel gates edit/delete actions to SUPER_ADMIN", () => {
  assert.ok(mediaLibraryPanel.includes('sessionRole === "SUPER_ADMIN"') || mediaLibraryPanel.includes('isAdmin = sessionRole === "SUPER_ADMIN"'), "Must check SUPER_ADMIN role");
  assert.ok(mediaLibraryPanel.includes("isAdmin"), "Must have isAdmin variable for gating");
});

/* ═══════════════════════════════════════════════════════════════════════════
   12. GalleryClient Dual-Read (tests 47-49)
   ═══════════════════════════════════════════════════════════════════════════ */

test("47. GalleryClient fetches from /api/gallery/v2 first", () => {
  const v2FetchIdx = galleryClient.indexOf('"/api/gallery/v2"');
  const legacyFetchIdx = galleryClient.indexOf('"/api/gallery"');
  assert.ok(v2FetchIdx !== -1, "Must fetch from /api/gallery/v2");
  assert.ok(legacyFetchIdx !== -1, "Must fetch from /api/gallery");
  assert.ok(v2FetchIdx < legacyFetchIdx, "v2 fetch must come before legacy fetch");
});

test("48. GalleryClient falls back to /api/gallery when v2 is not enabled", () => {
  assert.ok(galleryClient.includes("v2Data.success && v2Data.enabled"), "Must check v2 enabled flag");
  assert.ok(galleryClient.includes("/api/gallery"), "Must have fallback fetch to legacy /api/gallery");
});

test("49. GalleryClient renders v2 sections when enabled (checks for sections.map)", () => {
  assert.ok(galleryClient.includes("sections.map"), "Must map over sections for v2 rendering");
  assert.ok(galleryClient.includes("section.name"), "Must render section name");
  assert.ok(galleryClient.includes("section.items.map"), "Must map over items within each section");
});

/* ═══════════════════════════════════════════════════════════════════════════
   13. AdminConsole Integration (test 50)
   ═══════════════════════════════════════════════════════════════════════════ */

test("50. AdminConsole has Media & Gallery tab with sub-views (MediaLibraryPanel, GalleryManagerPanel)", () => {
  assert.ok(adminConsole.includes("Media & Gallery"), "Must have Media & Gallery tab");
  assert.ok(adminConsole.includes("mediaGalleryView"), "Must have mediaGalleryView state");
  assert.ok(adminConsole.includes('import { MediaLibraryPanel }'), "Must import MediaLibraryPanel");
  assert.ok(adminConsole.includes('import { GalleryManagerPanel }'), "Must import GalleryManagerPanel");
  assert.ok(adminConsole.includes("<MediaLibraryPanel"), "Must render MediaLibraryPanel");
  assert.ok(adminConsole.includes("<GalleryManagerPanel"), "Must render GalleryManagerPanel");
  assert.ok(adminConsole.includes("Media Library"), "Must have Media Library sub-view label");
  assert.ok(adminConsole.includes("Gallery Manager"), "Must have Gallery Manager sub-view label");
});

/* ═══════════════════════════════════════════════════════════════════════════
   14. MediaUploadDialog (tests 51-55)
   ═══════════════════════════════════════════════════════════════════════════ */

test("51. MediaUploadDialog has accessible dialog attributes", () => {
  assert.ok(mediaUploadDialog.includes('role="dialog"'), "Must have role=dialog");
  assert.ok(mediaUploadDialog.includes('aria-modal="true"'), "Must have aria-modal=true");
  assert.ok(mediaUploadDialog.includes("Upload Gallery Media"), "Must have aria-label or heading");
});

test("52. MediaUploadDialog accepts only JPEG, PNG, WebP via file input", () => {
  assert.ok(mediaUploadDialog.includes('image/jpeg,image/png,image/webp'), "Must set accept to allowed MIME types");
  assert.ok(mediaUploadDialog.includes("ALLOWED_TYPES"), "Must define ALLOWED_TYPES set");
});

test("53. MediaUploadDialog enforces 5 MiB max file size", () => {
  assert.ok(mediaUploadDialog.includes("5 * 1024 * 1024") || mediaUploadDialog.includes("MAX_BYTES"), "Must define 5 MiB limit");
  assert.ok(mediaUploadDialog.includes("Image must be 5 MB or smaller"), "Must show size error message");
});

test("54. MediaUploadDialog uses detectSignature before upload", () => {
  assert.ok(mediaUploadDialog.includes("detectSignature"), "Must import and use detectSignature");
  assert.ok(mediaUploadDialog.includes("Unsupported file format"), "Must error on invalid signature");
  assert.ok(mediaUploadDialog.includes("Declared type does not match file content"), "Must error on type mismatch");
});

test("55. MediaUploadDialog uploads via POST then PATCHes lifecycle to DRAFT", () => {
  assert.ok(mediaUploadDialog.includes('/api/admin/media"'), "Must POST to /api/admin/media");
  assert.ok(mediaUploadDialog.includes('purpose", "gallery"'), "Must send purpose=gallery");
  assert.ok(mediaUploadDialog.includes('lifecycleStatus: "DRAFT"'), "Must PATCH lifecycle to DRAFT after upload");
  assert.ok(mediaUploadDialog.includes('status: "NEEDS_REVIEW"'), "Must PATCH status to NEEDS_REVIEW");
  assert.ok(mediaUploadDialog.includes("expectedVersion"), "Must include expectedVersion in PATCH");
});

/* ═══════════════════════════════════════════════════════════════════════════
   15. AdminApiError and typed API errors (tests 56-60)
   ═══════════════════════════════════════════════════════════════════════════ */

test("56. AdminApiError class has status, outcome, and revision fields", () => {
  assert.ok(adminMediaApi.includes("status: number"), "Must have status field");
  assert.ok(adminMediaApi.includes("outcome?: string"), "Must have optional outcome field");
  assert.ok(adminMediaApi.includes("revision?: unknown"), "Must have optional revision field");
});

test("57. AdminApiError extends Error with name AdminApiError", () => {
  assert.ok(adminMediaApi.includes('extends Error'), "AdminApiError must extend Error");
  assert.ok(adminMediaApi.includes('this.name = "AdminApiError"'), "Must set name to AdminApiError");
});

test("58. patchMediaAsset sends expectedVersion in JSON body", () => {
  assert.ok(adminMediaApi.includes("body: JSON.stringify({ ...fields, expectedVersion })"), "Must include expectedVersion in PATCH body");
});

test("59. All delete API functions pass expectedVersion in body", () => {
  assert.ok(adminMediaApi.includes("body: JSON.stringify({ expectedVersion })"), "Must send expectedVersion in DELETE body");
});

test("60. fetchMediaLibrary passes status and rightsStatus query params", () => {
  assert.ok(adminMediaApi.includes("params.status = String"), "Must pass status query param");
  assert.ok(adminMediaApi.includes("params.rightsStatus = String"), "Must pass rightsStatus query param");
});

/* ═══════════════════════════════════════════════════════════════════════════
   16. Staff pending behavior (tests 61-64)
   ═══════════════════════════════════════════════════════════════════════════ */

test("61. GalleryManagerPanel handles PENDING_APPROVAL outcome for item transitions", () => {
  assert.ok(galleryManagerPanel.includes('result.outcome === "PENDING_APPROVAL"'), "Must check PENDING_APPROVAL outcome");
  assert.ok(galleryManagerPanel.includes("Submitted for approval"), "Must show submitted-for-approval notice");
});

test("62. GalleryManagerPanel handles PENDING_APPROVAL for reorder saves", () => {
  const reorderSection = galleryManagerPanel.slice(galleryManagerPanel.indexOf("async function saveReorder"));
  assert.ok(reorderSection.includes("PENDING_APPROVAL"), "Reorder must check PENDING_APPROVAL outcome");
});

test("63. GallerySectionsRoute POST creates revision for Staff via executeRoleMutation", () => {
  assert.ok(gallerySectionsRoute.includes("executeRoleMutation"), "Must use executeRoleMutation for Staff");
  assert.ok(gallerySectionsRoute.includes("createRevision"), "Must define createRevision callback");
});

test("64. GalleryManagerPanel handles section lifecycle transitions via patchGallerySection", () => {
  assert.ok(galleryManagerPanel.includes("patchGallerySection(csrf"), "Must call patchGallerySection with csrf");
  assert.ok(galleryManagerPanel.includes("editingSection.version"), "Must pass section version for concurrency");
});

/* ═══════════════════════════════════════════════════════════════════════════
   17. Typed error 409 handling (tests 65-68)
   ═══════════════════════════════════════════════════════════════════════════ */

test("65. GalleryManagerPanel catches AdminApiError with status 409 for stale version on items", () => {
  assert.ok(galleryManagerPanel.includes("err instanceof AdminApiError && err.status === 409"), "Must catch 409 AdminApiError for items");
  assert.ok(galleryManagerPanel.includes("Stale version. Please reload"), "Must show stale version message");
});

test("66. MediaLibraryPanel catches AdminApiError with status 409 for archive conflict", () => {
  assert.ok(mediaLibraryPanel.includes("err instanceof AdminApiError && err.status === 409"), "Must catch 409 AdminApiError");
  assert.ok(mediaLibraryPanel.includes("referenced"), "Must handle referenced conflict on 409");
});

test("67. GalleryManagerPanel catches AdminApiError with status 404 for deleted entities", () => {
  assert.ok(galleryManagerPanel.includes("err instanceof AdminApiError && err.status === 404"), "Must catch 404 AdminApiError");
});

test("68. GalleryManagerPanel catches AdminApiError eligibility/guard errors", () => {
  assert.ok(galleryManagerPanel.includes("eligibility") && galleryManagerPanel.includes("guard"), "Must handle eligibility or guard errors");
  assert.ok(galleryManagerPanel.includes("Publication eligibility not met"), "Must show eligibility error message");
});

/* ═══════════════════════════════════════════════════════════════════════════
   18. MediaPickerDialog GALLERY isolation and features (tests 69-72)
   ═══════════════════════════════════════════════════════════════════════════ */

test("69. MediaPickerDialog fetches with category=GALLERY only", () => {
  assert.ok(_mediaPickerDialog.includes('category: "GALLERY"'), "Must query with category GALLERY");
  assert.ok(_mediaPickerDialog.includes("Select Gallery Asset"), "Must have Gallery-specific heading");
});

test("70. MediaPickerDialog shows PUBLICATION ELIGIBLE badge for eligible assets", () => {
  assert.ok(_mediaPickerDialog.includes("PUBLICATION ELIGIBLE"), "Must show eligibility badge");
  assert.ok(_mediaPickerDialog.includes("isEligible"), "Must define eligibility check function");
  assert.ok(_mediaPickerDialog.includes('lifecycleStatus === "PUBLISHED"'), "Eligibility requires PUBLISHED lifecycle");
});

test("71. MediaPickerDialog has lifecycle filter with6 options", () => {
  assert.ok(_mediaPickerDialog.includes('"ALL"'), "Must have ALL option");
  assert.ok(_mediaPickerDialog.includes('"DRAFT"'), "Must have DRAFT option");
  assert.ok(_mediaPickerDialog.includes('"PUBLISHED"'), "Must have PUBLISHED option");
  assert.ok(_mediaPickerDialog.includes('"IN_REVIEW"'), "Must have IN_REVIEW option");
  assert.ok(_mediaPickerDialog.includes('"HIDDEN"'), "Must have HIDDEN option");
  assert.ok(_mediaPickerDialog.includes('"ARCHIVED"'), "Must have ARCHIVED option");
});

test("72. MediaPickerDialog has keyboard accessible cards and retry button", () => {
  assert.ok(_mediaPickerDialog.includes("tabIndex={0}"), "Cards must be focusable");
  assert.ok(_mediaPickerDialog.includes("handleCardKeyDown"), "Must have keyboard handler for cards");
  assert.ok(_mediaPickerDialog.includes('aria-label="Retry loading assets"'), "Must have accessible retry button");
});

/* ═══════════════════════════════════════════════════════════════════════════
   19. GalleryManagerPanel lifecycle and immutability (tests 73-76)
   ═══════════════════════════════════════════════════════════════════════════ */

test("73. GalleryManagerPanel has lifecycle transition function with valid state transitions", () => {
  assert.ok(galleryManagerPanel.includes("getTransitions"), "Must define getTransitions function");
  assert.ok(galleryManagerPanel.includes("IN_REVIEW"), "DRAFT must transition to IN_REVIEW");
  assert.ok(galleryManagerPanel.includes("PUBLISHED"), "IN_REVIEW must transition to PUBLISHED");
});

test("74. GalleryManagerPanel has immutability note style for editing items", () => {
  assert.ok(galleryManagerPanel.includes("immutabilityNote"), "Must define immutabilityNote style");
  assert.ok(galleryManagerPanel.includes("fontStyle"), "Immutability note must use italic font style");
});

test("75. GalleryManagerPanel shows confirm dialog for section and item deletion", () => {
  assert.ok(galleryManagerPanel.includes("confirm("), "Must use confirm() for destructive actions");
  assert.ok(galleryManagerPanel.includes('Delete section'), "Must confirm section deletion");
  assert.ok(galleryManagerPanel.includes('Delete item'), "Must confirm item deletion");
});

test("76. GalleryManagerPanel has showPicker state for MediaPickerDialog integration", () => {
  assert.ok(galleryManagerPanel.includes("showPicker"), "Must have showPicker state");
  assert.ok(galleryManagerPanel.includes("<MediaPickerDialog"), "Must render MediaPickerDialog");
  assert.ok(galleryManagerPanel.includes("handleMediaSelected"), "Must handle media selection callback");
});

/* ═══════════════════════════════════════════════════════════════════════════
   20. GalleryClient URL validation and v2 handling (tests 77-80)
   ═══════════════════════════════════════════════════════════════════════════ */

test("77. GalleryClient isSafeUrl rejects raw R2 keys and cloudflarestorage URLs", () => {
  assert.ok(galleryClient.includes("r2.cloudflarestorage.com"), "Must reject R2 storage URLs");
  assert.ok(galleryClient.includes("isSafeUrl"), "Must define isSafeUrl function");
});

test("78. GalleryClient isSectionArray validates section structure with slug, name, and items", () => {
  assert.ok(galleryClient.includes("isSectionArray"), "Must define isSectionArray type guard");
  assert.ok(galleryClient.includes('typeof (s as Record<string, unknown>).slug === "string"'), "Must validate slug is string");
  assert.ok(galleryClient.includes('typeof (s as Record<string, unknown>).name === "string"'), "Must validate name is string");
  assert.ok(galleryClient.includes("Array.isArray((s as Record<string, unknown>).items)"), "Must validate items is array");
});

test("79. GalleryClient renders Gallery Coming Soon for enabled-empty v2 sections", () => {
  assert.ok(galleryClient.includes("Gallery Coming Soon"), "Must show coming soon for empty v2");
  assert.ok(galleryClient.includes("Content is being curated"), "Must show placeholder message");
  assert.ok(galleryClient.includes("sections.length > 0"), "Must check sections length before rendering");
});

test("80. GalleryClient uses buildFlatIndexMap for lightbox index mapping", () => {
  assert.ok(galleryClient.includes("buildFlatIndexMap"), "Must define buildFlatIndexMap function");
  assert.ok(galleryClient.includes("flatIndexMap"), "Must use flatIndexMap for item indices");
  assert.ok(galleryClient.includes("flatIndexMap.get(item)"), "Must look up item index from map");
  assert.ok(galleryClient.includes("activeIndex + 1} / {assets.length}"), "Must show lightbox position counter");
});
