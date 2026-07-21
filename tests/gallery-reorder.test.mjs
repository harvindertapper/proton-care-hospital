import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, writeFile, unlink } from "node:fs/promises";
import { setActiveDb } from "./test-db-adapter.js";
import { setMockSession } from "./server-mocked-db.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const BASELINE_SQL = readFileSync(join(ROOT, "migrations", "0000_baseline.sql"), "utf8");
const MIGRATION_0001_SQL = readFileSync(join(ROOT, "migrations", "0001_enforce_department_slot_exclusivity.sql"), "utf8");
const MIGRATION_0002_SQL = readFileSync(join(ROOT, "migrations", "0002_add_content_lifecycle_foundation.sql"), "utf8");
const MIGRATION_0003_SQL = readFileSync(join(ROOT, "migrations", "0003_add_media_library_and_gallery.sql"), "utf8");

function createFullyMigratedDb() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  for (const stmt of splitSql(BASELINE_SQL)) db.exec(stmt);
  for (const stmt of splitSql(MIGRATION_0001_SQL)) db.exec(stmt);
  for (const stmt of splitSql(MIGRATION_0002_SQL)) db.exec(stmt);
  for (const stmt of splitSql(MIGRATION_0003_SQL)) db.exec(stmt);
  return db;
}

function splitSql(sql) {
  return sql
    .split(";")
    .map((s) => s.replace(/--[^\n]*/g, "").trim())
    .filter((s) => s.length > 0);
}

// 1. Setup dynamic mock for reorder route
const reorderRouteContent = await readFile(new URL("../app/api/admin/gallery/items/reorder/route.ts", import.meta.url), "utf8");
const mockedReorderRouteContent = reorderRouteContent
  .replace(/from "@\/app\/lib\/server";/g, 'from "./server-mocked-db.js";')
  .replace(/from "@\/app\/lib\/mutation-result";/g, 'from "../app/lib/mutation-result.ts";')
  .replace(/from "@\/app\/lib\/gallery-v2";/g, 'from "./gallery-v2-reorder-mocked.ts";')
  .replace(/from "@\/app\/lib\/utils";/g, 'from "../app/lib/utils.ts";');
await writeFile(new URL("./reorder-route-real-mocked.ts", import.meta.url), mockedReorderRouteContent, "utf8");

// 2. Setup dynamic mock for admin data route (using our server-mocked-db.js)
const dataRouteContent = await readFile(new URL("../app/api/admin/data/route.ts", import.meta.url), "utf8");
const mockedDataRouteContent = dataRouteContent
  .replace(/from "@\/app\/lib\/server";/g, 'from "./server-mocked-db.js";')
  .replace(/from "@\/app\/lib\/mutation-result";/g, 'from "../app/lib/mutation-result.ts";')
  .replace(/from "@\/app\/lib\/data";/g, 'from "../app/lib/data.ts";')
  .replace(/from "@\/app\/lib\/adminAuth";/g, 'from "../app/lib/adminAuth.ts";')
  .replace(/from "@\/app\/lib\/resend";/g, 'from "../app/lib/resend.ts";')
  .replace(/from "@\/app\/lib\/utils";/g, 'from "../app/lib/utils.ts";')
  .replace(/from "@\/app\/lib\/doctor-admin";/g, 'from "../app/lib/doctor-admin.ts";')
  .replace(/from "@\/app\/lib\/gallery-v2";/g, 'from "./gallery-v2-reorder-mocked.ts";');
await writeFile(new URL("./data-route-real-mocked-db.ts", import.meta.url), mockedDataRouteContent, "utf8");

// 3. Setup dynamic mock for media-library and gallery-v2
const mediaLibraryContent = await readFile(new URL("../app/lib/media-library.ts", import.meta.url), "utf8");
const mockedMediaLibraryContent = mediaLibraryContent
  .replace('from "./media-schema";', 'from "../app/lib/media-schema.ts";');
await writeFile(new URL("./media-library-reorder-mocked.ts", import.meta.url), mockedMediaLibraryContent, "utf8");

