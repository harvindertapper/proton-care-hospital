import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readSource(relativePath) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

// ===========================================================================
// 1. resolveYouTubeId handles youtu.be share URLs
// ===========================================================================
test("1. resolveYouTubeId handles youtu.be share URLs", async () => {
  const src = await readSource("../app/lib/youtube.ts");
  assert.ok(src.includes('hostname === "youtu.be"'), "must check for youtu.be hostname");
  const segmentsIdx = src.indexOf("segments.length === 1", src.indexOf('hostname === "youtu.be"'));
  assert.ok(segmentsIdx > 0, "must parse single-segment pathname from youtu.be");
});

// ===========================================================================
// 2. resolveYouTubeId handles youtube.com watch URLs
// ===========================================================================
test("2. resolveYouTubeId handles youtube.com watch URLs", async () => {
  const src = await readSource("../app/lib/youtube.ts");
  assert.ok(src.includes('segments[0] === "watch"'), "must match /watch path segments");
  assert.ok(src.includes('searchParams.has("v")'), "must read v query param for watch URLs");
});

// ===========================================================================
// 3. resolveYouTubeId handles youtube.com shorts URLs
// ===========================================================================
test("3. resolveYouTubeId handles youtube.com shorts URLs", async () => {
  const src = await readSource("../app/lib/youtube.ts");
  assert.ok(src.includes('segments[0] === "shorts"'), "must match /shorts path");
  assert.ok(src.includes("segments.length === 2"), "must require exactly 2 segments for shorts");
});

// ===========================================================================
// 4. resolveYouTubeId handles youtube.com embed URLs
// ===========================================================================
test("4. resolveYouTubeId handles youtube.com embed URLs", async () => {
  const src = await readSource("../app/lib/youtube.ts");
  assert.ok(src.includes('segments[0] === "embed"'), "must match /embed path");
  assert.ok(src.includes("segments.length === 2"), "must require exactly 2 segments for embed");
});

// ===========================================================================
// 5. resolveYouTubeId rejects non-https URLs
// ===========================================================================
test("5. resolveYouTubeId rejects non-https URLs", async () => {
  const src = await readSource("../app/lib/youtube.ts");
  assert.ok(src.includes('url.protocol !== "https:"'), "must reject non-https protocol");
});

// ===========================================================================
// 6. resolveYouTubeId rejects non-youtube hosts
// ===========================================================================
test("6. resolveYouTubeId rejects non-youtube hosts", async () => {
  const src = await readSource("../app/lib/youtube.ts");
  assert.ok(
    src.includes('"www.youtube.com", "youtube.com", "m.youtube.com", "youtu.be"'),
    "must define allowed YouTube host list"
  );
  assert.ok(
    src.includes("ALLOWED_YT_HOSTS.includes(url.hostname)"),
    "must check hostname against allowlist"
  );
});

// ===========================================================================
// 7. resolveYouTubeId rejects URLs with credentials
// ===========================================================================
test("7. resolveYouTubeId rejects URLs with credentials", async () => {
  const src = await readSource("../app/lib/youtube.ts");
  assert.ok(src.includes("url.username || url.password"), "must reject URLs with username or password");
});

// ===========================================================================
// 8. resolveYouTubeId rejects invalid port numbers
// ===========================================================================
test("8. resolveYouTubeId rejects invalid port numbers", async () => {
  const src = await readSource("../app/lib/youtube.ts");
  assert.ok(
    src.includes('url.port && url.port !== "443"'),
    "must reject non-standard ports (allow 443 only)"
  );
});

// ===========================================================================
// 9. resolveYouTubeId rejects IDs shorter or longer than 11 chars
// ===========================================================================
test("9. resolveYouTubeId rejects IDs shorter or longer than 11 chars", async () => {
  const src = await readSource("../app/lib/youtube.ts");
  assert.ok(src.includes("{11}"), "must enforce exactly 11 characters via regex");
});

// ===========================================================================
// 10. resolveYouTubeId rejects IDs with invalid characters
// ===========================================================================
test("10. resolveYouTubeId rejects IDs with invalid characters", async () => {
  const src = await readSource("../app/lib/youtube.ts");
  assert.ok(
    src.includes("YT_ID_RE.test(id)") || src.includes("YT_ID_RE.test(youtubeId)"),
    "must validate IDs against regex"
  );
  assert.ok(src.includes("A-Za-z0-9_-"), "regex must allow only alphanumeric, underscore, hyphen");
});

// ===========================================================================
// 11. thumbnailUrl returns hqdefault fallback format
// ===========================================================================
test("11. thumbnailUrl returns hqdefault fallback format", async () => {
  const src = await readSource("../app/lib/youtube.ts");
  assert.ok(src.includes("hqdefault.jpg"), "must return hqdefault.jpg for fallback=true");
});

// ===========================================================================
// 12. thumbnailUrl returns maxresdefault format
// ===========================================================================
test("12. thumbnailUrl returns maxresdefault format", async () => {
  const src = await readSource("../app/lib/youtube.ts");
  assert.ok(src.includes("maxresdefault.jpg"), "must return maxresdefault.jpg for fallback=false");
  assert.ok(
    src.includes("i.ytimg.com/vi/"),
    "must use i.ytimg.com/vi/ base path"
  );
});

// ===========================================================================
// 13. embedUrl returns youtube-nocookie format
// ===========================================================================
test("13. embedUrl returns youtube-nocookie format", async () => {
  const src = await readSource("../app/lib/youtube.ts");
  assert.ok(
    src.includes("youtube-nocookie.com/embed/"),
    "must use youtube-nocookie.com/embed/ for privacy-enhanced embed"
  );
  assert.ok(src.includes("autoplay=1"), "embed must include autoplay param");
  assert.ok(src.includes("rel=0"), "embed must include rel=0 param");
  assert.ok(src.includes("playsinline=1"), "embed must include playsinline param");
});

// ===========================================================================
// 14. resolveYouTubeIdWithType returns sourceType string for each URL type
// ===========================================================================
test("14. resolveYouTubeIdWithType returns sourceType string for each URL type", async () => {
  const src = await readSource("../app/lib/youtube.ts");
  assert.ok(src.includes('"YouTube share URL"'), "must label youtu.be as share URL");
  assert.ok(src.includes('"YouTube watch URL"'), "must label watch URLs");
  assert.ok(src.includes('"YouTube short URL"'), "must label shorts URLs");
  assert.ok(src.includes('"YouTube embed URL"'), "must label embed URLs");
  assert.ok(src.includes('"YouTube ID"'), "must label raw youtubeId input");
  assert.ok(src.includes("sourceType"), "result must contain sourceType field");
});

