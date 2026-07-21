import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [
  adminMediaTypes,
  adminMediaApi,
  mediaLibraryPanel,
  mediaEditDialog,
  mediaPickerDialog,
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
  galleryV2Route,
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
  readFile(new URL("../app/api/gallery/v2/route.ts", import.meta.url), "utf8"),
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
  assert.ok(galleryManagerPanel.includes("\u2191"), "Must have up arrow button");
  assert.ok(galleryManagerPanel.includes("\u2193"), "Must have down arrow button");
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