const galleryV2Content = await readFile(new URL("../app/lib/gallery-v2.ts", import.meta.url), "utf8");
const mockedGalleryV2Content = galleryV2Content
  .replace('from "./server";', 'from "./server-mocked-db.js";')
  .replace('from "./utils";', 'from "../app/lib/utils.ts";')
  .replace('from "./media-library";', 'from "./media-library-reorder-mocked.ts";');
await writeFile(new URL("./gallery-v2-reorder-mocked.ts", import.meta.url), mockedGalleryV2Content, "utf8");

const { applyAtomicReorder } = await import("./gallery-v2-reorder-mocked.ts");
const { POST: postReorder } = await import("./reorder-route-real-mocked.ts");
const { POST: postData } = await import("./data-route-real-mocked-db.ts");

// Cleanup generated mock files on completion
after(async () => {
  try {
    await Promise.all([
      unlink(new URL("./reorder-route-real-mocked.ts", import.meta.url)),
      unlink(new URL("./data-route-real-mocked-db.ts", import.meta.url)),
      unlink(new URL("./gallery-v2-reorder-mocked.ts", import.meta.url)),
      unlink(new URL("./media-library-reorder-mocked.ts", import.meta.url)),
    ]);
  } catch {
    // Ignore cleanup errors
  }
});

function seedGalleryData(db) {
  // Clear existing items
  db.exec("DELETE FROM gallery_items");
  db.exec("DELETE FROM gallery_sections");

  // Insert facilities section
  db.exec(`INSERT INTO gallery_sections (id, slug, name, description, sort_order, lifecycle_status, version, created_by, created_at, updated_at)
           VALUES ('sec-1', 'facilities', 'Facilities', 'Facilities description', 0, 'PUBLISHED', 1, 'admin@protoncare.in', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`);

  // Insert items
  db.exec(`INSERT INTO gallery_items (id, section_id, media_id, slot_key, title_override, alt_text_override, caption_override, sort_order, lifecycle_status, version, created_by, created_at, updated_at)
           VALUES ('item-1', 'sec-1', 'media-public-gallery-reception', 'slot-1', '', '', '', 0, 'PUBLISHED', 1, 'admin@protoncare.in', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`);
  db.exec(`INSERT INTO gallery_items (id, section_id, media_id, slot_key, title_override, alt_text_override, caption_override, sort_order, lifecycle_status, version, created_by, created_at, updated_at)
           VALUES ('item-2', 'sec-1', 'media-public-gallery-reception', 'slot-2', '', '', '', 1, 'PUBLISHED', 1, 'admin@protoncare.in', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`);
  db.exec(`INSERT INTO gallery_items (id, section_id, media_id, slot_key, title_override, alt_text_override, caption_override, sort_order, lifecycle_status, version, created_by, created_at, updated_at)
           VALUES ('item-3', 'sec-1', 'media-public-gallery-reception', 'slot-3', '', '', '', 2, 'PUBLISHED', 1, 'admin@protoncare.in', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`);
}