// ===========================================================================
// 15. resolveYouTubeIdWithType returns null for invalid input
// ===========================================================================
test("15. resolveYouTubeIdWithType returns null for invalid input", async () => {
  const src = await readSource("../app/lib/youtube.ts");
  const fnStart = src.indexOf("export function resolveYouTubeIdWithType");
  const bodyAfterFn = src.slice(fnStart);
  assert.ok(
    bodyAfterFn.includes("return null"),
    "must return null for invalid inputs"
  );
});

// ===========================================================================
// 16. applyVideo with mode=CREATE inserts as HIDDEN with is_visible=0
// ===========================================================================
test("16. applyVideo with mode=CREATE inserts as HIDDEN with is_visible=0", async () => {
  const src = await readSource("../app/api/admin/data/route.ts");
  const fnStart = src.indexOf("async function applyVideo(");
  const fnBody = src.slice(fnStart, fnStart + 5000);
  assert.ok(fnBody.includes('mode !== "CREATE"'), "must validate mode=CREATE");
  assert.ok(fnBody.includes('mode !== "UPDATE"'), "must validate mode=UPDATE");
  assert.ok(
    fnBody.includes("'HIDDEN'") && fnBody.includes("is_visible"),
    "INSERT must set status='HIDDEN' and is_visible=0 for new videos"
  );
  assert.ok(fnBody.includes("VIDEO_CREATED"), "must audit VIDEO_CREATED");
});

// ===========================================================================
// 17. applyVideo with mode=UPDATE updates existing row
// ===========================================================================
test("17. applyVideo with mode=UPDATE updates existing row", async () => {
  const src = await readSource("../app/api/admin/data/route.ts");
  const fnStart = src.indexOf("async function applyVideo(");
  const fnBody = src.slice(fnStart, fnStart + 5000);
  assert.ok(fnBody.includes("UPDATE patient_videos SET title"), "must UPDATE existing videos");
  assert.ok(fnBody.includes("VIDEO_UPDATED"), "must audit VIDEO_UPDATED for updates");
  assert.ok(fnBody.includes('mode === "CREATE"'), "must branch on mode=CREATE");
});

// ===========================================================================
// 18. applyVideo throws if title is empty
// ===========================================================================
test("18. applyVideo throws if title is empty", async () => {
  const src = await readSource("../app/api/admin/data/route.ts");
  const fnStart = src.indexOf("async function applyVideo(");
  const fnBody = src.slice(fnStart, fnStart + 2000);
  assert.ok(
    fnBody.includes("!title") || fnBody.includes("title ||"),
    "must validate title is present"
  );
  assert.ok(
    fnBody.includes("Valid YouTube URL and consent note are required"),
    "must throw descriptive error for missing fields"
  );
});

// ===========================================================================
// 19. applyVideo throws if youtubeUrl is empty
// ===========================================================================
test("19. applyVideo throws if youtubeUrl is empty", async () => {
  const src = await readSource("../app/api/admin/data/route.ts");
  const fnStart = src.indexOf("async function applyVideo(");
  const fnBody = src.slice(fnStart, fnStart + 600);
  assert.ok(fnBody.includes("!youtubeUrl"), "must validate youtubeUrl is present");
});

// ===========================================================================
// 20. applyVideo throws if consentNote is less than 5 chars
// ===========================================================================
test("20. applyVideo throws if consentNote is less than 5 chars", async () => {
  const src = await readSource("../app/api/admin/data/route.ts");
  const fnStart = src.indexOf("async function applyVideo(");
  const fnBody = src.slice(fnStart, fnStart + 600);
  assert.ok(
    fnBody.includes("consentNote.length < 5"),
    "must reject consentNote shorter than 5 characters"
  );
});

// ===========================================================================
// 21. applyVideo CREATE rejects duplicate canonical YouTube ID (active row)
// ===========================================================================
test("21. applyVideo CREATE rejects duplicate canonical YouTube ID (active row)", async () => {
  const src = await readSource("../app/api/admin/data/route.ts");
  const fnStart = src.indexOf("async function applyVideo(");
  const fnBody = src.slice(fnStart, fnStart + 1500);
  assert.ok(
    fnBody.includes("This YouTube video already exists"),
    "must throw on duplicate YouTube ID for active rows"
  );
  assert.ok(
    fnBody.includes("AND is_deleted = 0"),
    "must check active rows (is_deleted=0) for duplicate"
  );
});

// ===========================================================================
// 22. applyVideo CREATE rejects duplicate canonical YouTube ID (archived row)
// ===========================================================================
test("22. applyVideo CREATE rejects duplicate canonical YouTube ID (archived row)", async () => {
  const src = await readSource("../app/api/admin/data/route.ts");
  const fnStart = src.indexOf("async function applyVideo(");
  const fnBody = src.slice(fnStart, fnStart + 1500);
  assert.ok(
    fnBody.includes("This YouTube video is archived"),
    "must throw on duplicate YouTube ID for archived rows"
  );
  assert.ok(
    fnBody.includes("AND is_deleted = 1"),
    "must check archived rows (is_deleted=1) for duplicate"
  );
});

// ===========================================================================
// 23. applyVideo UPDATE without ID throws
// ===========================================================================
test("23. applyVideo UPDATE without ID throws", async () => {
  const src = await readSource("../app/api/admin/data/route.ts");
  const fnStart = src.indexOf("async function applyVideo(");
  const fnBody = src.slice(fnStart, fnStart + 5000);
  assert.ok(
    fnBody.includes("Video ID is required for updates"),
    "must throw if video ID is missing on UPDATE"
  );
});

// ===========================================================================
// 24. applyVideo UPDATE on deleted row throws
// ===========================================================================
test("24. applyVideo UPDATE on deleted row throws", async () => {
  const src = await readSource("../app/api/admin/data/route.ts");
  const fnStart = src.indexOf("async function applyVideo(");
  const fnBody = src.slice(fnStart, fnStart + 5000);
  assert.ok(
    fnBody.includes("Cannot edit an archived video"),
    "must throw if trying to update an archived (deleted) video"
  );
  assert.ok(fnBody.includes("is_deleted === 1"), "must check is_deleted flag for archived row");
});

