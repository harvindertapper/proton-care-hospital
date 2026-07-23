import { it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(import.meta.dirname, "..");

function readSource(rel) {
  return readFileSync(resolve(ROOT, rel), "utf-8");
}

/* ───────────────────────────────────────────────────────────────
   1. Cover ID without media row is unavailable
   ─────────────────────────────────────────────────────────────── */
it("1. Cover ID without media row resolves to null (unavailable)", () => {
  const src = readSource("app/components/admin/BlogStudio.tsx");
  const idx = src.indexOf("function resolveBlogCoverMeta(");
  assert.ok(idx >= 0, "resolveBlogCoverMeta function must exist");
  const block = src.slice(idx, idx + 800);
  const findIdx = block.indexOf("media.find");
  assert.ok(findIdx >= 0, "must search media array for matching row");
  const afterFind = block.slice(findIdx, findIdx + 200);
  assert.ok(afterFind.includes("return null"), "must return null when no matching row is found");
});

/* ───────────────────────────────────────────────────────────────
   2. Wrong-category media cannot become verified
   ─────────────────────────────────────────────────────────────── */
it("2. Wrong-category media cannot become verified", () => {
  const src = readSource("app/components/admin/BlogStudio.tsx");
  const idx = src.indexOf("function resolveBlogCoverMeta(");
  const block = src.slice(idx, idx + 800);
  assert.ok(block.includes('"BLOG"') || block.includes("'BLOG'"), "must check category is BLOG");
  assert.ok(block.includes("category"), "must reference category field");
});

/* ───────────────────────────────────────────────────────────────
   3. Deleted media cannot become verified
   ─────────────────────────────────────────────────────────────── */
it("3. Deleted media cannot become verified", () => {
  const src = readSource("app/components/admin/BlogStudio.tsx");
  const idx = src.indexOf("function resolveBlogCoverMeta(");
  const block = src.slice(idx, idx + 800);
  assert.ok(block.includes("deleted_at"), "must check deleted_at field");
  assert.ok(block.includes("return null"), "must return null for deleted media");
});

/* ───────────────────────────────────────────────────────────────
   4. Valid BLOG media resolves to trusted preview metadata
   ─────────────────────────────────────────────────────────────── */
it("4. Valid BLOG media resolves to trusted preview metadata with label, category, previewUrl", () => {
  const src = readSource("app/components/admin/BlogStudio.tsx");
  const idx = src.indexOf("function resolveBlogCoverMeta(");
  const block = src.slice(idx, idx + 1200);
  assert.ok(block.includes("previewUrl:"), "must set previewUrl in returned CoverMeta");
  assert.ok(block.includes("label:"), "must set label in returned CoverMeta");
  assert.ok(block.includes("category:"), "must set category in returned CoverMeta");
  assert.ok(block.includes("verified: true"), "must set verified: true for valid media");
  assert.ok(block.includes("/api/media/"), "must use canonical /api/media/ gateway for previewUrl");
});

/* ───────────────────────────────────────────────────────────────
   5. STAFF CREATE with blogId is rejected before revision creation
   ─────────────────────────────────────────────────────────────── */
it("5. STAFF CREATE with blogId is rejected in validatePayload before executeRoleMutation", () => {
  const src = readSource("app/api/admin/data/route.ts");
  const vpIdx = src.indexOf("function validatePayload(");
  const section = src.slice(vpIdx, vpIdx + 5000);
  const blogIdx = section.indexOf('"blog.save"');
  const block = section.slice(blogIdx, blogIdx + 2000);
  assert.ok(
    block.includes("blogId must not be provided for CREATE"),
    "validatePayload must reject blogId for CREATE mode"
  );
  assert.ok(
    block.includes("bm === \"CREATE\""),
    "must check CREATE mode specifically for blogId rejection"
  );
});

/* ───────────────────────────────────────────────────────────────
   6. STAFF CREATE with positive expectedVersion is rejected
   ─────────────────────────────────────────────────────────────── */
it("6. STAFF CREATE with positive expectedVersion is rejected in validatePayload", () => {
  const src = readSource("app/api/admin/data/route.ts");
  const vpIdx = src.indexOf("function validatePayload(");
  const section = src.slice(vpIdx, vpIdx + 5000);
  const blogIdx = section.indexOf('"blog.save"');
  const block = section.slice(blogIdx, blogIdx + 2000);
  assert.ok(
    block.includes("expectedVersion must not be positive for CREATE"),
    "validatePayload must reject positive expectedVersion for CREATE mode"
  );
});

/* ───────────────────────────────────────────────────────────────
   7. APPLIED response missing version does not fabricate one
   ─────────────────────────────────────────────────────────────── */
it("7. handleSave does not fabricate version (no serverVersion ?? form.expectedVersion + 1)", () => {
  const src = readSource("app/components/admin/BlogStudio.tsx");
  assert.ok(
    !src.includes("serverVersion ?? form.expectedVersion + 1"),
    "must not fabricate version with serverVersion ?? form.expectedVersion + 1"
  );
  assert.ok(
    !src.includes("serverVersion ?? 1"),
    "must not fabricate version with serverVersion ?? 1"
  );
});

/* ───────────────────────────────────────────────────────────────
   8. NO_OP is not displayed as pending approval
   ─────────────────────────────────────────────────────────────── */
it("8. NO_OP is handled as explicit separate branch from PENDING_APPROVAL", () => {
  const src = readSource("app/components/admin/BlogStudio.tsx");
  const handleIdx = src.indexOf("const handleSave = useCallback");
  const block = src.slice(handleIdx, handleIdx + 2500);
  assert.ok(
    block.includes('outcome === "NO_OP"'),
    "NO_OP must be checked as an explicit branch"
  );
  assert.ok(
    block.includes('outcome === "PENDING_APPROVAL"'),
    "PENDING_APPROVAL must be checked as an explicit branch"
  );
  const pendingIdx = block.indexOf('outcome === "PENDING_APPROVAL"');
  const noOpIdx = block.indexOf('outcome === "NO_OP"');
  assert.ok(pendingIdx !== noOpIdx, "PENDING_APPROVAL and NO_OP must be separate branches");
  assert.ok(
    !block.includes('PENDING_APPROVAL" || outcome === "NO_OP"'),
    "must not use ambiguous OR between PENDING_APPROVAL and NO_OP"
  );
});

/* ───────────────────────────────────────────────────────────────
   9. BlogStudio passes media prop for cover reconciliation
   ─────────────────────────────────────────────────────────────── */
it("9. BlogStudio Props type includes media field", () => {
  const src = readSource("app/components/admin/BlogStudio.tsx");
  const propsIdx = src.indexOf("type Props =");
  const block = src.slice(propsIdx, propsIdx + 400);
  assert.ok(block.includes("media:"), "Props type must include media field");
  assert.ok(block.includes("Record<string, string | number | null>[]"), "media must be an array of record rows");
});

/* ───────────────────────────────────────────────────────────────
  10. AdminConsole passes media data to BlogStudio
  ─────────────────────────────────────────────────────────────── */
it("10. AdminConsole passes adminData.media to BlogStudio", () => {
  const src = readSource("app/components/AdminConsole.tsx");
  const idx = src.indexOf("<BlogStudio");
  const block = src.slice(idx, idx + 300);
  assert.ok(block.includes("media="), "AdminConsole must pass media prop to BlogStudio");
  assert.ok(block.includes("adminData.media"), "must pass adminData.media specifically");
});
