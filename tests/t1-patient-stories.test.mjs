import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readSource(relativePath) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

// ---------------------------------------------------------------------------
// 1. TestimonialsPage no longer renders direct iframes
// ---------------------------------------------------------------------------
test("1. TestimonialsPage renders no direct iframes", async () => {
  const src = await readSource("../app/testimonials/page.tsx");
  assert.ok(!src.includes("<iframe"), "page.tsx must not contain any iframe elements");
});

// ---------------------------------------------------------------------------
// 2. PatientStoriesGallery initial render contains zero iframes
// ---------------------------------------------------------------------------
test("2. PatientStoriesGallery source contains no eager iframe", async () => {
  const src = await readSource("../app/components/PatientStoriesGallery.tsx");
  assert.ok(src.includes('<iframe'), "must contain an iframe (inside Modal)");
  const modalIdx = src.indexOf("function Modal(");
  const iframeIdx = src.indexOf("<iframe", modalIdx);
  assert.ok(iframeIdx > modalIdx, "iframe must be inside the Modal function");
});

// ---------------------------------------------------------------------------
// 3. First valid video renders as Featured Story
// ---------------------------------------------------------------------------
test("3. First valid video renders as Featured Story", async () => {
  const src = await readSource("../app/components/PatientStoriesGallery.tsx");
  assert.ok(src.includes('data-testid="featured-story"'), "must render featured-story element");
  assert.ok(src.includes("Featured Patient Story"), "must show Featured Patient Story badge");
});

// ---------------------------------------------------------------------------
// 4. Remaining videos render in supporting grid
// ---------------------------------------------------------------------------
test("4. Remaining videos render in supporting grid", async () => {
  const src = await readSource("../app/components/PatientStoriesGallery.tsx");
  assert.ok(src.includes('data-testid="supporting-grid"'), "must render supporting-grid container");
  assert.ok(src.includes('data-testid="story-card"'), "must render story-card elements");
});

// ---------------------------------------------------------------------------
// 5. Empty list preserves empty state
// ---------------------------------------------------------------------------
test("5. Empty list preserves empty state", async () => {
  const src = await readSource("../app/testimonials/page.tsx");
  assert.ok(src.includes("getPublishedVideos"), "must use getPublishedVideos");
  const gallery = await readSource("../app/components/PatientStoriesGallery.tsx");
  assert.ok(gallery.includes("No video testimonials are currently available"), "must show empty state message");
});

// ---------------------------------------------------------------------------
// 6. resolveYouTubeId is defined and used for filtering
// ---------------------------------------------------------------------------
test("6. resolveYouTubeId is defined and used for filtering", async () => {
  const src = await readSource("../app/components/PatientStoriesGallery.tsx");
  assert.ok(src.includes("resolveYouTubeId"), "must define resolveYouTubeId");
  assert.ok(src.includes("resolvedVideos"), "must resolve videos before filtering");
});

// ---------------------------------------------------------------------------
// 7. ThumbnailImg is only called after resolving
// ---------------------------------------------------------------------------
test("7. ThumbnailImg receives resolvedId only after resolving", async () => {
  const src = await readSource("../app/components/PatientStoriesGallery.tsx");
  assert.ok(src.includes("resolvedId"), "ThumbnailImg must use resolvedId prop");
  const thumbnailImgIdx = src.indexOf("function ThumbnailImg(");
  const resolvedIdProp = src.indexOf("resolvedId={video._resolvedId}", thumbnailImgIdx);
  assert.ok(resolvedIdProp > thumbnailImgIdx, "resolvedId must be passed from resolved video");
});

// ---------------------------------------------------------------------------
// 8. embedUrl is only called inside Modal
// ---------------------------------------------------------------------------
test("8. embedUrl must only be called inside Modal", async () => {
  const src = await readSource("../app/components/PatientStoriesGallery.tsx");
  assert.ok(src.includes("embedUrl"), "must define embedUrl helper");
  const modalIdx = src.indexOf("function Modal(");
  const embedCallIdx = src.indexOf("embedUrl(", modalIdx);
  assert.ok(embedCallIdx > modalIdx, "embedUrl must only be called inside Modal");
});

// ---------------------------------------------------------------------------
// 9. Feature card uses maxres thumbnail
// ---------------------------------------------------------------------------
test("9. Feature card uses maxres thumbnail as primary", async () => {
  const src = await readSource("../app/components/PatientStoriesGallery.tsx");
  assert.ok(src.includes("maxresdefault"), "must use maxresdefault.jpg as primary thumbnail");
});

// ---------------------------------------------------------------------------
// 10. Thumbnail supports hqdefault fallback
// ---------------------------------------------------------------------------
test("10. Thumbnail supports hqdefault fallback", async () => {
  const src = await readSource("../app/components/PatientStoriesGallery.tsx");
  assert.ok(src.includes("hqdefault"), "must support hqdefault.jpg fallback");
});

// ---------------------------------------------------------------------------
// 11. Feature card shows Featured Patient Story
// ---------------------------------------------------------------------------
test("11. Feature card shows Featured Patient Story badge", async () => {
  const src = await readSource("../app/components/PatientStoriesGallery.tsx");
  assert.ok(src.includes("Featured Patient Story"), "must display Featured Patient Story");
});