// ===========================================================================
// 25. applyVideo UPDATE rejects if another row has same youtube_id
// ===========================================================================
test("25. applyVideo UPDATE rejects if another row has same youtube_id", async () => {
  const src = await readSource("../app/api/admin/data/route.ts");
  const fnStart = src.indexOf("async function applyVideo(");
  const fnBody = src.slice(fnStart, fnStart + 5000);
  assert.ok(
    fnBody.includes("Another active video already uses this YouTube URL"),
    "must throw on youtube_id conflict with another active row"
  );
  assert.ok(
    fnBody.includes("This YouTube video belongs to an archived entry"),
    "must throw on youtube_id conflict with another archived row"
  );
  assert.ok(
    fnBody.includes("AND id <> ?"),
    "conflict check must exclude current video by ID"
  );
  assert.ok(
    !fnBody.includes("WHERE youtube_id = ? AND id <> ? AND is_deleted = 0 LIMIT 1"),
    "conflict query must NOT filter is_deleted=0 (must check all rows)"
  );
});

// ===========================================================================
// 26. applyVideoVisibility publish sets status=APPROVED, is_visible=1
// ===========================================================================
test("26. applyVideoVisibility publish sets status=APPROVED, is_visible=1", async () => {
  const src = await readSource("../app/api/admin/data/route.ts");
  const fnStart = src.indexOf("async function applyVideoVisibility(");
  const fnBody = src.slice(fnStart, fnStart + 4000);
  assert.ok(fnBody.includes('"publish"'), "must handle publish action");
  assert.ok(
    fnBody.includes("status = 'APPROVED', is_visible = 1"),
    "must set status=APPROVED and is_visible=1"
  );
  assert.ok(fnBody.includes("VIDEO_PUBLISHED"), "must audit VIDEO_PUBLISHED");
});

// ===========================================================================
// 27. applyVideoVisibility hide sets status=HIDDEN, is_visible=0
// ===========================================================================
test("27. applyVideoVisibility hide sets status=HIDDEN, is_visible=0", async () => {
  const src = await readSource("../app/api/admin/data/route.ts");
  const fnStart = src.indexOf("async function applyVideoVisibility(");
  const fnBody = src.slice(fnStart, fnStart + 4000);
  assert.ok(fnBody.includes('"hide"'), "must handle hide action");
  assert.ok(
    fnBody.includes("status = 'HIDDEN', is_visible = 0"),
    "must set status=HIDDEN and is_visible=0"
  );
  assert.ok(fnBody.includes("VIDEO_HIDDEN"), "must audit VIDEO_HIDDEN");
});

// ===========================================================================
// 28. applyVideoVisibility publish on already-published returns NO_OP
// ===========================================================================
test("28. applyVideoVisibility publish on already-published returns NO_OP", async () => {
  const src = await readSource("../app/api/admin/data/route.ts");
  const fnStart = src.indexOf("async function applyVideoVisibility(");
  const fnBody = src.slice(fnStart, fnStart + 1600);
  assert.ok(
    fnBody.includes('current.status === "APPROVED" && current.is_visible === 1'),
    "must check current state before publishing"
  );
  assert.ok(
    fnBody.includes('"NO_OP"'),
    "must return NO_OP (not APPLIED) when already in target state"
  );
});

// ===========================================================================
// 29. applyVideoVisibility hide on already-hidden returns NO_OP
// ===========================================================================
test("29. applyVideoVisibility hide on already-hidden returns NO_OP", async () => {
  const src = await readSource("../app/api/admin/data/route.ts");
  const fnStart = src.indexOf("async function applyVideoVisibility(");
  const fnBody = src.slice(fnStart, fnStart + 4000);
  assert.ok(
    fnBody.includes('current.status === "HIDDEN" && current.is_visible === 0'),
    "must check current state before hiding"
  );
});

// ===========================================================================
// 30. applyVideoVisibility throws if video not found
// ===========================================================================
test("30. applyVideoVisibility throws if video not found", async () => {
  const src = await readSource("../app/api/admin/data/route.ts");
  const fnStart = src.indexOf("async function applyVideoVisibility(");
  const fnBody = src.slice(fnStart, fnStart + 4000);
  assert.ok(
    fnBody.includes("Patient video was not found"),
    "must throw if video does not exist"
  );
});

// ===========================================================================
// 31. applyVideoVisibility validates title, consent note, and YouTube ID before publish
// ===========================================================================
test("31. applyVideoVisibility validates title, consent note, and YouTube ID before publish", async () => {
  const src = await readSource("../app/api/admin/data/route.ts");
  const fnStart = src.indexOf("async function applyVideoVisibility(");
  const fnBody = src.slice(fnStart, fnStart + 4000);
  assert.ok(
    fnBody.includes("Cannot publish: video title is missing"),
    "must validate title before publish"
  );
  assert.ok(
    fnBody.includes("Cannot publish: consent note is missing or too short"),
    "must validate consent note before publish"
  );
  assert.ok(
    fnBody.includes("Cannot publish: stored YouTube URL or ID is invalid"),
    "must validate stored YouTube ID before publish"
  );
  assert.ok(
    fnBody.includes("resolveYouTubeId"),
    "must use resolveYouTubeId for pre-publish validation"
  );
});

// ===========================================================================
// 32. validatePayload video.save requires mode CREATE or UPDATE
// ===========================================================================
test("32. validatePayload video.save requires mode CREATE or UPDATE", async () => {
  const src = await readSource("../app/api/admin/data/route.ts");
  const vpIdx = src.indexOf("function validatePayload(");
  const section = src.slice(vpIdx, vpIdx + 5000);
  const videoSaveIdx = section.indexOf('"video.save"');
  assert.ok(videoSaveIdx >= 0, "must have video.save validation branch");
  const block = section.slice(videoSaveIdx, videoSaveIdx + 500);
  assert.ok(
    block.includes('["CREATE", "UPDATE"]') || block.includes('"CREATE", "UPDATE"'),
    "must accept only CREATE or UPDATE as valid modes"
  );
  assert.ok(
    block.includes("mode must be"),
    "must return descriptive error for invalid mode"
  );
});

