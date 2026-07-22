import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readSource(relativePath) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

// ===========================================================================
// 1. youtube.ts — resolveYouTubeId handles youtu.be share URLs
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
// 16. applyVideo creates new video as HIDDEN with is_visible=0
// ===========================================================================
test("16. applyVideo creates new video as HIDDEN with is_visible=0 (isNew=true)", async () => {
  const src = await readSource("../app/api/admin/data/route.ts");
  const fnStart = src.indexOf("async function applyVideo(");
  const fnBody = src.slice(fnStart, fnStart + 1200);
  assert.ok(
    fnBody.includes("'HIDDEN'") && fnBody.includes("is_visible"),
    "INSERT must set status='HIDDEN' and is_visible=0 for new videos"
  );
  assert.ok(fnBody.includes("isNew === true"), "must check isNew flag");
  assert.ok(fnBody.includes("VIDEO_CREATED"), "must audit VIDEO_CREATED");
});

// ===========================================================================
// 17. applyVideo updates existing video preserving current status
// ===========================================================================
test("17. applyVideo updates existing video preserving current status (isNew=false)", async () => {
  const src = await readSource("../app/api/admin/data/route.ts");
  const fnStart = src.indexOf("async function applyVideo(");
  const fnBody = src.slice(fnStart, fnStart + 1700);
  assert.ok(fnBody.includes("UPDATE patient_videos SET title"), "must UPDATE existing videos");
  assert.ok(fnBody.includes("VIDEO_UPDATED"), "must audit VIDEO_UPDATED for updates");
});