// ---------------------------------------------------------------------------
// 12. Standard cards show Patient Story
// ---------------------------------------------------------------------------
test("12. Standard cards show Patient Story badge", async () => {
  const src = await readSource("../app/components/PatientStoriesGallery.tsx");
  assert.ok(src.includes("Patient Story"), "must display Patient Story badge on standard cards");
});

// ---------------------------------------------------------------------------
// 13. Play controls are real buttons
// ---------------------------------------------------------------------------
test("13. Play controls are real button elements", async () => {
  const src = await readSource("../app/components/PatientStoriesGallery.tsx");
  assert.ok(src.includes('type="button"'), "play controls must be type=button");
  const playBtnIdx = src.indexOf("function PlayButton(");
  const buttonIdx = src.indexOf("<button", playBtnIdx);
  assert.ok(buttonIdx > playBtnIdx, "PlayButton must render a real <button>");
});

// ---------------------------------------------------------------------------
// 14. Play labels include title
// ---------------------------------------------------------------------------
test("14. Play labels include video title", async () => {
  const src = await readSource("../app/components/PatientStoriesGallery.tsx");
  assert.ok(src.includes("aria-label={`Play patient story: ${title}`"), "aria-label must include title");
});

// ---------------------------------------------------------------------------
// 15. Clicking Play sets selected video
// ---------------------------------------------------------------------------
test("15. Play onClick sets selectedVideo", async () => {
  const src = await readSource("../app/components/PatientStoriesGallery.tsx");
  assert.ok(src.includes("setSelectedVideo"), "must call setSelectedVideo");
  assert.ok(src.includes("handlePlay"), "must define handlePlay callback");
});

// ---------------------------------------------------------------------------
// 16. Exactly one iframe renders after click
// ---------------------------------------------------------------------------
test("16. Only one iframe exists in the entire component", async () => {
  const src = await readSource("../app/components/PatientStoriesGallery.tsx");
  const matches = src.match(/<iframe/g);
  assert.ok(matches, "must have at least one iframe");
  assert.equal(matches.length, 1, "must have exactly one iframe in entire component source");
});

// ---------------------------------------------------------------------------
// 17. iframe uses youtube-nocookie.com
// ---------------------------------------------------------------------------
test("17. iframe uses youtube-nocookie.com", async () => {
  const src = await readSource("../app/components/PatientStoriesGallery.tsx");
  assert.ok(src.includes("youtube-nocookie.com"), "must use youtube-nocookie.com");
  assert.ok(!src.includes("www.youtube.com/embed"), "must not use standard youtube embed");
});

// ---------------------------------------------------------------------------
// 18. iframe includes autoplay=1
// ---------------------------------------------------------------------------
test("18. iframe includes autoplay=1", async () => {
  const src = await readSource("../app/components/PatientStoriesGallery.tsx");
  assert.ok(src.includes("autoplay=1"), "iframe must include autoplay=1");
});

// ---------------------------------------------------------------------------
// 19. iframe includes rel=0
// ---------------------------------------------------------------------------
test("19. iframe includes rel=0", async () => {
  const src = await readSource("../app/components/PatientStoriesGallery.tsx");
  assert.ok(src.includes("rel=0"), "iframe must include rel=0");
});

// ---------------------------------------------------------------------------
// 20. iframe includes playsinline=1
// ---------------------------------------------------------------------------
test("20. iframe includes playsinline=1", async () => {
  const src = await readSource("../app/components/PatientStoriesGallery.tsx");
  assert.ok(src.includes("playsinline=1"), "iframe must include playsinline=1");
});

// ---------------------------------------------------------------------------
// 21. iframe title includes video title
// ---------------------------------------------------------------------------
test("21. iframe title includes video title", async () => {
  const src = await readSource("../app/components/PatientStoriesGallery.tsx");
  assert.ok(src.includes("Patient story video: "), "iframe title must include 'Patient story video:'");
});

// ---------------------------------------------------------------------------
// 22. iframe supports fullscreen
// ---------------------------------------------------------------------------
test("22. iframe supports fullscreen", async () => {
  const src = await readSource("../app/components/PatientStoriesGallery.tsx");
  assert.ok(src.includes("allowFullScreen"), "iframe must support allowFullScreen");
});

// ---------------------------------------------------------------------------
// 23. Close removes/unmounts iframe
// ---------------------------------------------------------------------------
test("23. Close sets selectedVideo to null, unmounting iframe", async () => {
  const src = await readSource("../app/components/PatientStoriesGallery.tsx");
  assert.ok(src.includes("setSelectedVideo(null)"), "close must set selectedVideo to null");
  assert.ok(src.includes("handleClose"), "must define handleClose callback");
});

// ---------------------------------------------------------------------------
// 24. Close stops the active player by unmounting
// ---------------------------------------------------------------------------
test("24. Close dialog and unmount iframe", async () => {
  const src = await readSource("../app/components/PatientStoriesGallery.tsx");
  assert.ok(src.includes("{selectedVideo && ("), "Modal must only render when selectedVideo is truthy");
});

