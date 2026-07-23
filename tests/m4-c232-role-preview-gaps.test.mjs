import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), "..");

import {
  createBlog,
  updateBlog,
  publishBlog,
  hideBlog,
  archiveBlog,
  loadBlogById,
  loadBlog,
} from "../app/lib/blog-admin.ts";

import { executeRoleMutation } from "../app/lib/mutation-result.ts";

/* ═════════════════════════════════════════════════════════════════════════════
   Helpers
   ═════════════════════════════════════════════════════════════════════════════ */

function readMigration(name) {
  return fs.readFileSync(path.join(ROOT, "migrations", name), "utf-8");
}

function readSource(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf-8");
}

function createTestDb() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  const migrations = fs.readdirSync(path.join(ROOT, "migrations")).filter((f) => f.endsWith(".sql")).sort();
  for (const m of migrations) {
    const sql = fs.readFileSync(path.join(ROOT, "migrations", m), "utf-8");
    db.exec(sql);
  }
  return db;
}

function makeRepo(db) {
  const query = (sql, params = []) => {
    const stmt = db.prepare(sql);
    return stmt.all(...params);
  };
  const run = (sql, params = []) => {
    const stmt = db.prepare(sql);
    return stmt.run(...params);
  };
  const audit = () => {};
  return { query, run, audit };
}

/* ═════════════════════════════════════════════════════════════════════════════
   FIX 1: Stable revision identity — blog actions use blogId, not slug
   ═════════════════════════════════════════════════════════════════════════════ */

test("REV.1 — blog.save UPDATE uses blogId for revision identity, not slug", () => {
  const src = readSource("app/api/admin/data/route.ts");
  const idx = src.indexOf('if (action === "blog.save" || action === "blog.visibility" || action === "blog.archive")');
  assert.ok(idx >= 0, "must have explicit blog action identity block");
  const block = src.slice(idx, idx + 600);
  assert.ok(block.includes("payload.blogId"), "must use payload.blogId for blog identity");
  assert.ok(block.includes("entityId = blogId"), "must assign entityId from blogId");
});

test("REV.2 — blog.save CREATE uses crypto.randomUUID as provisional identity", () => {
  const src = readSource("app/api/admin/data/route.ts");
  const idx = src.indexOf('if (action === "blog.save" || action === "blog.visibility" || action === "blog.archive")');
  const block = src.slice(idx, idx + 600);
  assert.ok(block.includes("crypto.randomUUID()"), "must use random UUID for CREATE provisional identity");
});

test("REV.3 — generic entityId fallback still handles non-blog actions", () => {
  const src = readSource("app/api/admin/data/route.ts");
  const idx = src.indexOf('entityId = clean(payload.slug, 120) || clean(payload.departmentSlug, 120)');
  assert.ok(idx >= 0, "generic fallback with slug/departmentSlug must exist for non-blog actions");
});

test("REV.4 — route.ts blog action identity block is before generic fallback", () => {
  const src = readSource("app/api/admin/data/route.ts");
  const blogBlock = src.indexOf('if (action === "blog.save" || action === "blog.visibility" || action === "blog.archive")');
  const genericFallback = src.indexOf("entityId = clean(payload.slug, 120)", blogBlock);
  assert.ok(genericFallback > blogBlock, "generic fallback must come after blog-specific block");
});

test("REV.5 — blog.save UPDATE in applyBlog uses blogId for identity", () => {
  const src = readSource("app/api/admin/data/route.ts");
  const idx = src.indexOf('if (mode === "UPDATE") {');
  assert.ok(idx >= 0, "UPDATE block exists in applyBlog");
  const block = src.slice(idx, idx + 400);
  assert.ok(block.includes("loadBlogById"), "must load blog by ID for UPDATE");
  assert.ok(block.includes("blogId"), "must use blogId variable");
});

/* ═════════════════════════════════════════════════════════════════════════════
   FIX 2: PENDING_APPROVAL handling in BlogStudio
   ═════════════════════════════════════════════════════════════════════════════ */

test("PEN.6 — BlogStudio handleSave checks outcome for PENDING_APPROVAL", () => {
  const src = readSource("app/components/admin/BlogStudio.tsx");
  const idx = src.indexOf("const handleSave = useCallback(");
  assert.ok(idx >= 0, "handleSave exists");
  const block = src.slice(idx, idx + 2500);
  assert.ok(block.includes("PENDING_APPROVAL"), "handleSave must handle PENDING_APPROVAL outcome");
});

test("PEN.7 — BlogStudio handleSave does not increment version on PENDING_APPROVAL", () => {
  const src = readSource("app/components/admin/BlogStudio.tsx");
  const idx = src.indexOf("PENDING_APPROVAL");
  assert.ok(idx >= 0, "PENDING_APPROVAL handling exists");
  const block = src.slice(idx, idx + 400);
  assert.ok(block.includes("Change submitted for Super Admin approval") || block.includes("return"), "PENDING_APPROVAL must show message and return without mutation");
});

