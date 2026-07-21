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
  legacyGalleryRoute,
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
  readFile(new URL("../app/api/gallery/route.ts", import.meta.url), "utf8"),
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
  assert.ok(galleryManagerPanel.includes("err instanceof AdminApiError && err.status === 409") || galleryManagerPanel.includes("e instanceof AdminApiError && e.status === 409"), "Must catch 409 AdminApiError for items");
  assert.ok(galleryManagerPanel.includes("Stale version conflict"), "Must show stale version conflict message");
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

test("75. GalleryManagerPanel shows confirm dialog for section and item archival", () => {
  assert.ok(galleryManagerPanel.includes("confirm("), "Must use confirm() for destructive actions");
  assert.ok(galleryManagerPanel.includes("Archive this Gallery section?"), "Must confirm section archival");
  assert.ok(galleryManagerPanel.includes("Archive this Gallery item?"), "Must confirm item archival");
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

/* ═══════════════════════════════════════════════════════════════════════════
   21. Pending actions and conflict refresh alignment (tests 81-98)
   ═══════════════════════════════════════════════════════════════════════════ */

test("81. Section archive APPLIED clears selectedSection", () => {
  assert.ok(galleryManagerPanel.includes("Section archived."), "Must show 'Section archived.' on APPLIED");
  assert.ok(galleryManagerPanel.includes('setSelectedSection(null)'), "Must clear selected section on APPLIED");
});

test("82. Section archive PENDING_APPROVAL does NOT clear selectedSection", () => {
  const deleteSectionIdx = galleryManagerPanel.indexOf("handleDeleteSection");
  assert.ok(deleteSectionIdx !== -1, "Must have handleDeleteSection function");
  const block = galleryManagerPanel.slice(deleteSectionIdx, deleteSectionIdx + 1500);
  const pendingIdx = block.indexOf('result.outcome === "PENDING_APPROVAL"');
  assert.ok(pendingIdx !== -1, "Must handle PENDING_APPROVAL outcome in handleDeleteSection");
  const pendBlock = block.slice(pendingIdx, pendingIdx + 500);
  assert.ok(pendBlock.includes("Section archive submitted for approval."), "Pending message required");
  assert.ok(!pendBlock.includes("setSelectedSection(null)"), "PENDING_APPROVAL must NOT clear selected section optimistically");
});

test("83. Item archive APPLIED does not optimistically remove from local list", () => {
  assert.ok(galleryManagerPanel.includes("Item archived."), "Must show 'Item archived.' on APPLIED");
  const appliedIdx = galleryManagerPanel.indexOf('result.outcome === "APPLIED"');
  assert.ok(appliedIdx !== -1, "Must handle APPLIED outcome");
  assert.ok(galleryManagerPanel.includes("loadItems"), "Must refetch items after archive");
});

test("84. Item archive PENDING_APPROVAL does NOT optimistically remove item", () => {
  const itemPendingIdx = galleryManagerPanel.indexOf("Item archive submitted for approval.");
  assert.ok(itemPendingIdx !== -1, "Must show item pending message");
  assert.ok(galleryManagerPanel.includes("loadSections()"), "Must refetch sections after item archive");
});

test("85. Section archive confirm text mentions logical archive and Staff approval", () => {
  assert.ok(galleryManagerPanel.includes("logical archive"), "Section confirm must mention logical archive");
  assert.ok(galleryManagerPanel.includes("does not delete media files"), "Section confirm must explain media preservation");
  assert.ok(galleryManagerPanel.includes("Staff requests require Super Admin approval"), "Section confirm must mention Staff approval");
});

test("86. Item archive confirm text mentions logical archive and no media deletion", () => {
  const itemConfirmIdx = galleryManagerPanel.indexOf("Archive this Gallery item?");
  assert.ok(itemConfirmIdx !== -1, "Must have item archive confirm");
  const block = galleryManagerPanel.slice(itemConfirmIdx, itemConfirmIdx + 300);
  assert.ok(block.includes("logical archive"), "Item confirm must mention logical archive");
  assert.ok(block.includes("does not delete the linked media asset"), "Item confirm must mention linked media preservation");
});

test("87. saveSection catches 409 and refetches sections then closes editing", () => {
  const sectionSaveIdx = galleryManagerPanel.indexOf("saveSection");
  assert.ok(sectionSaveIdx !== -1, "Must have saveSection function");
  const block = galleryManagerPanel.slice(sectionSaveIdx, sectionSaveIdx + 2000);
  const catch409 = block.indexOf("e instanceof AdminApiError && e.status === 409");
  assert.ok(catch409 !== -1, "saveSection must catch 409 AdminApiError");
  const block409 = block.slice(catch409, catch409 + 500);
  assert.ok(block409.includes("Stale version conflict"), "Must show stale version conflict message");
  assert.ok(block409.includes("loadSections()"), "Must refetch sections on 409");
  assert.ok(block409.includes("setEditingSection(null)"), "Must close section editing on 409");
  assert.ok(block409.includes("setCreatingSection(false)"), "Must close section creation on 409");
});

test("88. saveItem catches 409 and refetches items and sections then closes editing", () => {
  const itemSaveIdx = galleryManagerPanel.indexOf("async function saveItem");
  assert.ok(itemSaveIdx !== -1, "Must have saveItem function");
  const block = galleryManagerPanel.slice(itemSaveIdx, itemSaveIdx + 4000);
  const catch409 = block.indexOf("e instanceof AdminApiError && e.status === 409");
  assert.ok(catch409 !== -1, "saveItem must catch 409 AdminApiError");
  const block409 = block.slice(catch409, catch409 + 500);
  assert.ok(block409.includes("Stale version conflict"), "Must show stale version conflict message");
  assert.ok(block409.includes("loadItems"), "Must refetch items on 409");
  assert.ok(block409.includes("loadSections()"), "Must refetch sections on 409");
  assert.ok(block409.includes("setEditingItem(null)"), "Must close item editing on 409");
  assert.ok(block409.includes("setCreatingItem(false)"), "Must close item creation on 409");
});

test("89. saveReorder shows APPLIED message 'Order saved.' and refetches", () => {
  const reorderIdx = galleryManagerPanel.indexOf("saveReorder");
  assert.ok(reorderIdx !== -1, "Must have saveReorder function");
  const block = galleryManagerPanel.slice(reorderIdx, reorderIdx + 2000);
  assert.ok(block.includes("Order saved."), "APPLIED must show 'Order saved.'");
  assert.ok(block.includes("loadItems"), "Must refetch items after reorder save");
  assert.ok(block.includes('setReorderMode(false)'), "Must exit reorder mode after save");
});

test("90. saveReorder shows PENDING_APPROVAL message and refetches", () => {
  const reorderIdx = galleryManagerPanel.indexOf("saveReorder");
  const block = galleryManagerPanel.slice(reorderIdx, reorderIdx + 2000);
  assert.ok(block.includes("Reorder submitted for review."), "PENDING_APPROVAL must show pending message");
});

test("91. saveReorder catches 409 with 'Order changed elsewhere' and exits reorder mode", () => {
  const reorderIdx = galleryManagerPanel.indexOf("saveReorder");
  const block = galleryManagerPanel.slice(reorderIdx, reorderIdx + 2000);
  const catch409 = block.indexOf("e instanceof AdminApiError && e.status === 409");
  assert.ok(catch409 !== -1, "saveReorder must catch 409");
  const block409 = block.slice(catch409, catch409 + 400);
  assert.ok(block409.includes("Order changed elsewhere"), "409 must show 'Order changed elsewhere'");
  assert.ok(block409.includes("loadItems"), "409 must refetch items");
  assert.ok(block409.includes("setReorderMode(false)"), "409 must exit reorder mode");
});

test("92. handleDeleteSection 409 refetches sections without removing entity", () => {
  const deleteSectionIdx = galleryManagerPanel.indexOf("handleDeleteSection");
  assert.ok(deleteSectionIdx !== -1, "Must have handleDeleteSection");
  const block = galleryManagerPanel.slice(deleteSectionIdx, deleteSectionIdx + 1500);
  const catch409 = block.indexOf("e instanceof AdminApiError && e.status === 409");
  assert.ok(catch409 !== -1, "handleDeleteSection must catch 409");
  const block409 = block.slice(catch409, catch409 + 300);
  assert.ok(block409.includes("loadSections()"), "Must refetch sections on 409");
});

test("93. handleDeleteItem 409 refetches items and sections without optimistic removal", () => {
  const deleteItemIdx = galleryManagerPanel.indexOf("handleDeleteItem");
  assert.ok(deleteItemIdx !== -1, "Must have handleDeleteItem");
  const block = galleryManagerPanel.slice(deleteItemIdx, deleteItemIdx + 1500);
  const catch409 = block.indexOf("e instanceof AdminApiError && e.status === 409");
  assert.ok(catch409 !== -1, "handleDeleteItem must catch 409");
  const block409 = block.slice(catch409, catch409 + 400);
  assert.ok(block409.includes("loadItems"), "Must refetch items on 409");
  assert.ok(block409.includes("loadSections()"), "Must refetch sections on 409");
  assert.ok(!block409.includes("filter("), "Must NOT optimistically filter item on 409");
});

test("94. Section archive button text reads 'Archive' not 'Delete'", () => {
  const sectionBtnIdx = galleryManagerPanel.indexOf("handleDeleteSection(sec)");
  assert.ok(sectionBtnIdx !== -1, "Must find handleDeleteSection button");
  const btnBlock = galleryManagerPanel.slice(sectionBtnIdx, sectionBtnIdx + 200);
  assert.ok(btnBlock.includes(">"), "Button must have closing angle bracket");
  const afterClose = btnBlock.indexOf(">");
  const btnText = btnBlock.slice(afterClose + 1, btnBlock.indexOf("</button>") || btnBlock.length);
  assert.ok(btnText.includes("Archive"), "Button label must be 'Archive'");
});

test("95. Item archive button text reads 'Archive' not 'Delete'", () => {
  const itemBtnIdx = galleryManagerPanel.indexOf("handleDeleteItem(item)");
  assert.ok(itemBtnIdx !== -1, "Must find handleDeleteItem button");
  const btnBlock = galleryManagerPanel.slice(itemBtnIdx, itemBtnIdx + 200);
  assert.ok(btnBlock.includes(">"), "Button must have closing angle bracket");
  const afterClose = btnBlock.indexOf(">");
  const btnText = btnBlock.slice(afterClose + 1, btnBlock.indexOf("</button>") || btnBlock.length);
  assert.ok(btnText.includes("Archive"), "Button label must be 'Archive'");
});

test("96. handleDeleteSection does not clear selectedSection on PENDING_APPROVAL", () => {
  const deleteSectionIdx = galleryManagerPanel.indexOf("handleDeleteSection");
  const block = galleryManagerPanel.slice(deleteSectionIdx, deleteSectionIdx + 1500);
  const pendingIdx = block.indexOf("PENDING_APPROVAL");
  assert.ok(pendingIdx !== -1, "Must handle PENDING_APPROVAL in handleDeleteSection");
  const pendingBlock = block.slice(pendingIdx, pendingIdx + 300);
  assert.ok(!pendingBlock.includes("setSelectedSection(null)"), "PENDING_APPROVAL must NOT optimistically clear selection");
});

test("97. Metadata saveSection 409 resets editing state after refetch", () => {
  const sectionSaveIdx = galleryManagerPanel.indexOf("saveSection");
  const block = galleryManagerPanel.slice(sectionSaveIdx, sectionSaveIdx + 2000);
  const catch409 = block.indexOf("e instanceof AdminApiError && e.status === 409");
  assert.ok(catch409 !== -1, "Must catch 409");
  const block409 = block.slice(catch409, catch409 + 500);
  assert.ok(block409.includes("loadSections()") && block409.indexOf("loadSections()") < block409.indexOf("setEditingSection(null)"), "Must refetch before resetting editing state");
});

test("98. Metadata saveItem 409 resets editing state after refetch", () => {
  const itemSaveIdx = galleryManagerPanel.indexOf("async function saveItem");
  const block = galleryManagerPanel.slice(itemSaveIdx, itemSaveIdx + 4000);
  const catch409 = block.indexOf("e instanceof AdminApiError && e.status === 409");
  assert.ok(catch409 !== -1, "Must catch 409");
  const block409 = block.slice(catch409, catch409 + 500);
  assert.ok(block409.includes("loadItems") && block409.includes("loadSections()"), "Must refetch items and sections before resetting editing state");
});

test("99. normalizeLegacyUrl strips public: prefix and returns /assets/ path", () => {
  const fnIdx = galleryClient.indexOf("function normalizeLegacyUrl");
  assert.ok(fnIdx !== -1, "normalizeLegacyUrl must exist in GalleryClient");
  const body = galleryClient.slice(fnIdx, fnIdx + 800);
  assert.ok(body.includes("public:") && body.includes('slice("public:".length)'), "Must strip 'public:' prefix");
  assert.ok(body.includes('path.startsWith("/assets/")'), "Must validate public: path starts with /assets/");
});

test("100. normalizeLegacyUrl rejects traversal sequences", () => {
  const fnIdx = galleryClient.indexOf("function normalizeLegacyUrl");
  const body = galleryClient.slice(fnIdx, fnIdx + 800);
  assert.ok(body.includes('".."'), "Must reject double-dot traversal");
  assert.ok(body.includes('"\\\\"'), "Must reject backslash traversal");
});

test("101. normalizeLegacyUrl blocks R2 cloudflarestorage URLs", () => {
  const fnIdx = galleryClient.indexOf("function normalizeLegacyUrl");
  const body = galleryClient.slice(fnIdx, fnIdx + 800);
  assert.ok(body.includes("r2.cloudflarestorage.com"), "Must reject R2 cloudflarestorage URLs");
});

test("102. normalizeLegacyUrl returns null for undefined, null, empty, whitespace", () => {
  const fnIdx = galleryClient.indexOf("function normalizeLegacyUrl");
  const body = galleryClient.slice(fnIdx, fnIdx + 800);
  assert.ok(body.includes("trimmed.length === 0"), "Must reject empty/whitespace strings after trim");
  assert.ok(body.includes("!raw || typeof raw !== \"string\""), "Must reject undefined and null inputs");
});

test("103. normalizeLegacyUrl passes through absolute / paths unchanged", () => {
  const fnIdx = galleryClient.indexOf("function normalizeLegacyUrl");
  const body = galleryClient.slice(fnIdx, fnIdx + 800);
  assert.ok(body.includes('trimmed.startsWith("/")') && body.includes("return trimmed"), "Must pass absolute / paths through unchanged");
});

test("104. normalizeLegacyUrl allows valid http/https URLs and rejects R2 hostnames", () => {
  const fnIdx = galleryClient.indexOf("function normalizeLegacyUrl");
  const body = galleryClient.slice(fnIdx, fnIdx + 800);
  assert.ok(body.includes("http://") && body.includes("https://"), "Must handle http and https URLs");
  assert.ok(body.includes("u.hostname.includes"), "Must check hostname for R2 rejection");
});

test("105. Legacy fetch uses displayUrl from API, not r2_key", () => {
  const fetchIdx = galleryClient.indexOf('fetch("/api/gallery")');
  assert.ok(fetchIdx !== -1, "Must fetch /api/gallery");
  const afterFetch = galleryClient.slice(fetchIdx, fetchIdx + 1500);
  assert.ok(afterFetch.includes("asset.displayUrl"), "Must consume displayUrl from API response");
  assert.ok(!afterFetch.includes("asset.r2_key"), "Must NOT reference r2_key for legacy assets");
});

test("106. Legacy fetch calls normalizeLegacyUrl on displayUrl before use", () => {
  const fetchIdx = galleryClient.indexOf('fetch("/api/gallery")');
  const afterFetch = galleryClient.slice(fetchIdx, fetchIdx + 1500);
  assert.ok(afterFetch.includes("normalizeLegacyUrl(asset.displayUrl)"), "Must normalize displayUrl via normalizeLegacyUrl");
  assert.ok(afterFetch.includes("if (!canonical) continue"), "Must skip rows that fail normalization");
});

test("107. Legacy fetch deduplicates using seenCanonical Set on normalized URLs", () => {
  const fetchIdx = galleryClient.indexOf('fetch("/api/gallery")');
  const afterFetch = galleryClient.slice(fetchIdx, fetchIdx + 1500);
  assert.ok(afterFetch.includes("seenCanonical"), "Must use seenCanonical dedup Set");
  assert.ok(afterFetch.includes("seenCanonical.has(canonical)"), "Must check canonical in seenCanonical before adding");
});

test("108. Legacy fetch merges preset assets matching canonical URLs with rich metadata", () => {
  const fetchIdx = galleryClient.indexOf('fetch("/api/gallery")');
  const afterFetch = galleryClient.slice(fetchIdx, fetchIdx + 1500);
  assert.ok(afterFetch.includes("presetAssets.find"), "Must match against presetAssets");
  assert.ok(afterFetch.includes("matchingPreset") && afterFetch.includes("{ ...matchingPreset }"), "Must spread matchingPreset to preserve rich metadata");
});

test("109. Legacy fetch appends unmatched preset assets at the end", () => {
  const fetchIdx = galleryClient.indexOf('fetch("/api/gallery")');
  const afterFetch = galleryClient.slice(fetchIdx, fetchIdx + 1500);
  const appendPresetIdx = afterFetch.indexOf("for (const preset of presetAssets)");
  assert.ok(appendPresetIdx !== -1, "Must have a loop to append unmatched presets");
  const appendBlock = afterFetch.slice(appendPresetIdx, appendPresetIdx + 300);
  assert.ok(appendBlock.includes("!seenCanonical.has(preset.url)"), "Must check if preset URL already seen");
  assert.ok(appendBlock.includes("merged.push"), "Must push unmatched presets to merged");
});

test("110. Legacy API resolveMediaUrls imports and is called per row", () => {
  assert.ok(legacyGalleryRoute.includes('from "@/app/lib/media-library"') && legacyGalleryRoute.includes("resolveMediaUrls"), "Must import resolveMediaUrls");
  assert.ok(legacyGalleryRoute.includes("resolveMediaUrls({"), "Must call resolveMediaUrls per row");
});

test("111. Legacy API skips rows where resolveMediaUrls returns !ok", () => {
  assert.ok(legacyGalleryRoute.includes("if (!urlResult.ok) continue"), "Must skip rows with failed URL resolution");
});

test("112. Legacy API returns displayUrl, title, altText, caption in asset DTO", () => {
  assert.ok(legacyGalleryRoute.includes("displayUrl:"), "Must include displayUrl in response DTO");
  assert.ok(legacyGalleryRoute.includes("title: row.title"), "Must include title");
  assert.ok(legacyGalleryRoute.includes("altText: row.alt_text"), "Must include altText");
  assert.ok(legacyGalleryRoute.includes("caption: row.caption"), "Must include caption");
});

test("113. Legacy API does NOT write gallery_v2_initialized marker", () => {
  assert.ok(!legacyGalleryRoute.includes("gallery_v2_initialized"), "Legacy /api/gallery must NOT touch gallery_v2_initialized marker");
});

test("114. GalleryClient presetAssets all use /assets/ paths matching normalization", () => {
  const presetStart = galleryClient.indexOf("const presetAssets");
  assert.ok(presetStart !== -1, "presetAssets must exist");
  const presetBlock = galleryClient.slice(presetStart, presetStart + 2000);
  const urlMatches = [...presetBlock.matchAll(/url:\s*"([^"]+)"/g)];
  assert.ok(urlMatches.length >= 7, "Must have at least 7 preset assets");
  for (const m of urlMatches) {
    assert.ok(m[1].startsWith("/assets/"), `Preset URL ${m[1]} must start with /assets/`);
    assert.ok(!m[1].includes("public:"), `Preset URL ${m[1]} must not contain public: prefix`);
  }
});

test("115. GalleryClient lightbox indices use same assets array as card grid", () => {
  const renderIdx = galleryClient.indexOf("assets.map((asset, idx)");
  assert.ok(renderIdx !== -1, "Card grid must iterate assets.map");
  const lightboxIdx = galleryClient.indexOf("activeIndex !== null && assets.length > 0");
  assert.ok(lightboxIdx !== -1, "Lightbox must gate on assets.length");
  const lightboxRender = galleryClient.slice(lightboxIdx, lightboxIdx + 3000);
  assert.ok(lightboxRender.includes("assets[activeIndex]"), "Lightbox must use assets[activeIndex]");
  assert.ok(lightboxRender.includes("assets[activeIndex].url"), "Lightbox image must use same url from assets");
});