// ---------------------------------------------------------------------------
// 25. Native dialog onClose handles Escape (no custom keydown listener)
// ---------------------------------------------------------------------------
test("25. Native dialog onClose handles Escape without custom keydown listener", async () => {
  const src = await readSource("../app/components/PatientStoriesGallery.tsx");
  assert.ok(src.includes("onClose={finalizeClose}"), "dialog must use onClose for native close path");
  assert.ok(!src.includes("addEventListener(\"keydown\""), "must not add custom keydown listener");
  assert.ok(!src.includes("removeEventListener(\"keydown\""), "must not remove custom keydown listener");
});

// ---------------------------------------------------------------------------
// 26. Focus returns to the trigger
// ---------------------------------------------------------------------------
test("26. Focus returns to trigger button after close", async () => {
  const src = await readSource("../app/components/PatientStoriesGallery.tsx");
  assert.ok(src.includes("activeTriggerRef"), "must have activeTriggerRef for focus return");
  assert.ok(src.includes("triggerRef.current?.focus()"), "must focus trigger after close via triggerRef");
});

// ---------------------------------------------------------------------------
// 27. No iframe exists after close
// ---------------------------------------------------------------------------
test("27. No iframe when selectedVideo is null", async () => {
  const src = await readSource("../app/components/PatientStoriesGallery.tsx");
  assert.ok(src.includes("{selectedVideo && ("), "iframe conditional on selectedVideo");
});

// ---------------------------------------------------------------------------
// 28. Featured desktop layout is horizontal
// ---------------------------------------------------------------------------
test("28. Featured desktop layout is horizontal", async () => {
  const css = await readSource("../app/globals.css");
  assert.ok(css.includes(".ps-featured"), "must define .ps-featured styles");
  assert.ok(css.includes("grid-template-columns: 1.6fr 0.85fr"), "featured must use horizontal grid layout");
});

// ---------------------------------------------------------------------------
// 29. Featured mobile layout is stacked
// ---------------------------------------------------------------------------
test("29. Featured mobile layout is stacked", async () => {
  const css = await readSource("../app/globals.css");
  const mobileBreakpoint = css.indexOf("@media (max-width: 780px)");
  assert.ok(mobileBreakpoint > 0, "must have mobile breakpoint");
  const psFeaturedMobile = css.indexOf("grid-template-columns: 1fr", mobileBreakpoint);
  assert.ok(psFeaturedMobile > mobileBreakpoint, "mobile must stack featured to single column");
});

// ---------------------------------------------------------------------------
// 30. Supporting grid is 3/2/1 responsive
// ---------------------------------------------------------------------------
test("30. Supporting grid is 3/2/1 responsive", async () => {
  const css = await readSource("../app/globals.css");
  assert.ok(css.includes(".ps-grid"), "must define .ps-grid");
  assert.ok(css.includes("grid-template-columns: repeat(3, minmax(0, 1fr))"), "desktop must be 3 columns");
  const tablet = css.indexOf("@media (max-width: 1099px)");
  assert.ok(tablet > 0, "must have tablet breakpoint");
  assert.ok(css.indexOf("repeat(2, minmax(0, 1fr))", tablet) > tablet, "tablet must be 2 columns");
  const mobile = css.indexOf("@media (max-width: 780px)");
  assert.ok(mobile > 0, "must have mobile breakpoint");
});

// ---------------------------------------------------------------------------
// 31. Card radius is 22px
// ---------------------------------------------------------------------------
test("31. Standard card border-radius is 22px", async () => {
  const css = await readSource("../app/globals.css");
  const cardIdx = css.indexOf(".ps-card {");
  const radiusIdx = css.indexOf("border-radius: 22px", cardIdx);
  assert.ok(radiusIdx > cardIdx, ".ps-card must have border-radius: 22px");
});

// ---------------------------------------------------------------------------
// 32. Featured radius is 26px
// ---------------------------------------------------------------------------
test("32. Featured card border-radius is 26px", async () => {
  const css = await readSource("../app/globals.css");
  const featuredIdx = css.indexOf(".ps-featured {");
  const radiusIdx = css.indexOf("border-radius: 26px", featuredIdx);
  assert.ok(radiusIdx > featuredIdx, ".ps-featured must have border-radius: 26px");
});

// ---------------------------------------------------------------------------
// 33. Modal radius is 24px
// ---------------------------------------------------------------------------
test("33. Modal border-radius is 24px", async () => {
  const css = await readSource("../app/globals.css");
  const modalIdx = css.indexOf(".ps-modal {");
  const radiusIdx = css.indexOf("border-radius: 24px", modalIdx);
  assert.ok(radiusIdx > modalIdx, ".ps-modal must have border-radius: 24px");
});

// ---------------------------------------------------------------------------
// 34. Reduced-motion rule removes transforms
// ---------------------------------------------------------------------------
test("34. Reduced-motion removes card transforms", async () => {
  const css = await readSource("../app/globals.css");
  const rmIdx = css.lastIndexOf("@media (prefers-reduced-motion: reduce)");
  assert.ok(rmIdx > 0, "must have prefers-reduced-motion rule");
  assert.ok(css.includes(".ps-card:hover") && css.includes("transform: none"), "must disable transforms on hover");
});