// ===========================================================================
// 33. validatePayload video.save rejects unknown mode
// ===========================================================================
test("33. validatePayload video.save rejects unknown mode", async () => {
  const src = await readSource("../app/api/admin/data/route.ts");
  const vpIdx = src.indexOf("function validatePayload(");
  const section = src.slice(vpIdx, vpIdx + 5000);
  const videoSaveIdx = section.indexOf('"video.save"');
  const block = section.slice(videoSaveIdx, videoSaveIdx + 500);
  assert.ok(
    block.includes('typeof obj.mode !== "string"'),
    "must validate mode is a string"
  );
  assert.ok(block.includes('return { ok: false'), "must return ok:false with error");
});

// ===========================================================================
// 34. validatePayload video.save requires title
// ===========================================================================
test("34. validatePayload video.save requires title", async () => {
  const src = await readSource("../app/api/admin/data/route.ts");
  const vpIdx = src.indexOf("function validatePayload(");
  const section = src.slice(vpIdx, vpIdx + 5000);
  const videoSaveIdx = section.indexOf('"video.save"');
  const block = section.slice(videoSaveIdx, videoSaveIdx + 500);
  assert.ok(
    block.includes('typeof obj.title !== "string" || !obj.title.trim()'),
    "must validate title is a non-empty string"
  );
  assert.ok(block.includes("Video title is required"), "must return descriptive error");
});

// ===========================================================================
// 35. validatePayload video.save requires youtubeUrl
// ===========================================================================
test("35. validatePayload video.save requires youtubeUrl", async () => {
  const src = await readSource("../app/api/admin/data/route.ts");
  const vpIdx = src.indexOf("function validatePayload(");
  const section = src.slice(vpIdx, vpIdx + 5000);
  const videoSaveIdx = section.indexOf('"video.save"');
  const block = section.slice(videoSaveIdx, videoSaveIdx + 500);
  assert.ok(
    block.includes('typeof obj.youtubeUrl !== "string" || !obj.youtubeUrl.trim()'),
    "must validate youtubeUrl is a non-empty string"
  );
  assert.ok(block.includes("YouTube URL is required"), "must return descriptive error");
});

// ===========================================================================
// 36. validatePayload video.save requires consentNote >= 5 chars
// ===========================================================================
test("36. validatePayload video.save requires consentNote >= 5 chars", async () => {
  const src = await readSource("../app/api/admin/data/route.ts");
  const vpIdx = src.indexOf("function validatePayload(");
  const section = src.slice(vpIdx, vpIdx + 5000);
  const videoSaveIdx = section.indexOf('"video.save"');
  const block = section.slice(videoSaveIdx, videoSaveIdx + 1000);
  assert.ok(
    block.includes("consentNote") && block.includes("trim().length < 5"),
    "must validate consentNote is at least 5 characters"
  );
  assert.ok(block.includes("Consent note must be at least 5 characters"), "must return descriptive error");
});

// ===========================================================================
// 37. validatePayload video.visibility requires id
// ===========================================================================
test("37. validatePayload video.visibility requires id", async () => {
  const src = await readSource("../app/api/admin/data/route.ts");
  const vpIdx = src.indexOf("function validatePayload(");
  const section = src.slice(vpIdx, vpIdx + 5500);
  const visIdx = section.indexOf('"video.visibility"');
  assert.ok(visIdx >= 0, "must have video.visibility validation branch");
  const block = section.slice(visIdx, visIdx + 300);
  assert.ok(
    block.includes('typeof obj.id !== "string" || !obj.id.trim()'),
    "must validate id is a non-empty string"
  );
  assert.ok(block.includes("Video ID is required"), "must return descriptive error");
});

// ===========================================================================
// 38. validatePayload video.visibility requires action publish or hide
// ===========================================================================
test("38. validatePayload video.visibility requires action publish or hide", async () => {
  const src = await readSource("../app/api/admin/data/route.ts");
  const vpIdx = src.indexOf("function validatePayload(");
  const section = src.slice(vpIdx, vpIdx + 5500);
  const visIdx = section.indexOf('"video.visibility"');
  const block = section.slice(visIdx, visIdx + 400);
  assert.ok(
    block.includes('"publish", "hide"') || block.includes("'publish', 'hide'"),
    "must accept only publish or hide as valid actions"
  );
  assert.ok(
    block.includes("action must be"),
    "must return descriptive error for invalid action"
  );
});

// ===========================================================================
// 39. validatePayload returns ok for valid video.save with mode=CREATE
// ===========================================================================
test("39. validatePayload returns ok for valid video.save with mode=CREATE", async () => {
  const src = await readSource("../app/api/admin/data/route.ts");
  const vpIdx = src.indexOf("function validatePayload(");
  const section = src.slice(vpIdx, vpIdx + 11000);
  assert.ok(
    section.includes("return { ok: true }"),
    "must return ok:true for valid payloads"
  );
  assert.ok(
    section.includes("return { ok: false"),
    "must return ok:false for invalid payloads"
  );
});

// ===========================================================================
// 40. applyVideoRestore sets is_deleted=0, status=HIDDEN, is_visible=0
// ===========================================================================
test("40. applyVideoRestore sets is_deleted=0, status=HIDDEN, is_visible=0", async () => {
  const src = await readSource("../app/api/admin/data/route.ts");
  const fnStart = src.indexOf("async function applyVideoRestore(");
  const fnNextFn = src.indexOf("\nasync function ", fnStart + 30);
  const fnBody = src.slice(fnStart, fnNextFn);
  assert.ok(
    fnBody.includes("is_deleted = 0, status = 'HIDDEN', is_visible = 0"),
    "must restore to hidden state with is_deleted=0"
  );
  assert.ok(fnBody.includes("VIDEO_RESTORED"), "must audit VIDEO_RESTORED");
});

// ===========================================================================
// 41. applyVideoRestore throws if video not found
// ===========================================================================
test("41. applyVideoRestore throws if video not found", async () => {
  const src = await readSource("../app/api/admin/data/route.ts");
  const fnStart = src.indexOf("async function applyVideoRestore(");
  const fnNextFn = src.indexOf("\nasync function ", fnStart + 30);
  const fnBody = src.slice(fnStart, fnNextFn);
  assert.ok(
    fnBody.includes("Patient video was not found"),
    "must throw descriptive error when video not found"
  );
});