test("PEN.8 — BlogStudio handlePublish checks outcome for PENDING_APPROVAL", () => {
  const src = readSource("app/components/admin/BlogStudio.tsx");
  const idx = src.indexOf("const handlePublish = useCallback(");
  const block = src.slice(idx, idx + 600);
  assert.ok(block.includes("PENDING_APPROVAL"), "handlePublish must handle PENDING_APPROVAL");
});

test("PEN.9 — BlogStudio handleHide checks outcome for PENDING_APPROVAL", () => {
  const src = readSource("app/components/admin/BlogStudio.tsx");
  const idx = src.indexOf("const handleHide = useCallback(");
  const block = src.slice(idx, idx + 600);
  assert.ok(block.includes("PENDING_APPROVAL"), "handleHide must handle PENDING_APPROVAL");
});

test("PEN.10 — BlogStudio handleArchive checks outcome for PENDING_APPROVAL", () => {
  const src = readSource("app/components/admin/BlogStudio.tsx");
  const idx = src.indexOf("const handleArchive = useCallback(");
  const block = src.slice(idx, idx + 800);
  assert.ok(block.includes("PENDING_APPROVAL"), "handleArchive must handle PENDING_APPROVAL");
});

test("PEN.11 — BlogStudio pendingNotice state exists", () => {
  const src = readSource("app/components/admin/BlogStudio.tsx");
  assert.ok(src.includes("pendingNotice"), "BlogStudio must have pendingNotice state");
  assert.ok(src.includes("setPendingNotice"), "BlogStudio must have setPendingNotice setter");
});

test("PEN.12 — BlogStudio version sync effect skips during pendingNotice", () => {
  const src = readSource("app/components/admin/BlogStudio.tsx");
  const idx = src.indexOf("Re-sync version from refreshed blog rows");
  assert.ok(idx >= 0, "version sync comment exists");
  const block = src.slice(idx, idx + 500);
  assert.ok(block.includes("pendingNotice"), "version sync must check pendingNotice");
});

test("PEN.13 — BlogStudio handleSave on PENDING_APPROVAL preserves form state", () => {
  const src = readSource("app/components/admin/BlogStudio.tsx");
  const idx = src.indexOf("Change submitted for Super Admin approval");
  assert.ok(idx >= 0, "PENDING_APPROVAL message exists");
  const block = src.slice(idx, idx + 200);
  assert.ok(block.includes("return;"), "PENDING_APPROVAL must return without modifying form state");
});

/* ═════════════════════════════════════════════════════════════════════════════
   FIX 3: Role-aware action labels
   ═════════════════════════════════════════════════════════════════════════════ */

test("LBL.14 — BlogStudio Props type includes role field", () => {
  const src = readSource("app/components/admin/BlogStudio.tsx");
  assert.ok(src.includes('role?: "SUPER_ADMIN" | "STAFF"'), "Props must include optional role");
});

test("LBL.15 — AdminConsole passes session.role to BlogStudio", () => {
  const src = readSource("app/components/AdminConsole.tsx");
  const idx = src.indexOf("<BlogStudio");
  assert.ok(idx >= 0, "AdminConsole renders BlogStudio");
  const block = src.slice(idx, idx + 300);
  assert.ok(block.includes("role="), "AdminConsole must pass role prop to BlogStudio");
});

test("LBL.16 — roleLabelSave helper exists and differentiates STAFF vs SUPER_ADMIN", () => {
  const src = readSource("app/components/admin/BlogStudio.tsx");
  assert.ok(src.includes("roleLabelSave"), "roleLabelSave helper must exist");
  assert.ok(src.includes('isStaff') && src.includes('Submit for approval') || src.includes('Submit changes'), "STAFF must see submit-for-approval label");
});

test("LBL.17 — roleLabelPublish helper exists", () => {
  const src = readSource("app/components/admin/BlogStudio.tsx");
  assert.ok(src.includes("roleLabelPublish"), "roleLabelPublish helper must exist");
  assert.ok(src.includes("Propose publication"), "STAFF publish label must say Propose publication");
});

test("LBL.18 — roleLabelHide helper exists", () => {
  const src = readSource("app/components/admin/BlogStudio.tsx");
  assert.ok(src.includes("roleLabelHide"), "roleLabelHide helper must exist");
  assert.ok(src.includes("Propose hide"), "STAFF hide label must say Propose hide");
});

test("LBL.19 — roleLabelArchive helper exists", () => {
  const src = readSource("app/components/admin/BlogStudio.tsx");
  assert.ok(src.includes("roleLabelArchive"), "roleLabelArchive helper must exist");
  assert.ok(src.includes("Propose archive"), "STAFF archive label must say Propose archive");
});

test("LBL.20 — BlogStudio save button uses roleLabelSave", () => {
  const src = readSource("app/components/admin/BlogStudio.tsx");
  assert.ok(src.includes("roleLabelSave("), "save button must use roleLabelSave helper");
});