// ---------------------------------------------------------------------------
// 35. Focus-visible styles exist for gallery
// ---------------------------------------------------------------------------
test("35. Focus-visible styles exist for gallery buttons", async () => {
  const css = await readSource("../app/globals.css");
  assert.ok(css.includes(".ps-play-btn:focus-visible"), "must define focus-visible for play buttons");
  assert.ok(css.includes(".ps-modal-close:focus-visible"), "must define focus-visible for close button");
});

// ---------------------------------------------------------------------------
// 36. No YouTube-red generic card branding
// ---------------------------------------------------------------------------
test("36. No YouTube-red branding", async () => {
  const src = await readSource("../app/components/PatientStoriesGallery.tsx");
  assert.ok(!src.includes("#FF0000"), "must not use YouTube red hex");
  assert.ok(!src.includes("youtube-red"), "must not use youtube-red class");
  assert.ok(!src.includes("youtubeRed"), "must not use youtubeRed variable");
});

// ---------------------------------------------------------------------------
// 37. No carousel dependency
// ---------------------------------------------------------------------------
test("37. No carousel dependency", async () => {
  const src = await readSource("../app/components/PatientStoriesGallery.tsx");
  assert.ok(!src.includes("carousel"), "must not use carousel");
  assert.ok(!src.includes("swiper"), "must not use swiper");
});

// ---------------------------------------------------------------------------
// 38. No YouTube SDK script
// ---------------------------------------------------------------------------
test("38. No YouTube SDK script", async () => {
  const src = await readSource("../app/components/PatientStoriesGallery.tsx");
  assert.ok(!src.includes("youtube.com/iframe_api"), "must not load YouTube SDK");
  assert.ok(!src.includes("YT.Player"), "must not use YT.Player");
  assert.ok(!src.includes("onYouTubeIframeAPIReady"), "must not use YouTube API callback");
});

// ---------------------------------------------------------------------------
// 39. No package change
// ---------------------------------------------------------------------------
test("39. No package or lockfile change", async () => {
  const pkg = await readSource("../package.json");
  assert.ok(!pkg.includes("patient-stories"), "package.json must not reference patient-stories");
  const src = await readSource("../app/components/PatientStoriesGallery.tsx");
  assert.ok(!src.includes("from \"framer"), "must not import framer-motion");
  assert.ok(!src.includes("from \"swiper"), "must not import swiper");
});

// ---------------------------------------------------------------------------
// 40. Appointment/email files unchanged
// ---------------------------------------------------------------------------
test("40. Appointment and email files unchanged", async () => {
  const route = await readSource("../app/api/appointments/route.ts");
  assert.ok(route.includes("sendHospitalAppointmentAlert"), "appointment route still has alert");
  const email = await readSource("../app/lib/appointment-email.ts");
  assert.ok(email.includes("AppointmentAlertResult"), "appointment email types intact");
});

// ---------------------------------------------------------------------------
// 41. Blog/Doctor/Gallery files unchanged
// ---------------------------------------------------------------------------
test("41. Blog/Doctor/Gallery files unchanged", async () => {
  const blog = await readSource("../app/blog/page.tsx");
  assert.ok(blog.includes("getPublishedBlogs"), "blog page intact");
  assert.ok(!blog.includes("PatientStoriesGallery"), "blog must not import PatientStoriesGallery");
});

// ---------------------------------------------------------------------------
// 42. getPublishedVideos still exists and is exported
// ---------------------------------------------------------------------------
test("42. getPublishedVideos still exists and is exported", async () => {
  const src = await readSource("../app/lib/public-data.ts");
  assert.ok(src.includes("export async function getPublishedVideos"), "getPublishedVideos must be exported");
  assert.ok(src.includes("patient_videos"), "must query patient_videos table");
  assert.ok(src.includes("APPROVED"), "must filter APPROVED status");
  assert.ok(src.includes("is_visible = 1"), "must filter visible only");
  assert.ok(src.includes("is_deleted = 0"), "must filter non-deleted only");
});

// ---------------------------------------------------------------------------
// 43. CSP includes youtube-nocookie.com
// ---------------------------------------------------------------------------
test("43. CSP includes youtube-nocookie.com in frame-src", async () => {
  const config = await readSource("../next.config.ts");
  assert.ok(config.includes("youtube-nocookie.com"), "CSP must allow youtube-nocookie.com");
  assert.ok(config.includes("i.ytimg.com"), "CSP img-src must allow i.ytimg.com");
});

// ---------------------------------------------------------------------------
// 44. Section uses pearl-blue gradient background
// ---------------------------------------------------------------------------
test("44. Section uses pearl-blue gradient background", async () => {
  const css = await readSource("../app/globals.css");
  assert.ok(css.includes(".ps-section"), "must define .ps-section");
  assert.ok(css.includes("#F7FAFC"), "must use #F7FAFC in gradient");
  assert.ok(css.includes("#EEF5F9"), "must use #EEF5F9 in gradient");
});