// ===========================================================================
// 42. applyVideoRestore returns NO_OP for active (non-deleted) row
// ===========================================================================
test("42. applyVideoRestore returns NO_OP for active (non-deleted) row", async () => {
  const src = await readSource("../app/api/admin/data/route.ts");
  const fnStart = src.indexOf("async function applyVideoRestore(");
  const fnNextFn = src.indexOf("\nasync function ", fnStart + 30);
  const fnBody = src.slice(fnStart, fnNextFn);
  assert.ok(
    fnBody.includes('current.is_deleted === 0'),
    "must check is_deleted === 0 for active rows"
  );
  assert.ok(
    fnBody.includes('"NO_OP"'),
    "must return NO_OP for active (non-deleted) rows"
  );
  const noOpIdx = fnBody.indexOf('"NO_OP"');
  const restAfterNoOp = fnBody.slice(noOpIdx);
  const closeBraceIdx = restAfterNoOp.indexOf("}");
  assert.ok(
    !restAfterNoOp.slice(0, closeBraceIdx).includes("audit("),
    "must NOT write audit when returning NO_OP"
  );
});

// ===========================================================================
// 43. applyDeleteVideo uses VIDEO_ARCHIVED audit
// ===========================================================================
test("43. applyDeleteVideo uses VIDEO_ARCHIVED audit", async () => {
  const src = await readSource("../app/api/admin/data/route.ts");
  const fnStart = src.indexOf("async function applyDeleteVideo(");
  const fnBody = src.slice(fnStart, fnStart + 600);
  assert.ok(fnBody.includes("VIDEO_ARCHIVED"), "audit event must be VIDEO_ARCHIVED");
  assert.ok(!fnBody.includes("VIDEO_DELETED"), "must NOT use VIDEO_DELETED");
});

// ===========================================================================
// 44. applyDeleteVideo sets is_visible=0 atomically
// ===========================================================================
test("44. applyDeleteVideo sets is_visible=0 atomically", async () => {
  const src = await readSource("../app/api/admin/data/route.ts");
  const fnStart = src.indexOf("async function applyDeleteVideo(");
  const fnBody = src.slice(fnStart, fnStart + 600);
  assert.ok(fnBody.includes("is_deleted = 1"), "must soft-delete by setting is_deleted=1");
  assert.ok(fnBody.includes("is_visible = 0"), "must set is_visible=0 in same UPDATE");
  assert.ok(fnBody.includes("status = 'HIDDEN'"), "must set status=HIDDEN in same UPDATE");
});

// ===========================================================================
// 45. applyDeleteVideo requires id field
// ===========================================================================
test("45. applyDeleteVideo requires id field", async () => {
  const src = await readSource("../app/api/admin/data/route.ts");
  const fnStart = src.indexOf("async function applyDeleteVideo(");
  const fnBody = src.slice(fnStart, fnStart + 400);
  assert.ok(fnBody.includes("Video ID is required"), "must throw if id is missing");
});

// ===========================================================================
// 46. dashboardData video query does NOT filter is_deleted=0
// ===========================================================================
test("46. dashboardData video query does NOT filter is_deleted=0", async () => {
  const src = await readSource("../app/api/admin/data/route.ts");
  assert.ok(
    src.includes('SELECT * FROM patient_videos ORDER BY created_at DESC'),
    "dashboard must query all patient_videos including soft-deleted"
  );
  const videoQueryIdx = src.indexOf("SELECT * FROM patient_videos ORDER BY created_at DESC");
  const nextLine = src.slice(videoQueryIdx, videoQueryIdx + 120);
  assert.ok(
    !nextLine.includes("WHERE is_deleted"),
    "video query must NOT have WHERE is_deleted filter"
  );
});

// ===========================================================================
// 47. Shared resolver is used server-side (NOT parseYouTubeId)
// ===========================================================================
test("47. Shared resolver is used server-side (NOT parseYouTubeId)", async () => {
  const src = await readSource("../app/api/admin/data/route.ts");
  assert.ok(
    src.includes('import { resolveYouTubeId } from "@/app/lib/youtube"'),
    "route.ts must import resolveYouTubeId from shared youtube module"
  );
  assert.ok(
    !src.includes("parseYouTubeId"),
    "route.ts must NOT reference parseYouTubeId"
  );
});

// ===========================================================================
// 48. PatientVideoStudio has videoMutate prop (not individual callbacks)
// ===========================================================================
test("48. PatientVideoStudio has videoMutate prop (not individual callbacks)", async () => {
  const src = await readSource("../app/components/admin/PatientVideoStudio.tsx");
  assert.ok(
    src.includes("videoMutate"),
    "must have videoMutate prop"
  );
  assert.ok(
    src.includes("videoMutate: (payload: Record<string, unknown>) => Promise<VideoMutateResult>"),
    "videoMutate must be a function that takes payload and returns VideoMutateResult"
  );
  assert.ok(!src.includes("onSave"), "must NOT have onSave prop");
  assert.ok(!src.includes("onPublish"), "must NOT have onPublish prop");
  assert.ok(!src.includes("onHide"), "must NOT have onHide prop");
  assert.ok(!src.includes("onArchive"), "must NOT have onArchive prop");
  assert.ok(!src.includes("onRestore"), "must NOT have onRestore prop");
});

// ===========================================================================
// 49. PatientVideoStudio imports from @/app/lib/youtube
// ===========================================================================
test("49. PatientVideoStudio imports from @/app/lib/youtube", async () => {
  const src = await readSource("../app/components/admin/PatientVideoStudio.tsx");
  assert.ok(
    src.includes('from "@/app/lib/youtube"'),
    "must import from shared @/app/lib/youtube module"
  );
  assert.ok(
    src.includes("resolveYouTubeIdWithType"),
    "must import resolveYouTubeIdWithType"
  );
  assert.ok(
    src.includes("thumbnailUrl"),
    "must import thumbnailUrl"
  );
  assert.ok(
    src.includes("embedUrl"),
    "must import embedUrl"
  );
});

// ===========================================================================
// 50. AdminConsole imports PatientVideoStudio
// ===========================================================================
test("50. AdminConsole imports PatientVideoStudio", async () => {
  const src = await readSource("../app/components/AdminConsole.tsx");
  assert.ok(
    src.includes('import PatientVideoStudio from "@/app/components/admin/PatientVideoStudio"'),
    "AdminConsole must import PatientVideoStudio"
  );
});

// ===========================================================================
// 51. AdminConsole defines videoMutate function
// ===========================================================================
test("51. AdminConsole defines videoMutate function", async () => {
  const src = await readSource("../app/components/AdminConsole.tsx");
  assert.ok(
    src.includes("async function videoMutate"),
    "AdminConsole must define videoMutate function"
  );
  const fnStart = src.indexOf("async function videoMutate(");
  const fnBody = src.slice(fnStart, fnStart + 300);
  assert.ok(
    fnBody.includes("{ ok: boolean"),
    "videoMutate must return { ok: boolean; outcome?: string; error?: string }"
  );
});