describe("Gallery Atomic Reorder and Review SQL Tests", () => {
  it("1. Three-item valid reorder updates all three", async () => {
    const db = createFullyMigratedDb();
    seedGalleryData(db);
    setActiveDb(db);

    const changes = await applyAtomicReorder("sec-1", [
      { id: "item-1", version: 1 },
      { id: "item-2", version: 1 },
      { id: "item-3", version: 1 },
    ], "admin@protoncare.in");

    assert.equal(changes, 3);
    db.close();
  });

  it("2. Every successful item version increments exactly once", async () => {
    const db = createFullyMigratedDb();
    seedGalleryData(db);
    setActiveDb(db);

    await applyAtomicReorder("sec-1", [
      { id: "item-1", version: 1 },
      { id: "item-2", version: 1 },
      { id: "item-3", version: 1 },
    ], "admin@protoncare.in");

    const rows = JSON.parse(JSON.stringify(db.prepare("SELECT id, version FROM gallery_items ORDER BY id").all()));
    assert.deepEqual(rows, [
      { id: "item-1", version: 2 },
      { id: "item-2", version: 2 },
      { id: "item-3", version: 2 },
    ]);
    db.close();
  });

  it("3. Last item stale causes changes=0", async () => {
    const db = createFullyMigratedDb();
    seedGalleryData(db);
    setActiveDb(db);

    const changes = await applyAtomicReorder("sec-1", [
      { id: "item-1", version: 1 },
      { id: "item-2", version: 1 },
      { id: "item-3", version: 2 }, // stale
    ], "admin@protoncare.in");

    assert.equal(changes, 0);
    db.close();
  });

  it("4. Last item stale leaves first item unchanged", async () => {
    const db = createFullyMigratedDb();
    seedGalleryData(db);
    setActiveDb(db);

    await applyAtomicReorder("sec-1", [
      { id: "item-1", version: 1 },
      { id: "item-2", version: 1 },
      { id: "item-3", version: 2 }, // stale
    ], "admin@protoncare.in");

    const item1 = db.prepare("SELECT version, sort_order FROM gallery_items WHERE id = 'item-1'").get();
    assert.equal(item1.version, 1);
    assert.equal(item1.sort_order, 0);
    db.close();
  });

  it("5. Last item stale leaves middle item unchanged", async () => {
    const db = createFullyMigratedDb();
    seedGalleryData(db);
    setActiveDb(db);

    await applyAtomicReorder("sec-1", [
      { id: "item-1", version: 1 },
      { id: "item-2", version: 1 },
      { id: "item-3", version: 2 }, // stale
    ], "admin@protoncare.in");

    const item2 = db.prepare("SELECT version, sort_order FROM gallery_items WHERE id = 'item-2'").get();
    assert.equal(item2.version, 1);
    assert.equal(item2.sort_order, 1);
    db.close();
  });

  it("6. Last item stale leaves all versions unchanged", async () => {
    const db = createFullyMigratedDb();
    seedGalleryData(db);
    setActiveDb(db);

    await applyAtomicReorder("sec-1", [
      { id: "item-1", version: 1 },
      { id: "item-2", version: 1 },
      { id: "item-3", version: 2 }, // stale
    ], "admin@protoncare.in");

    const rows = JSON.parse(JSON.stringify(db.prepare("SELECT version FROM gallery_items").all()));
    assert.deepEqual(rows, [{ version: 1 }, { version: 1 }, { version: 1 }]);
    db.close();
  });

  it("7. Omitted active item causes changes=0", async () => {
    const db = createFullyMigratedDb();
    seedGalleryData(db);
    setActiveDb(db);

    const changes = await applyAtomicReorder("sec-1", [
      { id: "item-1", version: 1 },
      { id: "item-2", version: 1 },
    ], "admin@protoncare.in");

    assert.equal(changes, 0);
    db.close();
  });

  it("8. Wrong-section item causes changes=0", async () => {
    const db = createFullyMigratedDb();
    seedGalleryData(db);
    setActiveDb(db);

    const changes = await applyAtomicReorder("sec-1", [
      { id: "item-1", version: 1 },
      { id: "item-2", version: 1 },
      { id: "item-other", version: 1 },
    ], "admin@protoncare.in");

    assert.equal(changes, 0);
    db.close();
  });

  it("9. Deleted item in payload causes changes=0", async () => {
    const db = createFullyMigratedDb();
    seedGalleryData(db);
    db.exec("UPDATE gallery_items SET deleted_at = CURRENT_TIMESTAMP WHERE id = 'item-3'");
    setActiveDb(db);

    const changes = await applyAtomicReorder("sec-1", [
      { id: "item-1", version: 1 },
      { id: "item-2", version: 1 },
      { id: "item-3", version: 1 },
    ], "admin@protoncare.in");

    assert.equal(changes, 0);
    db.close();
  });

  it("10. Concurrent version change after pre-read causes changes=0", async () => {
    const db = createFullyMigratedDb();
    seedGalleryData(db);
    setActiveDb(db);

    // simulate concurrent edit to item-3
    db.exec("UPDATE gallery_items SET version = 2 WHERE id = 'item-3'");

    const changes = await applyAtomicReorder("sec-1", [
      { id: "item-1", version: 1 },
      { id: "item-2", version: 1 },
      { id: "item-3", version: 1 }, // we expect 1 but database now has 2
    ], "admin@protoncare.in");

    assert.equal(changes, 0);
    db.close();
  });

  it("11. More than 100 items returns 400", async () => {
    const db = createFullyMigratedDb();
    seedGalleryData(db);
    setActiveDb(db);
    setMockSession({ ok: true, session: { email: "admin@protoncare.in", role: "SUPER_ADMIN", csrf: "csrf-token" } });

    const hugeItemOrder = [];
    for (let i = 1; i <= 101; i++) {
      hugeItemOrder.push({ id: `item-${i}`, version: 1 });
    }

    const req = new Request("http://localhost/api/admin/gallery/items/reorder", {
      method: "POST",
      headers: { "content-type": "application/json", "x-csrf-token": "csrf-token" },
      body: JSON.stringify({ sectionId: "sec-1", itemOrder: hugeItemOrder }),
    });

    const res = await postReorder(req);
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.match(data.error, /length/);
    db.close();
  });

  it("12. Staff reorder creates one revision through run()", async () => {
    const db = createFullyMigratedDb();
    seedGalleryData(db);
    setActiveDb(db);
    setMockSession({ ok: true, session: { email: "staff@protoncare.in", role: "STAFF", csrf: "csrf-token" } });

    const req = new Request("http://localhost/api/admin/gallery/items/reorder", {
      method: "POST",
      headers: { "content-type": "application/json", "x-csrf-token": "csrf-token" },
      body: JSON.stringify({
        sectionId: "sec-1",
        itemOrder: [
          { id: "item-1", version: 1 },
          { id: "item-2", version: 1 },
          { id: "item-3", version: 1 },
        ],
      }),
    });

    const res = await postReorder(req);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.outcome, "PENDING_APPROVAL");

    const count = db.prepare("SELECT COUNT(*) AS cnt FROM content_revisions WHERE entity_type = 'gallery_items.reorder'").get().cnt;
    assert.equal(count, 1);
    db.close();
  });

  it("13. Staff reorder changes zero Gallery rows", async () => {
    const db = createFullyMigratedDb();
    seedGalleryData(db);
    setActiveDb(db);
    setMockSession({ ok: true, session: { email: "staff@protoncare.in", role: "STAFF", csrf: "csrf-token" } });

    const req = new Request("http://localhost/api/admin/gallery/items/reorder", {
      method: "POST",
      headers: { "content-type": "application/json", "x-csrf-token": "csrf-token" },
      body: JSON.stringify({
        sectionId: "sec-1",
        itemOrder: [
          { id: "item-3", version: 1 },
          { id: "item-2", version: 1 },
          { id: "item-1", version: 1 },
        ],
      }),
    });

    await postReorder(req);

    // items should still have original order & versions
    const items = JSON.parse(JSON.stringify(db.prepare("SELECT id, sort_order, version FROM gallery_items ORDER BY id").all()));
    assert.deepEqual(items, [
      { id: "item-1", sort_order: 0, version: 1 },
      { id: "item-2", sort_order: 1, version: 1 },
      { id: "item-3", sort_order: 2, version: 1 },
    ]);
    db.close();
  });

  it("14. Approved Staff reorder uses the same atomic helper", async () => {
    const db = createFullyMigratedDb();
    seedGalleryData(db);
    setActiveDb(db);
    setMockSession({ ok: true, session: { email: "staff@protoncare.in", role: "STAFF", csrf: "csrf-token" } });

    const reqReorder = new Request("http://localhost/api/admin/gallery/items/reorder", {
      method: "POST",
      headers: { "content-type": "application/json", "x-csrf-token": "csrf-token" },
      body: JSON.stringify({
        sectionId: "sec-1",
        itemOrder: [
          { id: "item-3", version: 1 },
          { id: "item-2", version: 1 },
          { id: "item-1", version: 1 },
        ],
      }),
    });

    const resReorder = await postReorder(reqReorder);
    const bodyReorder = await resReorder.json();
    const revisionId = bodyReorder.revision.id;

    // Approve the revision
    setMockSession({ ok: true, session: { email: "admin@protoncare.in", role: "SUPER_ADMIN", csrf: "csrf-token" } });
    const reqApprove = new Request("http://localhost/api/admin/data", {
      method: "POST",
      headers: { "content-type": "application/json", "x-csrf-token": "csrf-token" },
      body: JSON.stringify({
        action: "revision.review",
        revisionId,
        decision: "APPROVED",
      }),
    });

    const resApprove = await postData(reqApprove);
    assert.equal(resApprove.status, 200);

    const items = JSON.parse(JSON.stringify(db.prepare("SELECT id, sort_order, version FROM gallery_items ORDER BY id").all()));
    assert.deepEqual(items, [
      { id: "item-1", sort_order: 2, version: 2 },
      { id: "item-2", sort_order: 1, version: 2 },
      { id: "item-3", sort_order: 0, version: 2 },
    ]);
    db.close();
  });

  it("15. Approved Staff item update executes without SQL alias error", async () => {
    const db = createFullyMigratedDb();
    seedGalleryData(db);
    setActiveDb(db);

    // Create STAFF session and submit update revision
    setMockSession({ ok: true, session: { email: "staff@protoncare.in", role: "STAFF", csrf: "csrf-token" } });
    const reqUpdate = new Request("http://localhost/api/admin/data", {
      method: "POST",
      headers: { "content-type": "application/json", "x-csrf-token": "csrf-token" },
      body: JSON.stringify({
        action: "gallery_item.update",
        id: "item-1",
        expectedVersion: 1,
        titleOverride: "Updated Title",
      }),
    });

    const resUpdate = await postData(reqUpdate);
    const bodyUpdate = await resUpdate.json();
    const revisionId = bodyUpdate.revision.id;

    // Approve the revision
    setMockSession({ ok: true, session: { email: "admin@protoncare.in", role: "SUPER_ADMIN", csrf: "csrf-token" } });
    const reqApprove = new Request("http://localhost/api/admin/data", {
      method: "POST",
      headers: { "content-type": "application/json", "x-csrf-token": "csrf-token" },
      body: JSON.stringify({
        action: "revision.review",
        revisionId,
        decision: "APPROVED",
      }),
    });

    const resApprove = await postData(reqApprove);
    assert.equal(resApprove.status, 200);

    const item1 = db.prepare("SELECT title_override FROM gallery_items WHERE id = 'item-1'").get();
    assert.equal(item1.title_override, "Updated Title");
    db.close();
  });

  it("16. Approved Staff item update increments version once", async () => {
    const db = createFullyMigratedDb();
    seedGalleryData(db);
    setActiveDb(db);

    setMockSession({ ok: true, session: { email: "staff@protoncare.in", role: "STAFF", csrf: "csrf-token" } });
    const reqUpdate = new Request("http://localhost/api/admin/data", {
      method: "POST",
      headers: { "content-type": "application/json", "x-csrf-token": "csrf-token" },
      body: JSON.stringify({
        action: "gallery_item.update",
        id: "item-1",
        expectedVersion: 1,
        titleOverride: "Updated Title Again",
      }),
    });

    const resUpdate = await postData(reqUpdate);
    const bodyUpdate = await resUpdate.json();
    const revisionId = bodyUpdate.revision.id;

    setMockSession({ ok: true, session: { email: "admin@protoncare.in", role: "SUPER_ADMIN", csrf: "csrf-token" } });
    const reqApprove = new Request("http://localhost/api/admin/data", {
      method: "POST",
      headers: { "content-type": "application/json", "x-csrf-token": "csrf-token" },
      body: JSON.stringify({
        action: "revision.review",
        revisionId,
        decision: "APPROVED",
      }),
    });

    await postData(reqApprove);

    const item1 = db.prepare("SELECT version FROM gallery_items WHERE id = 'item-1'").get();
    assert.equal(item1.version, 2);
    db.close();
  });

  it("19. Marker remains 0", async () => {
    const db = createFullyMigratedDb();
    setActiveDb(db);
    const row = db.prepare("SELECT value FROM site_configs WHERE key = 'gallery_v2_initialized'").get();
    assert.equal(row.value, "0");
    db.close();
  });
});