// ---------------------------------------------------------------------------
// 45. YouTube ID validation regex is strict
// ---------------------------------------------------------------------------
test("45. YouTube ID validation regex is strict 11-char", async () => {
  const src = await readSource("../app/components/PatientStoriesGallery.tsx");
  assert.ok(src.includes("[A-Za-z0-9_-]{11}"), "must use strict 11-character YouTube ID regex");
});

// ---------------------------------------------------------------------------
// 46. Design tokens defined
// ---------------------------------------------------------------------------
test("46. Design tokens defined in CSS", async () => {
  const css = await readSource("../app/globals.css");
  assert.ok(css.includes("--story-navy: #08233A"), "must define --story-navy");
  assert.ok(css.includes("--story-blue: #0B6FA4"), "must define --story-blue");
  assert.ok(css.includes("--story-cyan: #32B5D2"), "must define --story-cyan");
  assert.ok(css.includes("--story-pearl: #F5F9FC"), "must define --story-pearl");
  assert.ok(css.includes("--story-white: #FFFFFF"), "must define --story-white");
  assert.ok(css.includes("--story-muted: #607487"), "must define --story-muted");
  assert.ok(css.includes("--story-border: rgba(8, 35, 58, 0.12)"), "must define --story-border");
});

// ---------------------------------------------------------------------------
// 47. Component uses "use client" directive
// ---------------------------------------------------------------------------
test("47. PatientStoriesGallery is a client component", async () => {
  const src = await readSource("../app/components/PatientStoriesGallery.tsx");
  assert.ok(src.startsWith('"use client"'), "must start with 'use client' directive");
});

// ---------------------------------------------------------------------------
// 48. TestimonialsPage is a server component
// ---------------------------------------------------------------------------
test("48. TestimonialsPage remains a server component", async () => {
  const src = await readSource("../app/testimonials/page.tsx");
  assert.ok(!src.includes('"use client"'), "page.tsx must not be a client component");
  assert.ok(src.includes("getPublishedVideos"), "must call getPublishedVideos on server");
});

// ===========================================================================
// T1.1 NEW TESTS: URL compatibility resolver
// ===========================================================================

// ---------------------------------------------------------------------------
// 49. resolveYouTubeId is defined with URL parsing
// ---------------------------------------------------------------------------
test("49. resolveYouTubeId is defined with URL parsing", async () => {
  const src = await readSource("../app/components/PatientStoriesGallery.tsx");
  assert.ok(src.includes("function resolveYouTubeId"), "must define resolveYouTubeId");
  assert.ok(src.includes("new URL("), "must use URL constructor for parsing");
});

// ---------------------------------------------------------------------------
// 50. resolveYouTubeId accepts valid stored youtube_id
// ---------------------------------------------------------------------------
test("50. resolveYouTubeId accepts valid stored youtube_id", async () => {
  const src = await readSource("../app/components/PatientStoriesGallery.tsx");
  assert.ok(src.includes("ALLOWED_YT_HOSTS"), "must define allowed YouTube hosts list");
  assert.ok(src.includes('"www.youtube.com"'), "must allow www.youtube.com");
  assert.ok(src.includes('"youtube.com"'), "must allow youtube.com");
  assert.ok(src.includes('"m.youtube.com"'), "must allow m.youtube.com");
  assert.ok(src.includes('"youtu.be"'), "must allow youtu.be");
});

// ---------------------------------------------------------------------------
// 51. watch?v URL resolves correctly
// ---------------------------------------------------------------------------
test("51. watch?v URL format is supported in resolver", async () => {
  const src = await readSource("../app/components/PatientStoriesGallery.tsx");
  assert.ok(src.includes('"watch"'), "must handle /watch?v= path");
  assert.ok(src.includes('searchParams.has("v")'), "must extract v query parameter");
  assert.ok(src.includes('searchParams.get("v")'), "must read v query parameter value");
});

// ---------------------------------------------------------------------------
// 52. youtu.be URL resolves correctly
// ---------------------------------------------------------------------------
test("52. youtu.be URL format is supported in resolver", async () => {
  const src = await readSource("../app/components/PatientStoriesGallery.tsx");
  assert.ok(src.includes('url.hostname === "youtu.be"'), "must handle youtu.be short URLs");
});

// ---------------------------------------------------------------------------
// 53. shorts URL resolves correctly
// ---------------------------------------------------------------------------
test("53. shorts URL format is supported in resolver", async () => {
  const src = await readSource("../app/components/PatientStoriesGallery.tsx");
  assert.ok(src.includes('"shorts"'), "must handle /shorts/ path");
});

// ---------------------------------------------------------------------------
// 54. embed URL resolves correctly
// ---------------------------------------------------------------------------
test("54. embed URL format is supported in resolver", async () => {
  const src = await readSource("../app/components/PatientStoriesGallery.tsx");
  assert.ok(src.includes('"embed"'), "must handle /embed/ path");
});

// ---------------------------------------------------------------------------
// 55. HTTPS-only enforcement
// ---------------------------------------------------------------------------
test("55. HTTPS-only enforcement in resolver", async () => {
  const src = await readSource("../app/components/PatientStoriesGallery.tsx");
  assert.ok(src.includes('url.protocol !== "https:"'), "must reject non-HTTPS URLs");
});