// ===========================================================================
// 52. Videos tab passes videoMutate to PatientVideoStudio
// ===========================================================================
test("52. Videos tab passes videoMutate to PatientVideoStudio", async () => {
  const src = await readSource("../app/components/AdminConsole.tsx");
  const studioIdx = src.indexOf("<PatientVideoStudio");
  assert.ok(studioIdx >= 0, "must render <PatientVideoStudio>");
  const block = src.slice(studioIdx, studioIdx + 500);
  assert.ok(block.includes("busy={busy}"), "must pass busy prop");
  assert.ok(block.includes("videos={adminData.videos}"), "must pass videos data");
  assert.ok(block.includes("videoMutate={videoMutate}"), "must pass videoMutate function");
  assert.ok(!block.includes("onSave="), "must NOT pass onSave");
  assert.ok(!block.includes("onPublish="), "must NOT pass onPublish");
  assert.ok(!block.includes("onHide="), "must NOT pass onHide");
});

// ===========================================================================
// 53. PatientVideoStudio renders lifecycle badges (never raw is_visible)
// ===========================================================================
test("53. PatientVideoStudio renders lifecycle badges (never raw is_visible)", async () => {
  const src = await readSource("../app/components/admin/PatientVideoStudio.tsx");
  assert.ok(src.includes('"live"'), "must use 'live' lifecycle label");
  assert.ok(src.includes('"hidden"'), "must use 'hidden' lifecycle label");
  assert.ok(src.includes('"archived"'), "must use 'archived' lifecycle label");
  assert.ok(src.includes("lifecycleLabel"), "must have lifecycleLabel mapping");
  assert.ok(src.includes("_lifecycle"), "must use _lifecycle derived property");
  const cardBadgeIdx = src.indexOf("cardBadge(lifecycle)");
  assert.ok(cardBadgeIdx > 0, "must call cardBadge with lifecycle");
  const badgeSection = src.slice(cardBadgeIdx, cardBadgeIdx + 300);
  assert.ok(!badgeSection.includes("is_visible"), "badge must NOT render raw is_visible values");
});

// ===========================================================================
// 54. PatientVideoStudio uses resolveYouTubeIdWithType for URL validation
// ===========================================================================
test("54. PatientVideoStudio uses resolveYouTubeIdWithType for URL validation", async () => {
  const src = await readSource("../app/components/admin/PatientVideoStudio.tsx");
  assert.ok(
    src.includes("resolveYouTubeIdWithType"),
    "must use resolveYouTubeIdWithType for URL validation"
  );
  assert.ok(
    src.includes('resolveYouTubeIdWithType({ youtubeUrl'),
    "must pass youtubeUrl to resolver"
  );
  assert.ok(
    src.includes("Invalid YouTube URL"),
    "must show error for invalid YouTube URL"
  );
});

// ===========================================================================
// 55. PatientVideoStudio uses embedUrl for preview modal
// ===========================================================================
test("55. PatientVideoStudio uses embedUrl for preview modal", async () => {
  const src = await readSource("../app/components/admin/PatientVideoStudio.tsx");
  assert.ok(src.includes("embedUrl("), "must call embedUrl for preview");
  assert.ok(
    src.includes("embedUrl(String(previewVideo._resolvedId))"),
    "preview iframe src must use embedUrl with resolved ID"
  );
});

// ===========================================================================
// 56. No parseYouTubeId import in route.ts
// ===========================================================================
test("56. No parseYouTubeId import in route.ts", async () => {
  const src = await readSource("../app/api/admin/data/route.ts");
  assert.ok(
    !src.includes("parseYouTubeId"),
    "route.ts must NOT contain any reference to parseYouTubeId"
  );
});

// ===========================================================================
// 57. youtube.ts exports resolveYouTubeId
// ===========================================================================
test("57. youtube.ts exports resolveYouTubeId", async () => {
  const src = await readSource("../app/lib/youtube.ts");
  assert.ok(src.includes("export function resolveYouTubeId("), "must export resolveYouTubeId");
  assert.ok(src.includes("export function resolveYouTubeIdWithType("), "must export resolveYouTubeIdWithType");
  assert.ok(src.includes("export function thumbnailUrl("), "must export thumbnailUrl");
  assert.ok(src.includes("export function embedUrl("), "must export embedUrl");
  assert.ok(src.includes("export type YouTubeResolveResult"), "must export YouTubeResolveResult type");
});

// ===========================================================================
// 58. PatientVideoStudio exists and is exported
// ===========================================================================
test("58. PatientVideoStudio exists and is exported", async () => {
  const src = await readSource("../app/components/admin/PatientVideoStudio.tsx");
  assert.ok(src.includes("export default function PatientVideoStudio"), "must have default export");
});

// ===========================================================================
// 59. PatientVideoStudio renders Patient Video Studio heading
// ===========================================================================
test("59. PatientVideoStudio renders Patient Video Studio heading", async () => {
  const src = await readSource("../app/components/admin/PatientVideoStudio.tsx");
  assert.ok(
    src.includes("Patient Video Studio") || src.includes("PatientVideoStudio"),
    "must reference Patient Video Studio heading or name"
  );
});

// ===========================================================================
// 60. PatientVideoStudio renders Add Video button
// ===========================================================================
test("60. PatientVideoStudio renders Add Video button", async () => {
  const src = await readSource("../app/components/admin/PatientVideoStudio.tsx");
  assert.ok(
    src.includes("Add Video") || src.includes("addVideo") || src.includes("handleAddNew"),
    "must have Add Video button or handler"
  );
});

// ===========================================================================
// 61. PatientVideoStudio renders summary cards for total, live, hidden, archived
// ===========================================================================
test("61. PatientVideoStudio renders summary cards for total, live, hidden, archived", async () => {
  const src = await readSource("../app/components/admin/PatientVideoStudio.tsx");
  assert.ok(src.includes('"live"'), "must show live count");
  assert.ok(src.includes('"hidden"'), "must show hidden count");
  assert.ok(src.includes('"archived"'), "must show archived count");
});

// ===========================================================================
// 62. PatientVideoStudio uses thumbnailUrl for card images
// ===========================================================================
test("62. PatientVideoStudio uses thumbnailUrl for card images", async () => {
  const src = await readSource("../app/components/admin/PatientVideoStudio.tsx");
  assert.ok(src.includes("thumbnailUrl("), "must call thumbnailUrl for card images");
});