// ===========================================================================
// 18. applyVideo throws if title is empty
// ===========================================================================
test("18. applyVideo throws if title is empty", async () => {
  const src = await readSource("../app/api/admin/data/route.ts");
  const fnStart = src.indexOf("async function applyVideo(");
  const fnBody = src.slice(fnStart, fnStart + 600);
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
// 21. applyVideo with isNew=true and duplicate id throws
// ===========================================================================
test("21. applyVideo with isNew=true and duplicate id throws", async () => {
  const src = await readSource("../app/api/admin/data/route.ts");
  const fnStart = src.indexOf("async function applyVideo(");
  const fnBody = src.slice(fnStart, fnStart + 1200);
  assert.ok(
    fnBody.includes("A video with this YouTube ID already exists"),
    "must throw on duplicate video ID for new inserts"
  );
  assert.ok(fnBody.includes("SELECT id FROM patient_videos WHERE id = ?"), "must check for existing ID");
});

// ===========================================================================
// 22. applyVideoVisibility with action="publish" sets status=APPROVED, is_visible=1
// ===========================================================================
test("22. applyVideoVisibility publish sets status=APPROVED, is_visible=1", async () => {
  const src = await readSource("../app/api/admin/data/route.ts");
  const fnStart = src.indexOf("async function applyVideoVisibility(");
  const fnBody = src.slice(fnStart, fnStart + 1600);
  assert.ok(fnBody.includes('"publish"'), "must handle publish action");
  assert.ok(
    fnBody.includes("status = 'APPROVED', is_visible = 1"),
    "must set status=APPROVED and is_visible=1"
  );
  assert.ok(fnBody.includes("VIDEO_PUBLISHED"), "must audit VIDEO_PUBLISHED");
});

// ===========================================================================
// 23. applyVideoVisibility with action="hide" sets status=HIDDEN, is_visible=0
// ===========================================================================
test("23. applyVideoVisibility hide sets status=HIDDEN, is_visible=0", async () => {
  const src = await readSource("../app/api/admin/data/route.ts");
  const fnStart = src.indexOf("async function applyVideoVisibility(");
  const fnBody = src.slice(fnStart, fnStart + 1600);
  assert.ok(fnBody.includes('"hide"'), "must handle hide action");
  assert.ok(
    fnBody.includes("status = 'HIDDEN', is_visible = 0"),
    "must set status=HIDDEN and is_visible=0"
  );
  assert.ok(fnBody.includes("VIDEO_HIDDEN"), "must audit VIDEO_HIDDEN");
});

// ===========================================================================
// 24. applyVideoVisibility publish on already-published is idempotent
// ===========================================================================
test("24. applyVideoVisibility publish on already-published is idempotent", async () => {
  const src = await readSource("../app/api/admin/data/route.ts");
  const fnStart = src.indexOf("async function applyVideoVisibility(");
  const fnBody = src.slice(fnStart, fnStart + 1600);
  assert.ok(
    fnBody.includes('current.status === "APPROVED" && current.is_visible === 1'),
    "must check current state before publishing"
  );
  assert.ok(
    fnBody.includes('{ outcome: "APPLIED" as const }'),
    "must return early with APPLIED when already in target state"
  );
});

// ===========================================================================
// 25. applyVideoVisibility hide on already-hidden is idempotent
// ===========================================================================
test("25. applyVideoVisibility hide on already-hidden is idempotent", async () => {
  const src = await readSource("../app/api/admin/data/route.ts");
  const fnStart = src.indexOf("async function applyVideoVisibility(");
  const fnBody = src.slice(fnStart, fnStart + 1600);
  assert.ok(
    fnBody.includes('current.status === "HIDDEN" && current.is_visible === 0'),
    "must check current state before hiding"
  );
});

// ===========================================================================
// 26. applyVideoVisibility throws if video not found
// ===========================================================================
test("26. applyVideoVisibility throws if video not found", async () => {
  const src = await readSource("../app/api/admin/data/route.ts");
  const fnStart = src.indexOf("async function applyVideoVisibility(");
  const fnBody = src.slice(fnStart, fnStart + 600);
  assert.ok(
    fnBody.includes("Patient video was not found"),
    "must throw if video does not exist"
  );
  assert.ok(fnBody.includes("is_deleted = 0"), "must exclude soft-deleted videos");
});

// ===========================================================================
// 27. applyVideoRestore sets is_deleted=0, status=HIDDEN, is_visible=0
// ===========================================================================
test("27. applyVideoRestore sets is_deleted=0, status=HIDDEN, is_visible=0", async () => {
  const src = await readSource("../app/api/admin/data/route.ts");
  const fnStart = src.indexOf("async function applyVideoRestore(");
  const fnBody = src.slice(fnStart, fnStart + 900);
  assert.ok(
    fnBody.includes("is_deleted = 0, status = 'HIDDEN', is_visible = 0"),
    "must restore to hidden state with is_deleted=0"
  );
  assert.ok(fnBody.includes("VIDEO_RESTORED"), "must audit VIDEO_RESTORED");
});

// ===========================================================================
// 28. applyVideoRestore throws if video not found
// ===========================================================================
test("28. applyVideoRestore throws if video not found", async () => {
  const src = await readSource("../app/api/admin/data/route.ts");
  const fnStart = src.indexOf("async function applyVideoRestore(");
  const fnBody = src.slice(fnStart, fnStart + 600);
  assert.ok(
    fnBody.includes("Patient video was not found"),
    "must throw descriptive error when video not found"
  );
});

// ===========================================================================
// 29. applyDeleteVideo changes audit event to VIDEO_ARCHIVED
// ===========================================================================
test("29. applyDeleteVideo uses VIDEO_ARCHIVED (not VIDEO_DELETED)", async () => {
  const src = await readSource("../app/api/admin/data/route.ts");
  const fnStart = src.indexOf("async function applyDeleteVideo(");
  const fnBody = src.slice(fnStart, fnStart + 600);
  assert.ok(fnBody.includes("VIDEO_ARCHIVED"), "audit event must be VIDEO_ARCHIVED");
  assert.ok(!fnBody.includes("VIDEO_DELETED"), "must NOT use VIDEO_DELETED");
  assert.ok(fnBody.includes("is_deleted = 1"), "must soft-delete by setting is_deleted=1");
});

// ===========================================================================
// 30. dashboardData video query includes soft-deleted rows
// ===========================================================================
test("30. dashboardData video query does NOT filter is_deleted=0", async () => {
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
// 31. validatePayload: video.save requires title
// ===========================================================================
test("31. validatePayload video.save requires title", async () => {
  const src = await readSource("../app/api/admin/data/route.ts");
  const vpIdx = src.indexOf("function validatePayload(");
  const section = src.slice(vpIdx, vpIdx + 5000);
  const videoSaveIdx = section.indexOf('"video.save"');
  assert.ok(videoSaveIdx >= 0, "must have video.save validation branch");
  const block = section.slice(videoSaveIdx, videoSaveIdx + 400);
  assert.ok(
    block.includes('typeof obj.title !== "string" || !obj.title.trim()'),
    "must validate title is a non-empty string"
  );
  assert.ok(block.includes("Video title is required"), "must return descriptive error");
});

// ===========================================================================
// 32. validatePayload: video.save requires youtubeUrl
// ===========================================================================
test("32. validatePayload video.save requires youtubeUrl", async () => {
  const src = await readSource("../app/api/admin/data/route.ts");
  const vpIdx = src.indexOf("function validatePayload(");
  const section = src.slice(vpIdx, vpIdx + 5000);
  const videoSaveIdx = section.indexOf('"video.save"');
  const block = section.slice(videoSaveIdx, videoSaveIdx + 400);
  assert.ok(
    block.includes('typeof obj.youtubeUrl !== "string" || !obj.youtubeUrl.trim()'),
    "must validate youtubeUrl is a non-empty string"
  );
  assert.ok(block.includes("YouTube URL is required"), "must return descriptive error");
});

// ===========================================================================
// 33. validatePayload: video.save requires consentNote >= 5 chars
// ===========================================================================
test("33. validatePayload video.save requires consentNote >= 5 chars", async () => {
  const src = await readSource("../app/api/admin/data/route.ts");
  const vpIdx = src.indexOf("function validatePayload(");
  const section = src.slice(vpIdx, vpIdx + 5000);
  const videoSaveIdx = section.indexOf('"video.save"');
  const block = section.slice(videoSaveIdx, videoSaveIdx + 600);
  assert.ok(
    block.includes("consentNote") && block.includes("trim().length < 5"),
    "must validate consentNote is at least 5 characters"
  );
  assert.ok(block.includes("Consent note must be at least 5 characters"), "must return descriptive error");
});

// ===========================================================================
// 34. validatePayload: video.visibility requires id
// ===========================================================================
test("34. validatePayload video.visibility requires id", async () => {
  const src = await readSource("../app/api/admin/data/route.ts");
  const vpIdx = src.indexOf("function validatePayload(");
  const section = src.slice(vpIdx, vpIdx + 5500);
  const visIdx = section.indexOf('"video.visibility"');
  assert.ok(visIdx >= 0, "must have video.visibility validation branch");
  const block = section.slice(visIdx, visIdx + 200);
  assert.ok(
    block.includes('typeof obj.id !== "string" || !obj.id.trim()'),
    "must validate id is a non-empty string"
  );
  assert.ok(block.includes("Video ID is required"), "must return descriptive error");
});

// ===========================================================================
// 35. validatePayload: video.delete requires id
// ===========================================================================
test("35. validatePayload video.delete requires id", async () => {
  const src = await readSource("../app/api/admin/data/route.ts");
  const vpIdx = src.indexOf("function validatePayload(");
  const section = src.slice(vpIdx, vpIdx + 5500);
  const delIdx = section.indexOf('"video.delete"');
  assert.ok(delIdx >= 0, "must have video.delete validation branch");
  const block = section.slice(delIdx, delIdx + 200);
  assert.ok(
    block.includes('typeof obj.id !== "string" || !obj.id.trim()'),
    "must validate id is a non-empty string"
  );
  assert.ok(block.includes("Video ID is required"), "must return descriptive error");
});

// ===========================================================================
// 36. validatePayload: video.restore requires id
// ===========================================================================
test("36. validatePayload video.restore requires id", async () => {
  const src = await readSource("../app/api/admin/data/route.ts");
  const vpIdx = src.indexOf("function validatePayload(");
  const section = src.slice(vpIdx, vpIdx + 5500);
  const restoreIdx = section.indexOf('"video.restore"');
  assert.ok(restoreIdx >= 0, "must have video.restore validation branch");
  const block = section.slice(restoreIdx, restoreIdx + 200);
  assert.ok(
    block.includes('typeof obj.id !== "string" || !obj.id.trim()'),
    "must validate id is a non-empty string"
  );
  assert.ok(block.includes("Video ID is required"), "must return descriptive error");
});

// ===========================================================================
// 37. validatePayload returns ok for valid video.save payload
// ===========================================================================
test("37. validatePayload returns ok for valid video.save payload", async () => {
  const src = await readSource("../app/api/admin/data/route.ts");
  const vpIdx = src.indexOf("function validatePayload(");
  const section = src.slice(vpIdx, vpIdx + 9000);
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
// 38. validatePayload rejects invalid video.save payload
// ===========================================================================
test("38. validatePayload rejects invalid video.save payload", async () => {
  const src = await readSource("../app/api/admin/data/route.ts");
  const vpIdx = src.indexOf("function validatePayload(");
  const section = src.slice(vpIdx, vpIdx + 5000);
  const videoSaveIdx = section.indexOf('"video.save"');
  const block = section.slice(videoSaveIdx, videoSaveIdx + 400);
  assert.ok(block.includes('return { ok: false'), "must return ok:false with error message");
  assert.ok(block.includes("error:"), "error response must include error message");
});

// ===========================================================================
// 39. PatientVideoStudio exists and is exported
// ===========================================================================
test("39. PatientVideoStudio exists and is exported", async () => {
  const src = await readSource("../app/components/admin/PatientVideoStudio.tsx");
  assert.ok(
    src.includes("export default function PatientVideoStudio"),
    "must have default export named PatientVideoStudio"
  );
});

// ===========================================================================
// 40. PatientVideoStudio imports from @/app/lib/youtube
// ===========================================================================
test("40. PatientVideoStudio imports from @/app/lib/youtube", async () => {
  const src = await readSource("../app/components/admin/PatientVideoStudio.tsx");
  assert.ok(
    src.includes('from "@/app/lib/youtube"'),
    "must import from shared @/app/lib/youtube module"
  );
});

// ===========================================================================
// 41. PatientVideoStudio has expected callback props
// ===========================================================================
test("41. PatientVideoStudio has onSave, onPublish, onHide, onArchive, onRestore props", async () => {
  const src = await readSource("../app/components/admin/PatientVideoStudio.tsx");
  assert.ok(src.includes("onSave"), "must have onSave prop");
  assert.ok(src.includes("onPublish"), "must have onPublish prop");
  assert.ok(src.includes("onHide"), "must have onHide prop");
  assert.ok(src.includes("onArchive"), "must have onArchive prop");
  assert.ok(src.includes("onRestore"), "must have onRestore prop");
});

// ===========================================================================
// 42. PatientVideoStudio renders "Patient Video Studio" heading
// ===========================================================================
test("42. PatientVideoStudio renders Patient Video Studio heading", async () => {
  const src = await readSource("../app/components/admin/PatientVideoStudio.tsx");
  assert.ok(
    src.includes("Patient Video Studio"),
    "must render Patient Video Studio heading"
  );
  assert.ok(src.includes("<h2"), "heading must be an h2 element");
});

// ===========================================================================
// 43. PatientVideoStudio renders Add Video button
// ===========================================================================
test("43. PatientVideoStudio renders Add Video button", async () => {
  const src = await readSource("../app/components/admin/PatientVideoStudio.tsx");
  assert.ok(src.includes("Add Video"), "must render Add Video button text");
  assert.ok(src.includes("Plus"), "must use Plus icon for add button");
});

// ===========================================================================
// 44. PatientVideoStudio renders summary cards (total, live, hidden, archived)
// ===========================================================================
test("44. PatientVideoStudio renders summary cards for total, live, hidden, archived", async () => {
  const src = await readSource("../app/components/admin/PatientVideoStudio.tsx");
  assert.ok(src.includes("vs-summary"), "must render summary section with class vs-summary");
  assert.ok(src.includes("vs-summary-card"), "must render summary card elements");
  const summaryStart = src.indexOf("vs-summary");
  const summaryEnd = src.indexOf("vs-filters");
  const summarySection = src.slice(summaryStart, summaryEnd);
  assert.ok(summarySection.includes("Total"), "must show Total count label");
  assert.ok(summarySection.includes("Live"), "must show Live count label");
  assert.ok(summarySection.includes("Hidden"), "must show Hidden count label");
  assert.ok(summarySection.includes("Archived"), "must show Archived count label");
});

// ===========================================================================
// 45. PatientVideoStudio uses resolveYouTubeIdWithType for URL validation
// ===========================================================================
test("45. PatientVideoStudio uses resolveYouTubeIdWithType for URL validation", async () => {
  const src = await readSource("../app/components/admin/PatientVideoStudio.tsx");
  assert.ok(
    src.includes("resolveYouTubeIdWithType"),
    "must use resolveYouTubeIdWithType for URL validation"
  );
  assert.ok(
    src.includes('resolveYouTubeIdWithType({ youtubeUrl'),
    "must pass youtubeUrl to resolver"
  );
});

// ===========================================================================
// 46. PatientVideoStudio uses thumbnailUrl for card images
// ===========================================================================
test("46. PatientVideoStudio uses thumbnailUrl for card images", async () => {
  const src = await readSource("../app/components/admin/PatientVideoStudio.tsx");
  assert.ok(src.includes("thumbnailUrl("), "must call thumbnailUrl for card thumbnails");
  assert.ok(src.includes("src={thumbnailUrl("), "thumbnailUrl must be used for img src");
  assert.ok(src.includes("onError"), "must have fallback onError handler");
  assert.ok(
    src.includes("thumbnailUrl(row._resolvedId,") && src.includes("true"),
    "onError must fallback to hqdefault (true parameter)"
  );
});

// ===========================================================================
// 47. PatientVideoStudio uses embedUrl for preview modal
// ===========================================================================
test("47. PatientVideoStudio uses embedUrl for preview modal", async () => {
  const src = await readSource("../app/components/admin/PatientVideoStudio.tsx");
  assert.ok(src.includes("embedUrl("), "must call embedUrl for preview");
  assert.ok(
    src.includes('src={embedUrl(String(previewVideo._resolvedId))}'),
    "preview iframe src must use embedUrl with resolved ID"
  );
});

// ===========================================================================
// 48. PatientVideoStudio renders lifecycle badges (live, hidden, archived)
// ===========================================================================
test("48. PatientVideoStudio renders lifecycle badges (live, hidden, archived - never raw is_visible)", async () => {
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
// 49. PatientVideoStudio uses native dialog for preview
// ===========================================================================
test("49. PatientVideoStudio uses native dialog for preview", async () => {
  const src = await readSource("../app/components/admin/PatientVideoStudio.tsx");
  assert.ok(src.includes("<dialog"), "must use native <dialog> element");
  assert.ok(src.includes("ref={dialogRef}"), "dialog must use ref");
  assert.ok(src.includes("showModal()"), "must call showModal() to open dialog");
  assert.ok(src.includes("dialogRef.current?.close()"), "must call .close() to dismiss");
  assert.ok(src.includes("onClose={handleClosePreview}"), "must handle onClose event");
});

// ===========================================================================
// 50. PatientVideoStudio handles dirty state with confirm dialog
// ===========================================================================
test("50. PatientVideoStudio handles dirty state with confirm dialog", async () => {
  const src = await readSource("../app/components/admin/PatientVideoStudio.tsx");
  assert.ok(src.includes("isDirty"), "must track dirty state");
  assert.ok(
    src.includes("Discard unsaved video changes?"),
    "must prompt user when form is dirty"
  );
  assert.ok(src.includes("window.confirm"), "must use window.confirm for dirty guard");
  assert.ok(src.includes("guardDirty"), "must define guardDirty helper function");
});

// ===========================================================================
// 51. PatientVideoStudio renders search input
// ===========================================================================
test("51. PatientVideoStudio renders search input", async () => {
  const src = await readSource("../app/components/admin/PatientVideoStudio.tsx");
  assert.ok(src.includes("vs-search"), "must render search container");
  assert.ok(src.includes('placeholder="Search videos..."'), "must have search placeholder");
  assert.ok(src.includes("searchQuery"), "must track search query state");
  assert.ok(src.includes("setSearchQuery"), "must update search query state");
  assert.ok(src.includes("Search"), "must use Search icon");
});

// ===========================================================================
// 52. PatientVideoStudio renders filter chips (all, live, hidden, archived)
// ===========================================================================
test("52. PatientVideoStudio renders filter chips (all, live, hidden, archived)", async () => {
  const src = await readSource("../app/components/admin/PatientVideoStudio.tsx");
  assert.ok(src.includes("vs-filter-chips"), "must render filter chips container");
  assert.ok(src.includes('"all"'), "must include 'all' filter option");
  assert.ok(src.includes('"live"'), "must include 'live' filter option");
  assert.ok(src.includes('"hidden"'), "must include 'hidden' filter option");
  assert.ok(src.includes('"archived"'), "must include 'archived' filter option");
  assert.ok(src.includes("activeFilter"), "must track active filter state");
  assert.ok(src.includes("vs-chip"), "must render chip elements with vs-chip class");
});

// ===========================================================================
// 53. PatientVideoStudio form validates consentNote >= 5 chars
// ===========================================================================
test("53. PatientVideoStudio form validates consentNote >= 5 chars", async () => {
  const src = await readSource("../app/components/admin/PatientVideoStudio.tsx");
  assert.ok(
    src.includes("consentNote.trim().length < 5"),
    "must validate consentNote is at least 5 characters"
  );
  assert.ok(
    src.includes("Consent note must be at least 5 characters"),
    "must show descriptive validation error"
  );
});

// ===========================================================================
// 54. Save handler includes isNew flag for new videos
// ===========================================================================
test("54. Save handler includes isNew flag for new videos", async () => {
  const src = await readSource("../app/components/admin/PatientVideoStudio.tsx");
  const saveIdx = src.indexOf("handleSave");
  const saveBlock = src.slice(saveIdx, saveIdx + 1200);
  assert.ok(
    saveBlock.includes("isNew: true"),
    "payload must include isNew:true when creating new video"
  );
  assert.ok(
    saveBlock.includes("id: selectedVideo.id"),
    "payload must include id when updating existing video"
  );
});

// ===========================================================================
// 55. Action buttons use stopPropagation
// ===========================================================================
test("55. Action buttons use stopPropagation", async () => {
  const src = await readSource("../app/components/admin/PatientVideoStudio.tsx");
  const stopCount = (src.match(/e\.stopPropagation\(\)/g) || []).length;
  assert.ok(stopCount >= 4, `action buttons must use stopPropagation (found ${stopCount} calls, need >= 4)`);
  assert.ok(
    src.includes("handlePreview") && src.includes("stopPropagation"),
    "preview handler must use stopPropagation"
  );
});

// ===========================================================================
// 56. AdminConsole imports PatientVideoStudio
// ===========================================================================
test("56. AdminConsole imports PatientVideoStudio", async () => {
  const src = await readSource("../app/components/AdminConsole.tsx");
  assert.ok(
    src.includes('import PatientVideoStudio from "@/app/components/admin/PatientVideoStudio"'),
    "AdminConsole must import PatientVideoStudio"
  );
});

// ===========================================================================
// 57. AdminConsole passes correct props to PatientVideoStudio
// ===========================================================================
test("57. AdminConsole passes correct props to PatientVideoStudio", async () => {
  const src = await readSource("../app/components/AdminConsole.tsx");
  const studioIdx = src.indexOf("<PatientVideoStudio");
  const block = src.slice(studioIdx, studioIdx + 700);
  assert.ok(block.includes("busy={busy}"), "must pass busy prop");
  assert.ok(block.includes("csrf={csrf}"), "must pass csrf prop");
  assert.ok(block.includes("videos={adminData.videos}"), "must pass videos data");
  assert.ok(block.includes("onSave="), "must pass onSave handler");
  assert.ok(block.includes("onPublish="), "must pass onPublish handler");
  assert.ok(block.includes("onHide="), "must pass onHide handler");
  assert.ok(block.includes("onArchive="), "must pass onArchive handler");
  assert.ok(block.includes("onRestore="), "must pass onRestore handler");
});

// ===========================================================================
// 58. Videos tab uses PatientVideoStudio (not old VideoForm)
// ===========================================================================
test("58. Videos tab uses PatientVideoStudio (not old VideoForm)", async () => {
  const src = await readSource("../app/components/AdminConsole.tsx");
  assert.ok(
    src.includes('active === "Videos"'),
    "must have Videos tab"
  );
  const tabIdx = src.indexOf('active === "Videos"');
  const tabBlock = src.slice(tabIdx, tabIdx + 800);
  assert.ok(tabBlock.includes("<PatientVideoStudio"), "Videos tab must render PatientVideoStudio");
  assert.ok(!tabBlock.includes("VideoForm"), "Videos tab must NOT render old VideoForm");
  assert.ok(
    tabBlock.includes('"video.save"'),
    "onSave must dispatch video.save action"
  );
  assert.ok(
    tabBlock.includes('"video.visibility"'),
    "onPublish/onHide must dispatch video.visibility action"
  );
  assert.ok(
    tabBlock.includes('"video.delete"'),
    "onArchive must dispatch video.delete action"
  );
  assert.ok(
    tabBlock.includes('"video.restore"'),
    "onRestore must dispatch video.restore action"
  );
});

// ===========================================================================
// 59. PatientStoriesGallery imports from @/app/lib/youtube (migrated)
// ===========================================================================
test("59. PatientStoriesGallery imports from @/app/lib/youtube (migrated from inline)", async () => {
  const src = await readSource("../app/components/PatientStoriesGallery.tsx");
  assert.ok(
    src.includes('from "@/app/lib/youtube"'),
    "must import from shared youtube module"
  );
  assert.ok(src.includes("resolveYouTubeId"), "must import resolveYouTubeId");
  assert.ok(src.includes("ytThumbnailUrl") || src.includes("thumbnailUrl"), "must import thumbnailUrl");
  assert.ok(src.includes("ytEmbedUrl") || src.includes("embedUrl"), "must import embedUrl");
});

// ===========================================================================
// 60. youtube.ts exports all expected functions
// ===========================================================================
test("60. youtube.ts exports resolveYouTubeId, resolveYouTubeIdWithType, thumbnailUrl, embedUrl", async () => {
  const src = await readSource("../app/lib/youtube.ts");
  assert.ok(src.includes("export function resolveYouTubeId("), "must export resolveYouTubeId");
  assert.ok(src.includes("export function resolveYouTubeIdWithType("), "must export resolveYouTubeIdWithType");
  assert.ok(src.includes("export function thumbnailUrl("), "must export thumbnailUrl");
  assert.ok(src.includes("export function embedUrl("), "must export embedUrl");
  assert.ok(src.includes("export type YouTubeResolveResult"), "must export YouTubeResolveResult type");
});

// ===========================================================================
// 61. PatientStoriesGallery no longer defines its own isValidYoutubeId
// ===========================================================================
test("61. PatientStoriesGallery no longer defines its own isValidYoutubeId function", async () => {
  const src = await readSource("../app/components/PatientStoriesGallery.tsx");
  assert.ok(
    !src.includes("function isValidYoutubeId"),
    "must NOT define a local isValidYoutubeId function"
  );
  assert.ok(
    !src.includes("function isValidYouTubeId"),
    "must NOT define a local isValidYouTubeId function (any casing)"
  );
});

// ===========================================================================
// 62. applyVideo uses parseYouTubeId for ID extraction
// ===========================================================================
test("62. applyVideo uses parseYouTubeId for ID extraction", async () => {
  const src = await readSource("../app/api/admin/data/route.ts");
  const fnStart = src.indexOf("async function applyVideo(");
  const fnBody = src.slice(fnStart, fnStart + 600);
  assert.ok(
    fnBody.includes("parseYouTubeId"),
    "must use parseYouTubeId to extract YouTube ID from URL"
  );
});

// ===========================================================================
// 63. PatientVideoStudio getLifecycle helper maps is_deleted=1 to archived
// ===========================================================================
test("63. getLifecycle maps is_deleted=1 to archived", async () => {
  const src = await readSource("../app/components/admin/PatientVideoStudio.tsx");
  const fnStart = src.indexOf("function getLifecycle(");
  const fnBody = src.slice(fnStart, fnStart + 250);
  assert.ok(fnBody.includes("is_deleted === 1"), "must check is_deleted === 1 for archived");
  assert.ok(
    fnBody.includes('return "archived"'),
    "must return 'archived' when is_deleted=1"
  );
  assert.ok(
    fnBody.includes('return "live"'),
    "must return 'live' when APPROVED and visible"
  );
  assert.ok(
    fnBody.includes('return "hidden"'),
    "must return 'hidden' as default fallback"
  );
});

// ===========================================================================
// 64. PatientVideoStudio validates YouTube URL in form validation
// ===========================================================================
test("64. PatientVideoStudio validates YouTube URL via resolveYouTubeIdWithType", async () => {
  const src = await readSource("../app/components/admin/PatientVideoStudio.tsx");
  const fnStart = src.indexOf("function validateForm(");
  const fnBody = src.slice(fnStart, fnStart + 500);
  assert.ok(fnBody.includes("resolveYouTubeIdWithType"), "must call resolveYouTubeIdWithType in form validation");
  assert.ok(
    fnBody.includes("Invalid YouTube URL"),
    "must show error for invalid YouTube URL"
  );
});

// ===========================================================================
// 65. applyDeleteVideo requires id field
// ===========================================================================
test("65. applyDeleteVideo requires id field", async () => {
  const src = await readSource("../app/api/admin/data/route.ts");
  const fnStart = src.indexOf("async function applyDeleteVideo(");
  const fnBody = src.slice(fnStart, fnStart + 400);
  assert.ok(fnBody.includes("Video ID is required"), "must throw if id is missing");
});