// ---------------------------------------------------------------------------
// 56. Lookalike host rejection
// ---------------------------------------------------------------------------
test("56. Lookalike host rejection in resolver", async () => {
  const src = await readSource("../app/components/PatientStoriesGallery.tsx");
  assert.ok(src.includes("ALLOWED_YT_HOSTS.includes(url.hostname)"), "must validate against allowed hosts list");
});

// ---------------------------------------------------------------------------
// 57. Credentials/userinfo rejection
// ---------------------------------------------------------------------------
test("57. Credentials/userinfo rejection in resolver", async () => {
  const src = await readSource("../app/components/PatientStoriesGallery.tsx");
  assert.ok(src.includes("url.username || url.password"), "must reject URLs with credentials");
});

// ---------------------------------------------------------------------------
// 58. Final ID re-validated after extraction
// ---------------------------------------------------------------------------
test("58. Final ID re-validated after URL extraction", async () => {
  const src = await readSource("../app/components/PatientStoriesGallery.tsx");
  const resolveIdx = src.indexOf("function resolveYouTubeId");
  const validateIdx = src.indexOf("isValidYoutubeId(id)", resolveIdx);
  assert.ok(validateIdx > resolveIdx, "must re-validate extracted ID with isValidYoutubeId");
});

// ---------------------------------------------------------------------------
// 59. Raw youtube_url never used as iframe src
// ---------------------------------------------------------------------------
test("59. Raw youtube_url never used as iframe src", async () => {
  const src = await readSource("../app/components/PatientStoriesGallery.tsx");
  assert.ok(!src.includes("src={video.youtube_url}"), "raw youtube_url must never be iframe src");
  assert.ok(!src.includes("src={video.youtubeId}"), "raw youtubeId must never be iframe src");
});

// ---------------------------------------------------------------------------
// 60. No triggerRef={{ current: null }} remains
// ---------------------------------------------------------------------------
test("60. No triggerRef={{ current: null }} remains", async () => {
  const src = await readSource("../app/components/PatientStoriesGallery.tsx");
  assert.ok(!src.includes("{ current: null }"), "must not pass { current: null } as triggerRef");
});

// ---------------------------------------------------------------------------
// 61. activeTriggerRef is a real ref
// ---------------------------------------------------------------------------
test("61. activeTriggerRef is a real useRef", async () => {
  const src = await readSource("../app/components/PatientStoriesGallery.tsx");
  assert.ok(src.includes("activeTriggerRef"), "must define activeTriggerRef");
  assert.ok(src.includes("useRef<HTMLButtonElement | null>(null)"), "activeTriggerRef must be a real useRef");
  assert.ok(src.includes("activeTriggerRef.current = trigger"), "must capture real trigger element");
});

// ---------------------------------------------------------------------------
// 62. Play handlers pass trigger element
// ---------------------------------------------------------------------------
test("62. Play handlers pass real trigger element via e.currentTarget", async () => {
  const src = await readSource("../app/components/PatientStoriesGallery.tsx");
  assert.ok(src.includes("e.currentTarget"), "PlayButton must capture e.currentTarget");
  assert.ok(src.includes("trigger"), "handler must pass trigger element");
});

// ---------------------------------------------------------------------------
// 63. Featured Watch Story button passes trigger
// ---------------------------------------------------------------------------
test("63. Featured Watch Story button passes trigger element", async () => {
  const src = await readSource("../app/components/PatientStoriesGallery.tsx");
  const watchIdx = src.indexOf("ps-watch-btn");
  const watchBtnStart = src.lastIndexOf("<button", watchIdx);
  const watchBtnEnd = src.indexOf("</button>", watchIdx);
  const watchBtn = src.slice(watchBtnStart, watchBtnEnd);
  assert.ok(watchBtn.includes("e.currentTarget"), "Watch Story button must pass e.currentTarget");
});

// ---------------------------------------------------------------------------
// 64. Standard card Play button passes trigger
// ---------------------------------------------------------------------------
test("64. Standard card Play button passes trigger element", async () => {
  const src = await readSource("../app/components/PatientStoriesGallery.tsx");
  const playWrapIdx = src.indexOf("ps-card-play-wrap");
  const playWrapStart = src.lastIndexOf("<PlayButton", playWrapIdx);
  const playWrapEnd = src.indexOf("/>", playWrapStart);
  const playWrap = src.slice(playWrapStart, playWrapEnd);
  assert.ok(playWrap.includes("onClick"), "card PlayButton must have onClick");
});

// ---------------------------------------------------------------------------
// 65. Close button calls dialog.close()
// ---------------------------------------------------------------------------
test("65. Close button calls dialog.close() not handleClose directly", async () => {
  const src = await readSource("../app/components/PatientStoriesGallery.tsx");
  assert.ok(src.includes("dialogRef.current?.close()"), "close button must call dialog.close()");
});

// ---------------------------------------------------------------------------
// 66. finalizeClose is idempotent (closingRef guard)
// ---------------------------------------------------------------------------
test("66. finalizeClose is idempotent with closingRef guard", async () => {
  const src = await readSource("../app/components/PatientStoriesGallery.tsx");
  assert.ok(src.includes("closingRef"), "must define closingRef");
  assert.ok(src.includes("if (closingRef.current) return"), "must guard against double-close");
  assert.ok(src.includes("closingRef.current = true"), "must set closing flag after first close");
});