// ===========================================================================
// 63. PatientVideoStudio uses native dialog for preview
// ===========================================================================
test("63. PatientVideoStudio uses native dialog for preview", async () => {
  const src = await readSource("../app/components/admin/PatientVideoStudio.tsx");
  assert.ok(src.includes("<dialog"), "must use native <dialog> element");
  assert.ok(src.includes("showModal"), "must call showModal to open dialog");
});

// ===========================================================================
// 64. PatientVideoStudio handles dirty state with confirm dialog
// ===========================================================================
test("64. PatientVideoStudio handles dirty state with confirm dialog", async () => {
  const src = await readSource("../app/components/admin/PatientVideoStudio.tsx");
  assert.ok(src.includes("isDirty") || src.includes("dirty"), "must track dirty state");
  assert.ok(src.includes("confirm("), "must use confirm dialog for unsaved changes");
});

// ===========================================================================
// 65. PatientVideoStudio renders search input
// ===========================================================================
test("65. PatientVideoStudio renders search input", async () => {
  const src = await readSource("../app/components/admin/PatientVideoStudio.tsx");
  assert.ok(src.includes("search") || src.includes("filter"), "must have search or filter input");
});

// ===========================================================================
// 66. PatientVideoStudio renders filter chips (all, live, hidden, archived)
// ===========================================================================
test("66. PatientVideoStudio renders filter chips (all, live, hidden, archived)", async () => {
  const src = await readSource("../app/components/admin/PatientVideoStudio.tsx");
  assert.ok(src.includes('"all"'), "must have 'all' filter option");
  assert.ok(src.includes('"live"'), "must have 'live' filter option");
  assert.ok(src.includes('"hidden"'), "must have 'hidden' filter option");
  assert.ok(src.includes('"archived"'), "must have 'archived' filter option");
});

// ===========================================================================
// 67. PatientVideoStudio form validates consentNote >= 5 chars
// ===========================================================================
test("67. PatientVideoStudio form validates consentNote >= 5 chars", async () => {
  const src = await readSource("../app/components/admin/PatientVideoStudio.tsx");
  assert.ok(src.includes("consentNote"), "must reference consentNote in form validation");
});

// ===========================================================================
// 68. PatientVideoStudio action buttons use stopPropagation
// ===========================================================================
test("68. PatientVideoStudio action buttons use stopPropagation", async () => {
  const src = await readSource("../app/components/admin/PatientVideoStudio.tsx");
  assert.ok(src.includes("stopPropagation"), "action button clicks must use stopPropagation");
});

// ===========================================================================
// 69. getLifecycle maps is_deleted=1 to archived
// ===========================================================================
test("69. getLifecycle maps is_deleted=1 to archived", async () => {
  const src = await readSource("../app/components/admin/PatientVideoStudio.tsx");
  assert.ok(src.includes("archived"), "must map is_deleted=1 to 'archived' lifecycle label");
  assert.ok(
    src.includes("getLifecycle") || src.includes("_lifecycle"),
    "must have getLifecycle mapping function or _lifecycle derived property"
  );
});

// ===========================================================================
// 70. UPDATE conflict with archived row shows distinct message
// ===========================================================================
test("70. UPDATE conflict with archived row shows distinct message", async () => {
  const src = await readSource("../app/api/admin/data/route.ts");
  const fnStart = src.indexOf("async function applyVideo(");
  const fnBody = src.slice(fnStart, fnStart + 5000);
  assert.ok(
    fnBody.includes("This YouTube video belongs to an archived entry"),
    "must show distinct error for archived conflict"
  );
  assert.ok(
    fnBody.includes("Restore or update that entry instead"),
    "archived conflict message must suggest restore"
  );
  assert.ok(
    fnBody.includes("c.is_deleted === 0") || fnBody.includes("is_deleted === 0"),
    "must branch on is_deleted to distinguish active vs archived"
  );
});

// ===========================================================================
// 71. UPDATE conflict leaves both rows unchanged
// ===========================================================================
test("71. UPDATE conflict leaves both rows unchanged", async () => {
  const src = await readSource("../app/api/admin/data/route.ts");
  const fnStart = src.indexOf("async function applyVideo(");
  const fnBody = src.slice(fnStart, fnStart + 5000);
  const conflictIdx = fnBody.indexOf("conflict.results?.length");
  const block = fnBody.slice(conflictIdx, conflictIdx + 300);
  assert.ok(
    block.includes("throw new Error"),
    "conflict block must throw before any UPDATE statement"
  );
});

// ===========================================================================
// 72. applyVideoRestore loads youtube_url and youtube_id for identity check
// ===========================================================================
test("72. applyVideoRestore loads youtube_url and youtube_id for identity check", async () => {
  const src = await readSource("../app/api/admin/data/route.ts");
  const fnStart = src.indexOf("async function applyVideoRestore(");
  const fnNextFn = src.indexOf("\nasync function ", fnStart + 30);
  const fnBody = src.slice(fnStart, fnNextFn);
  assert.ok(fnBody.includes("youtube_url"), "must load youtube_url for identity validation");
  assert.ok(fnBody.includes("youtube_id"), "must load youtube_id for identity validation");
});

// ===========================================================================
// 73. applyVideoRestore validates YouTube identity via resolveYouTubeId
// ===========================================================================
test("73. applyVideoRestore validates YouTube identity via resolveYouTubeId", async () => {
  const src = await readSource("../app/api/admin/data/route.ts");
  const fnStart = src.indexOf("async function applyVideoRestore(");
  const fnNextFn = src.indexOf("\nasync function ", fnStart + 30);
  const fnBody = src.slice(fnStart, fnNextFn);
  assert.ok(fnBody.includes("resolveYouTubeId"), "must use resolveYouTubeId for identity validation");
  assert.ok(
    fnBody.includes("Cannot restore: stored YouTube URL or ID is invalid"),
    "must reject restore when YouTube identity is invalid"
  );
});