test("LBL.21 — BlogStudio publish button uses roleLabelPublish", () => {
  const src = readSource("app/components/admin/BlogStudio.tsx");
  assert.ok(src.includes("roleLabelPublish("), "publish button must use roleLabelPublish helper");
});

test("LBL.22 — BlogStudio hide button uses roleLabelHide", () => {
  const src = readSource("app/components/admin/BlogStudio.tsx");
  assert.ok(src.includes("roleLabelHide("), "hide button must use roleLabelHide helper");
});

test("LBL.23 — BlogStudio archive button uses roleLabelArchive", () => {
  const src = readSource("app/components/admin/BlogStudio.tsx");
  assert.ok(src.includes("roleLabelArchive("), "archive button must use roleLabelArchive helper");
});

/* ═════════════════════════════════════════════════════════════════════════════
   FIX 4: Authoritative cover preview
   ═════════════════════════════════════════════════════════════════════════════ */

test("COV.24 — BlogStudio tracks coverMediaVerified in FormState", () => {
  const src = readSource("app/components/admin/BlogStudio.tsx");
  assert.ok(src.includes("coverMediaVerified"), "FormState must include coverMediaVerified");
});

test("COV.25 — BlogStudio tracks coverMeta state", () => {
  const src = readSource("app/components/admin/BlogStudio.tsx");
  assert.ok(src.includes("coverMeta"), "BlogStudio must track coverMeta state");
  assert.ok(src.includes("CoverMeta"), "CoverMeta type must exist");
});

test("COV.26 — BlogStudio cover error shows unavailable message", () => {
  const src = readSource("app/components/admin/BlogStudio.tsx");
  assert.ok(src.includes("Selected cover is unavailable"), "cover error state must show unavailable message");
});

test("COV.27 — BlogStudio cover picker sets coverMediaVerified", () => {
  const src = readSource("app/components/admin/BlogStudio.tsx");
  const idx = src.indexOf("onSelect={(asset) => {");
  const block = src.slice(idx, idx + 200);
  assert.ok(block.includes("coverMediaVerified: true"), "cover picker must set coverMediaVerified");
});

test("COV.28 — BlogStudio remove cover resets coverMeta", () => {
  const src = readSource("app/components/admin/BlogStudio.tsx");
  const nullIdx = src.lastIndexOf("setCoverMeta(null)");
  assert.ok(nullIdx >= 0, "setCoverMeta(null) exists in BlogStudio");
  const block = src.slice(nullIdx, nullIdx + 200);
  assert.ok(block.includes("Remove"), "setCoverMeta(null) must be near the Remove button");
});

/* ═════════════════════════════════════════════════════════════════════════════
   FIX 5: Canonical UI lifecycle classification
   ═════════════════════════════════════════════════════════════════════════════ */

test("LC.29 — getLifecycle live requires lifecycle_status=PUBLISHED", () => {
  const src = readSource("app/components/admin/BlogStudio.tsx");
  const idx = src.indexOf("function getLifecycle(");
  assert.ok(idx >= 0, "getLifecycle must exist");
  const block = src.slice(idx, idx + 600);
  assert.ok(block.includes("PUBLISHED"), "live classification must check lifecycle_status=PUBLISHED");
});

test("LC.30 — getLifecycle checks lifecycle_status=ARCHIVED", () => {
  const src = readSource("app/components/admin/BlogStudio.tsx");
  const idx = src.indexOf("function getLifecycle(");
  const block = src.slice(idx, idx + 600);
  assert.ok(block.includes("ARCHIVED"), "archived classification must check lifecycle_status=ARCHIVED");
});

test("LC.31 — getLifecycle hidden checks status=HIDDEN", () => {
  const src = readSource("app/components/admin/BlogStudio.tsx");
  const idx = src.indexOf("function getLifecycle(");
  const block = src.slice(idx, idx + 600);
  assert.ok(block.includes('HIDDEN'), "hidden classification must check status=HIDDEN");
});

/* ═════════════════════════════════════════════════════════════════════════════
   FIX 6: Strict CREATE contract
   ═════════════════════════════════════════════════════════════════════════════ */

test("CTR.32 — applyBlog CREATE rejects blogId", () => {
  const src = readSource("app/api/admin/data/route.ts");
  const idx = src.indexOf("if (typeof payload.blogId === \"string\" && payload.blogId.trim())");
  assert.ok(idx >= 0, "CREATE blogId rejection exists in applyBlog");
  const block = src.slice(idx, idx + 200);
  assert.ok(block.includes("CREATE mode"), "must reference CREATE mode in error");
});

test("CTR.33 — applyBlog UPDATE requires positive expectedVersion", () => {
  const src = readSource("app/api/admin/data/route.ts");
  const idx = src.indexOf('if (Number.isNaN(expectedVersion) || expectedVersion < 1)');
  assert.ok(idx >= 0, "UPDATE expectedVersion check exists in applyBlog");
  const block = src.slice(idx, idx + 200);
  assert.ok(block.includes("UPDATE mode"), "must reference UPDATE mode in error");
});