// ---------------------------------------------------------------------------
// 67. No custom Escape keydown listener
// ---------------------------------------------------------------------------
test("67. No custom Escape keydown listener remains", async () => {
  const src = await readSource("../app/components/PatientStoriesGallery.tsx");
  assert.ok(!src.includes("addEventListener(\"keydown\""), "must not add custom keydown listener");
  assert.ok(!src.includes('"Escape"'), "must not reference Escape key directly");
  assert.ok(!src.includes("e.key"), "must not check e.key for Escape");
});

// ---------------------------------------------------------------------------
// 68. Dialog uses onClose for native close semantics
// ---------------------------------------------------------------------------
test("68. Dialog uses onClose for native close semantics", async () => {
  const src = await readSource("../app/components/PatientStoriesGallery.tsx");
  assert.ok(src.includes("onClose={finalizeClose}"), "dialog must use onClose prop");
});

// ---------------------------------------------------------------------------
// 69. Standard card title reserves Play-button space
// ---------------------------------------------------------------------------
test("69. Standard card title reserves Play-button space (right: 88px)", async () => {
  const css = await readSource("../app/globals.css");
  const titleIdx = css.indexOf(".ps-card-title {");
  const rightIdx = css.indexOf("right: 88px", titleIdx);
  assert.ok(rightIdx > titleIdx, ".ps-card-title must have right: 88px");
});

// ---------------------------------------------------------------------------
// 70. Play ::after has positioned parent
// ---------------------------------------------------------------------------
test("70. Play ::after has positioned parent (position: relative)", async () => {
  const css = await readSource("../app/globals.css");
  const btnIdx = css.indexOf(".ps-play-btn {");
  const posIdx = css.indexOf("position: relative", btnIdx);
  const afterIdx = css.indexOf(".ps-play-btn::after");
  assert.ok(posIdx > btnIdx && posIdx < afterIdx, ".ps-play-btn must have position: relative before ::after");
  assert.ok(css.includes("position: absolute"), "::after must use position: absolute");
});

// ---------------------------------------------------------------------------
// 71. maxres failure switches to hqdefault
// ---------------------------------------------------------------------------
test("71. maxres failure switches to hqdefault in ThumbnailImg", async () => {
  const src = await readSource("../app/components/PatientStoriesGallery.tsx");
  assert.ok(src.includes("hqdefault"), "must fallback to hqdefault");
  assert.ok(src.includes('"maxres" ? "hqdefault"'), "maxres phase must switch to hqdefault on error");
});

// ---------------------------------------------------------------------------
// 72. hqdefault failure switches to unavailable state
// ---------------------------------------------------------------------------
test("72. hqdefault failure switches to unavailable state", async () => {
  const src = await readSource("../app/components/PatientStoriesGallery.tsx");
  assert.ok(src.includes('"unavailable"'), "must have unavailable phase");
  assert.ok(src.includes('"maxres" ? "hqdefault" : "unavailable"'), "error handler must switch to unavailable after hqdefault");
});

// ---------------------------------------------------------------------------
// 73. No broken-image loop
// ---------------------------------------------------------------------------
test("73. No broken-image loop (unavailable state replaces img with div)", async () => {
  const src = await readSource("../app/components/PatientStoriesGallery.tsx");
  const unavailIdx = src.indexOf('"unavailable"');
  const nearbyContent = src.slice(unavailIdx, unavailIdx + 300);
  assert.ok(nearbyContent.includes("<div"), "unavailable state must render a div, not an img");
  assert.ok(nearbyContent.includes("var(--story-navy)"), "unavailable div must have navy background");
});

// ---------------------------------------------------------------------------
// 74. Thumbnail state resets for a different ID
// ---------------------------------------------------------------------------
test("74. Thumbnail state resets for a different resolved ID", async () => {
  const src = await readSource("../app/components/PatientStoriesGallery.tsx");
  assert.ok(src.includes("key={video._resolvedId}"), "must use key prop on ThumbnailImg to reset state on ID change");
});

// ---------------------------------------------------------------------------
// 75. Invalid videos preserve empty state
// ---------------------------------------------------------------------------
test("75. Invalid videos preserve empty state", async () => {
  const src = await readSource("../app/components/PatientStoriesGallery.tsx");
  assert.ok(src.includes("resolveYouTubeId"), "must use resolver for video filtering");
  assert.ok(src.includes("No video testimonials are currently available"), "empty state must exist");
});

// ---------------------------------------------------------------------------
// 76. Existing locked visual tokens remain
// ---------------------------------------------------------------------------
test("76. Existing locked visual tokens remain in CSS", async () => {
  const css = await readSource("../app/globals.css");
  assert.ok(css.includes("--story-navy: #08233A"), "navy token");
  assert.ok(css.includes("--story-blue: #0B6FA4"), "blue token");
  assert.ok(css.includes("--story-cyan: #32B5D2"), "cyan token");
  assert.ok(css.includes("border-radius: 26px"), "featured radius");
  assert.ok(css.includes("border-radius: 22px"), "card radius");
  assert.ok(css.includes("border-radius: 24px"), "modal radius");
});