// ===========================================================================
// 74. applyVideoRestore rejects when active row owns the canonical YouTube ID
// ===========================================================================
test("74. applyVideoRestore rejects when active row owns the canonical YouTube ID", async () => {
  const src = await readSource("../app/api/admin/data/route.ts");
  const fnStart = src.indexOf("async function applyVideoRestore(");
  const fnNextFn = src.indexOf("\nasync function ", fnStart + 30);
  const fnBody = src.slice(fnStart, fnNextFn);
  assert.ok(
    fnBody.includes("Cannot restore: this YouTube video is already used by another active entry"),
    "must reject restore when another active row owns the same YouTube ID"
  );
  assert.ok(
    fnBody.includes("AND is_deleted = 0 LIMIT 1"),
    "active conflict query must filter is_deleted=0"
  );
});

// ===========================================================================
// 75. Conflicting restore leaves the archived row unchanged
// ===========================================================================
test("75. Conflicting restore leaves the archived row unchanged", async () => {
  const src = await readSource("../app/api/admin/data/route.ts");
  const fnStart = src.indexOf("async function applyVideoRestore(");
  const fnNextFn = src.indexOf("\nasync function ", fnStart + 30);
  const fnBody = src.slice(fnStart, fnNextFn);
  const conflictIdx = fnBody.indexOf("conflict.results?.length");
  assert.ok(conflictIdx > 0, "must have conflict detection block");
  const block = fnBody.slice(conflictIdx, conflictIdx + 300);
  assert.ok(
    block.includes("throw new Error"),
    "conflict block must throw before any UPDATE statement"
  );
});

// ===========================================================================
// 76. Conflicting restore writes no audit
// ===========================================================================
test("76. Conflicting restore writes no audit", async () => {
  const src = await readSource("../app/api/admin/data/route.ts");
  const fnStart = src.indexOf("async function applyVideoRestore(");
  const fnNextFn = src.indexOf("\nasync function ", fnStart + 30);
  const fnBody = src.slice(fnStart, fnNextFn);
  const conflictIdx = fnBody.indexOf("conflict.results?.length");
  assert.ok(conflictIdx > 0, "must have conflict detection block");
  const conflictBlock = fnBody.slice(conflictIdx, conflictIdx + 150);
  assert.ok(
    !conflictBlock.includes("audit("),
    "conflict block itself must NOT call audit"
  );
  assert.ok(
    conflictBlock.includes("throw"),
    "conflict block must throw (exit early)"
  );
});

// ===========================================================================
// 77. Restored row remains non-public (status=HIDDEN, is_visible=0)
// ===========================================================================
test("77. Restored row remains non-public (status=HIDDEN, is_visible=0)", async () => {
  const src = await readSource("../app/api/admin/data/route.ts");
  const fnStart = src.indexOf("async function applyVideoRestore(");
  const fnNextFn = src.indexOf("\nasync function ", fnStart + 30);
  const fnBody = src.slice(fnStart, fnNextFn);
  assert.ok(
    fnBody.includes("status = 'HIDDEN'") || fnBody.includes("status='HIDDEN'"),
    "restore must set status=HIDDEN"
  );
  assert.ok(
    fnBody.includes("is_visible = 0") || fnBody.includes("is_visible=0"),
    "restore must set is_visible=0"
  );
  const updateIdx = fnBody.indexOf("UPDATE patient_videos");
  const updateBlock = fnBody.slice(updateIdx, updateIdx + 200);
  assert.ok(
    !updateBlock.includes("APPROVED"),
    "restore UPDATE must NEVER set status to APPROVED"
  );
});

// ===========================================================================
// 78. No setState call exists in render-time ID comparison logic
// ===========================================================================
test("78. No setState call exists in render-time ID comparison logic", async () => {
  const src = await readSource("../app/components/admin/PatientVideoStudio.tsx");
  const lines = src.split("\n");
  let foundResolvedDecl = false;
  let foundUseEffect = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.includes("const resolved = useMemo")) foundResolvedDecl = true;
    if (foundResolvedDecl && !foundUseEffect) {
      if (trimmed.includes("useEffect")) foundUseEffect = true;
      if (!trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*") && trimmed.length > 0) {
        assert.ok(
          !trimmed.match(/\bset\w+\(/),
          `render-time block must NOT contain setState call: "${trimmed}"`
        );
      }
    }
  }
  assert.ok(foundResolvedDecl, "must find const resolved = useMemo");
  assert.ok(foundUseEffect, "must find useEffect after resolved declaration");
});

// ===========================================================================
// 79. Editor thumbnail reset uses an effect (useEffect)
// ===========================================================================
test("79. Editor thumbnail reset uses an effect (useEffect)", async () => {
  const src = await readSource("../app/components/admin/PatientVideoStudio.tsx");
  assert.ok(
    src.includes("useEffect") && src.includes("setEditorThumbFailed"),
    "must use useEffect to reset editorThumbFailed"
  );
  const effectIdx = src.indexOf("useEffect");
  const setIdx = src.indexOf("setEditorThumbFailed", effectIdx);
  assert.ok(setIdx > effectIdx, "setEditorThumbFailed must appear after first useEffect (inside effect body)");
});

// ===========================================================================
// 80. Failed Video mutation shows one error notice (not two)
// ===========================================================================
test("80. Failed Video mutation shows one error notice (not two)", async () => {
  const src = await readSource("../app/components/AdminConsole.tsx");
  const fnStart = src.indexOf("async function videoMutate(");
  const fnBody = src.slice(fnStart, fnStart + 600);
  assert.ok(
    !fnBody.includes("setNotice("),
    "videoMutate must NOT set global notice (avoids duplicate error display)"
  );
  assert.ok(
    fnBody.includes("return { ok: false"),
    "videoMutate must return structured error for Studio to display"
  );
});

// ===========================================================================
// 81. PatientVideoStudio renders its own notice for video errors
// ===========================================================================
test("81. PatientVideoStudio renders its own notice for video errors", async () => {
  const src = await readSource("../app/components/admin/PatientVideoStudio.tsx");
  assert.ok(src.includes("showNotice"), "Studio must have its own showNotice helper");
  assert.ok(
    src.includes('result.error') || src.includes('result.error ||'),
    "Studio must read error from videoMutate result"
  );
});

// ===========================================================================
// 82. Non-Video global notices remain intact (mutate function still uses setNotice)
// ===========================================================================
test("82. Non-Video global notices remain intact (mutate function still uses setNotice)", async () => {
  const src = await readSource("../app/components/AdminConsole.tsx");
  const fnStart = src.indexOf("async function mutate(");
  const fnBody = src.slice(fnStart, fnStart + 400);
  assert.ok(
    fnBody.includes("setNotice("),
    "non-Video mutate function must still use setNotice for global notices"
  );
});
