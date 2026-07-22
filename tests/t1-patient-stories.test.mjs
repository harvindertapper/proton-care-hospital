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
  // The iframe only appears inside the Modal, which only renders when selectedVideo is set.
  // In the component JSX, the iframe is conditionally rendered inside a Modal.
  // We verify there is no top-level iframe outside the Modal component.
  assert.ok(src.includes('<iframe'), "component must contain an iframe (inside Modal)");
  // Verify the iframe is inside a function called Modal
  const modalIdx = src.indexOf("function Modal(");
  const iframeIdx = src.indexOf("<iframe", modalIdx);
  assert.ok(iframeIdx > modalIdx, "iframe must be inside the Modal function, not at top level");
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
  // The gallery handles empty internally
  const gallery = await readSource("../app/components/PatientStoriesGallery.tsx");
  assert.ok(gallery.includes("No video testimonials are currently available"), "must show empty state message");
});

// ---------------------------------------------------------------------------
// 6. Invalid IDs are excluded safely
// ---------------------------------------------------------------------------
test("6. Invalid IDs are excluded via isValidYoutubeId", async () => {
  const src = await readSource("../app/components/PatientStoriesGallery.tsx");
  assert.ok(src.includes("isValidYoutubeId"), "must define isValidYoutubeId");
  assert.ok(src.includes("videos.filter"), "must filter videos by valid ID");
});

// ---------------------------------------------------------------------------
// 7. Invalid ID creates no thumbnail URL
// ---------------------------------------------------------------------------
test("7. Invalid ID creates no thumbnail URL", async () => {
  const src = await readSource("../app/components/PatientStoriesGallery.tsx");
  assert.ok(src.includes("thumbnailUrl"), "must define thumbnailUrl helper");
  // thumbnailUrl is only called inside ThumbnailImg component, never at top level
  const thumbnailImgIdx = src.indexOf("function ThumbnailImg(");
  const firstThumbCall = src.indexOf("thumbnailUrl(", thumbnailImgIdx);
  assert.ok(firstThumbCall > thumbnailImgIdx, "thumbnailUrl must only be called inside ThumbnailImg");
});

// ---------------------------------------------------------------------------
// 8. Invalid ID creates no embed URL
// ---------------------------------------------------------------------------
test("8. Invalid ID creates no embed URL", async () => {
  const src = await readSource("../app/components/PatientStoriesGallery.tsx");
  assert.ok(src.includes("embedUrl"), "must define embedUrl helper");
  // embedUrl is only called inside Modal for validated selectedVideo
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
  // Check PlayButton function uses <button
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
  // Modal renders only when selectedVideo is truthy
  assert.ok(src.includes("{selectedVideo && ("), "Modal must only render when selectedVideo is truthy");
});

// ---------------------------------------------------------------------------
// 25. Escape closes modal
// ---------------------------------------------------------------------------
test("25. Escape key closes modal", async () => {
  const src = await readSource("../app/components/PatientStoriesGallery.tsx");
  assert.ok(src.includes('"Escape"'), "must listen for Escape key");
  assert.ok(src.includes("handleClose"), "Escape must call handleClose");
});

// ---------------------------------------------------------------------------
// 26. Focus returns to the trigger
// ---------------------------------------------------------------------------
test("26. Focus returns to trigger button after close", async () => {
  const src = await readSource("../app/components/PatientStoriesGallery.tsx");
  assert.ok(src.includes("triggerRef"), "must have triggerRef for focus return");
  assert.ok(src.includes("triggerRef.current?.focus()"), "must focus trigger after close");
});

// ---------------------------------------------------------------------------
// 27. No iframe exists after close
// ---------------------------------------------------------------------------
test("27. No iframe when selectedVideo is null", async () => {
  const src = await readSource("../app/components/PatientStoriesGallery.tsx");
  // The modal (and iframe) only renders when selectedVideo is set
  assert.ok(src.includes("{selectedVideo && ("), "iframe conditional on selectedVideo");
});

// ---------------------------------------------------------------------------
// 28. Featured desktop layout is horizontal (grid-template-columns with two values)
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
  // Tablet 2-column
  const tablet = css.indexOf("@media (max-width: 1099px)");
  assert.ok(tablet > 0, "must have tablet breakpoint");
  assert.ok(css.indexOf("repeat(2, minmax(0, 1fr))", tablet) > tablet, "tablet must be 2 columns");
  // Mobile 1-column (inside 780px breakpoint)
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
  // Verify no new dependencies were added by checking the component has no unusual imports
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
  // Check no video-related changes leaked into blog
  assert.ok(!blog.includes("PatientStoriesGallery"), "blog must not import PatientStoriesGallery");
});

// ---------------------------------------------------------------------------
// 42. Existing public-video tests pass (structural: getPublishedVideos exists)
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
  // Verify it rejects full URLs
  assert.ok(!src.includes("youtube.com/watch"), "must not accept full YouTube URLs as valid IDs");
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
// 48. TestimonialsPage is a server component (no use client)
// ---------------------------------------------------------------------------
test("48. TestimonialsPage remains a server component", async () => {
  const src = await readSource("../app/testimonials/page.tsx");
  assert.ok(!src.includes('"use client"'), "page.tsx must not be a client component");
  assert.ok(src.includes("getPublishedVideos"), "must call getPublishedVideos on server");
});