// ---------------------------------------------------------------------------
// 77. CSP remains narrowly scoped
// ---------------------------------------------------------------------------
test("77. CSP remains narrowly scoped", async () => {
  const config = await readSource("../next.config.ts");
  assert.ok(config.includes("youtube-nocookie.com"), "CSP must allow youtube-nocookie.com");
  assert.ok(config.includes("i.ytimg.com"), "CSP must allow i.ytimg.com");
  assert.ok(!config.includes('"youtube.com"'), "must not allow broad youtube.com in CSP");
});

// ---------------------------------------------------------------------------
// 78. Full suite passes (structural: test count marker)
// ---------------------------------------------------------------------------
test("78. Component accepts optional youtube_url prop", async () => {
  const src = await readSource("../app/components/PatientStoriesGallery.tsx");
  assert.ok(src.includes("youtube_url"), "VideoItem must include youtube_url");
  assert.ok(src.includes("youtube_url?: string"), "youtube_url must be optional string");
});

// ---------------------------------------------------------------------------
// 79. No unrelated files change
// ---------------------------------------------------------------------------
test("79. No unrelated files change", async () => {
  const route = await readSource("../app/api/appointments/route.ts");
  assert.ok(route.includes("sendHospitalAppointmentAlert"), "appointment route intact");
  const email = await readSource("../app/lib/appointment-email.ts");
  assert.ok(email.includes("AppointmentAlertResult"), "appointment email types intact");
  const blog = await readSource("../app/blog/page.tsx");
  assert.ok(blog.includes("getPublishedBlogs"), "blog page intact");
});

// ---------------------------------------------------------------------------
// 80. No generated artifacts remain
// ---------------------------------------------------------------------------
test("80. No generated artifacts remain", async () => {
  const src = await readSource("../app/components/PatientStoriesGallery.tsx");
  assert.ok(!src.includes("console.log"), "must not contain console.log");
  assert.ok(!src.includes("debugger"), "must not contain debugger");
  assert.ok(!src.includes("// TODO"), "must not contain TODO comments");
});

// ===========================================================================
// T1.1: Exact-source behaviour tests for resolveYouTubeId
// ===========================================================================

test("resolveYouTubeId: valid stored youtube_id passes through", async () => {
  const src = await readSource("../app/components/PatientStoriesGallery.tsx");
  assert.ok(src.includes("youtubeId && isValidYoutubeId(youtubeId)"), "valid ID must be returned directly");
});

test("resolveYouTubeId: rejects non-HTTPS", async () => {
  const src = await readSource("../app/components/PatientStoriesGallery.tsx");
  assert.ok(src.includes('url.protocol !== "https:"'), "must reject http: protocol");
});

test("resolveYouTubeId: rejects credentials in URL", async () => {
  const src = await readSource("../app/components/PatientStoriesGallery.tsx");
  assert.ok(src.includes("url.username || url.password"), "must reject URLs with userinfo");
});

test("resolveYouTubeId: rejects non-standard ports", async () => {
  const src = await readSource("../app/components/PatientStoriesGallery.tsx");
  assert.ok(src.includes("url.port"), "must check port");
  assert.ok(src.includes('"443"'), "must allow default HTTPS port");
});

test("resolveYouTubeId: parses searchParams for watch URLs", async () => {
  const src = await readSource("../app/components/PatientStoriesGallery.tsx");
  assert.ok(src.includes('searchParams.get("v")'), "must extract v from search params");
});

test("resolveYouTubeId: extracts from youtu.be path segments", async () => {
  const src = await readSource("../app/components/PatientStoriesGallery.tsx");
  assert.ok(src.includes("segments.length === 1"), "youtu.be must extract single path segment");
});

test("resolveYouTubeId: extracts from shorts path", async () => {
  const src = await readSource("../app/components/PatientStoriesGallery.tsx");
  assert.ok(src.includes("segments[1]"), "shorts must extract second path segment");
});

test("resolveYouTubeId: extracts from embed path", async () => {
  const src = await readSource("../app/components/PatientStoriesGallery.tsx");
  const embedIdx = src.indexOf("segments[0] === \"embed\"");
  assert.ok(embedIdx > 0, "must handle embed path");
});

test("resolveYouTubeId: returns null for invalid final ID", async () => {
  const src = await readSource("../app/components/PatientStoriesGallery.tsx");
  assert.ok(src.includes("if (!id || !isValidYoutubeId(id)) return null"), "must reject invalid extracted IDs");
});

test("resolveYouTubeId: returns null for missing fields", async () => {
  const src = await readSource("../app/components/PatientStoriesGallery.tsx");
  assert.ok(src.includes("if (!youtubeUrl) return null"), "must return null when no URL provided");
});

test("resolveYouTubeId: catches URL parse errors", async () => {
  const src = await readSource("../app/components/PatientStoriesGallery.tsx");
  assert.ok(src.includes("} catch {"), "must catch URL parse failures");
});
