"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { ArrowLeft, ArrowRight, X, ZoomIn } from "lucide-react";

type GalleryAsset = {
  url: string;
  title: string;
  note: string;
};

type ApiGalleryAsset = {
  r2_key: string;
};

type GalleryV2Section = {
  slug: string;
  name: string;
  description: string;
  sortOrder: number;
  items: GalleryV2Item[];
};

type GalleryV2Item = {
  slug: string;
  slotKey: string | null;
  title: string;
  altText: string;
  caption: string;
  width: number | null;
  height: number | null;
  originalUrl: string;
  displayUrl: string;
  thumbnailUrl: string;
};

function isSafeUrl(url: string): boolean {
  if (!url || typeof url !== "string") return false;
  if (url.includes("r2.cloudflarestorage.com")) return false;
  if (/^[a-f0-9-]+$/i.test(url.split("/").pop() ?? "")) return false;
  return url.startsWith("/") || url.startsWith("http://") || url.startsWith("https://");
}

function isSectionArray(val: unknown): val is GalleryV2Section[] {
  if (!Array.isArray(val)) return false;
  return val.every(
    (s): s is GalleryV2Section =>
      typeof s === "object" &&
      s !== null &&
      typeof (s as Record<string, unknown>).slug === "string" &&
      typeof (s as Record<string, unknown>).name === "string" &&
      Array.isArray((s as Record<string, unknown>).items),
  );
}

const presetAssets: GalleryAsset[] = [
  {
    url: "/assets/hospital/front-exterior-hero.webp",
    title: "Hospital Front Facade",
    note: "Front exterior view of Protone Care Hospital in Sector 11, Gurugram.",
  },
  {
    url: "/assets/hospital/front-exterior-wide.webp",
    title: "Hospital Exterior Campus",
    note: "Campus view of the main hospital entrance and parking.",
  },
  {
    url: "/assets/hospital/reception.jpg",
    title: "Reception & Nursing Station",
    note: "Our central reception and nursing desk, welcoming patients with professional care.",
  },
  {
    url: "/assets/hospital/corridor.jpg",
    title: "Outpatient & Inpatient Corridor",
    note: "Clean, modern, and spacious corridors connecting rooms and speciality consultations.",
  },
  {
    url: "/assets/hospital/ward-bed-01.jpg",
    title: "Emergency Observation Bed",
    note: "Fully equipped recovery and observation beds with continuous patient monitoring.",
  },
  {
    url: "/assets/hospital/patient-room-twin.jpg",
    title: "Semi-Private Patient Room",
    note: "Comfortable twin-sharing rooms designed for patient comfort, safety, and recovery.",
  },
  {
    url: "/assets/hospital/patient-room-single.jpg",
    title: "Deluxe Private Suite",
    note: "Single-bed private room equipped with modern amenities including AC, television, and private storage.",
  },
];

export default function GalleryClient() {
  const [assets, setAssets] = useState<GalleryAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [triggerEl, setTriggerEl] = useState<HTMLElement | null>(null);
  const [sections, setSections] = useState<GalleryV2Section[]>([]);
  const [useV2, setUseV2] = useState(false);

  useEffect(() => {
    async function fetchGallery() {
      try {
        const v2Res = await fetch("/api/gallery/v2");
        if (!v2Res.ok) throw new Error("v2 not available");
        const v2Data = (await v2Res.json()) as {
          success?: boolean;
          enabled?: boolean;
          sections?: unknown;
        };

        if (v2Data.success && v2Data.enabled) {
          if (!isSectionArray(v2Data.sections)) throw new Error("malformed v2 body");
          const validatedSections = v2Data.sections.filter((s) =>
            s.items.every(
              (item: GalleryV2Item) =>
                item.displayUrl &&
                isSafeUrl(item.displayUrl) &&
                item.originalUrl &&
                isSafeUrl(item.originalUrl),
            ),
          );
          setSections(validatedSections);
          setUseV2(true);
          const flatAssets: GalleryAsset[] = [];
          for (const section of validatedSections) {
            for (const item of section.items) {
              flatAssets.push({
                url: item.displayUrl || item.originalUrl,
                title: item.title,
                note: item.caption,
              });
            }
          }
          setAssets(flatAssets);
          setLoading(false);
          return;
        }

        if (v2Data.success && v2Data.enabled && Array.isArray(v2Data.sections) && v2Data.sections.length === 0) {
          setSections([]);
          setUseV2(true);
          setAssets([]);
          setLoading(false);
          return;
        }
      } catch {
        // v2 failed, fall through to legacy
      }

      try {
        const res = await fetch("/api/gallery");
        const data = (await res.json()) as { success?: boolean; assets?: ApiGalleryAsset[] };
        if (data.success && data.assets && data.assets.length > 0) {
          const dynamicAssets: GalleryAsset[] = data.assets
            .filter((a) => a.r2_key && !a.r2_key.includes(".."))
            .map((asset: ApiGalleryAsset) => ({
              url: `/api/media/${asset.r2_key}`,
              title: "Hospital Facility",
              note: "Protone Care Hospital Facility",
            }));
          const allUrls = new Set(dynamicAssets.map((a) => a.url));
          const merged = [...dynamicAssets];
          for (const preset of presetAssets) {
            if (!allUrls.has(preset.url)) {
              merged.push(preset);
            }
          }
          setAssets(merged);
        } else {
          setAssets(presetAssets);
        }
      } catch {
        setAssets(presetAssets);
      } finally {
        setLoading(false);
      }
    }
    fetchGallery();
  }, []);

  const handlePrev = useCallback(() => {
    if (activeIndex === null || assets.length === 0) return;
    setActiveIndex((prev) => (prev === 0 ? assets.length - 1 : (prev ?? 0) - 1));
  }, [activeIndex, assets.length]);

  const handleNext = useCallback(() => {
    if (activeIndex === null || assets.length === 0) return;
    setActiveIndex((prev) => (prev === assets.length - 1 ? 0 : (prev ?? 0) + 1));
  }, [activeIndex, assets.length]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (activeIndex === null) return;
      if (e.key === "ArrowLeft") handlePrev();
      if (e.key === "ArrowRight") handleNext();
      if (e.key === "Escape") {
        setActiveIndex(null);
        triggerEl?.focus();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeIndex, triggerEl, handlePrev, handleNext]);

  function buildFlatIndexMap(): Map<GalleryV2Item, number> {
    const map = new Map<GalleryV2Item, number>();
    let idx = 0;
    for (const section of sections) {
      for (const item of section.items) {
        map.set(item, idx);
        idx++;
      }
    }
    return map;
  }

  const flatIndexMap = useV2 ? buildFlatIndexMap() : new Map<GalleryV2Item, number>();

  return (
    <section className="py-12 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto px-4">
        <div className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between border-b border-slate-200 pb-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">Our Medical Facilities & Technology</h2>
            <p className="text-slate-600 text-sm mt-1">View selected photographs of our patient-care areas, operation theatres and diagnostic facilities. Equipment and service availability may change; please contact the hospital for confirmation.</p>
          </div>
          <div className="mt-4 md:mt-0">
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-teal-50 text-teal-700 border border-teal-200">
              Clinical Quality Standards
            </span>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse bg-white border border-slate-200 rounded-2xl p-4 h-80">
                <div className="bg-slate-200 rounded-xl h-56 w-full mb-4"></div>
                <div className="h-5 bg-slate-200 rounded w-3/4 mb-2"></div>
                <div className="h-4 bg-slate-200 rounded w-1/2"></div>
              </div>
            ))}
          </div>
        ) : useV2 ? (
          sections.length > 0 ? (
            sections.map((section) => (
              <div key={section.slug} className="mb-10">
                <h3 className="text-xl font-bold text-slate-800 mb-1">{section.name}</h3>
                {section.description && <p className="text-slate-500 text-sm mb-4">{section.description}</p>}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                  {section.items.map((item) => {
                    const globalIdx = flatIndexMap.get(item) ?? 0;
                    const itemUrl = item.displayUrl || item.originalUrl;
                    return (
                      <article
                        key={`${section.slug}-${item.slug}-${globalIdx}`}
                        className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col justify-between group"
                      >
                        <div
                          id={`thumb-v2-${section.slug}-${item.slug}`}
                          tabIndex={0}
                          role="button"
                          aria-label={`Open lightbox zoom view for ${item.title}`}
                          onClick={() => {
                            setTriggerEl(document.getElementById(`thumb-v2-${section.slug}-${item.slug}`));
                            setActiveIndex(globalIdx);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setTriggerEl(document.getElementById(`thumb-v2-${section.slug}-${item.slug}`));
                              setActiveIndex(globalIdx);
                            }
                          }}
                          className="relative overflow-hidden rounded-xl h-56 w-full bg-slate-100 mb-4 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
                        >
                          <Image
                            src={itemUrl}
                            alt={item.altText || item.title}
                            width={item.width || 400}
                            height={item.height || 300}
                            priority={globalIdx < 3}
                            className="object-cover w-full h-full rounded-xl transition-transform duration-500 group-hover:scale-105"
                            unoptimized
                          />
                          <div className="absolute inset-0 bg-slate-900/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                            <div className="bg-white/95 p-3 rounded-full shadow-lg text-slate-800 transform scale-90 group-hover:scale-100 transition-transform duration-300">
                              <ZoomIn size={20} />
                            </div>
                          </div>
                        </div>
                        <div>
                          <h3 className="font-semibold text-slate-800 text-lg mb-1">{item.title}</h3>
                          <p className="text-slate-500 text-sm line-clamp-2">{item.caption}</p>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-16 text-slate-400">
              <p className="text-lg font-medium">Gallery Coming Soon</p>
              <p className="text-sm mt-1">Content is being curated. Please check back later.</p>
            </div>
          )
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            {assets.map((asset, idx) => (
              <article
                key={asset.url + idx}
                className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col justify-between group"
              >
                <div
                  id={`thumb-${idx}`}
                  tabIndex={0}
                  role="button"
                  aria-label={`Open lightbox zoom view for ${asset.title}`}
                  onClick={() => {
                    setTriggerEl(document.getElementById(`thumb-${idx}`));
                    setActiveIndex(idx);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setTriggerEl(document.getElementById(`thumb-${idx}`));
                      setActiveIndex(idx);
                    }
                  }}
                  className="relative overflow-hidden rounded-xl h-56 w-full bg-slate-100 mb-4 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
                >
                  <Image
                    src={asset.url}
                    alt={asset.title}
                    width={400}
                    height={300}
                    priority={idx < 3}
                    className="object-cover w-full h-full rounded-xl transition-transform duration-500 group-hover:scale-105"
                    unoptimized
                  />
                  <div className="absolute inset-0 bg-slate-900/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                    <div className="bg-white/95 p-3 rounded-full shadow-lg text-slate-800 transform scale-90 group-hover:scale-100 transition-transform duration-300">
                      <ZoomIn size={20} />
                    </div>
                  </div>
                </div>
                <div>
                  <h3 className="font-semibold text-slate-800 text-lg mb-1">{asset.title}</h3>
                  <p className="text-slate-500 text-sm line-clamp-2">{asset.note}</p>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {activeIndex !== null && assets.length > 0 && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={assets[activeIndex]?.title ?? "Gallery lightbox"}
          tabIndex={-1}
          ref={(el) => el?.focus()}
          className="fixed inset-0 bg-slate-950/95 z-[2000] flex flex-col justify-between p-4 md:p-8 animate-fade-in outline-none"
          onClick={() => {
            setActiveIndex(null);
            triggerEl?.focus();
          }}
        >
          <div className="flex justify-between items-center text-white w-full max-w-7xl mx-auto z-10">
            <div>
              <h3 className="font-semibold text-lg md:text-xl">{assets[activeIndex].title}</h3>
              <p className="text-slate-400 text-xs md:text-sm mt-0.5">{assets[activeIndex].note}</p>
            </div>
            <button
              onClick={() => {
                setActiveIndex(null);
                triggerEl?.focus();
              }}
              className="p-2 bg-slate-900 hover:bg-slate-800 rounded-full transition-colors text-white cursor-pointer"
              aria-label="Close lightbox"
            >
              <X size={24} />
            </button>
          </div>

          <div className="flex items-center justify-between w-full max-w-7xl mx-auto my-auto relative" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={handlePrev}
              className="p-3 bg-slate-900/80 hover:bg-slate-800/90 rounded-full text-white cursor-pointer select-none transition-colors"
              aria-label="Previous image"
            >
              <ArrowLeft size={24} />
            </button>

            <div className="relative max-h-[70vh] max-w-[85vw] flex items-center justify-center overflow-hidden rounded-xl">
              <Image
                src={assets[activeIndex].url}
                alt={assets[activeIndex].title}
                width={1200}
                height={800}
                className="object-contain rounded-xl max-h-[70vh]"
                unoptimized
              />
            </div>

            <button
              onClick={handleNext}
              className="p-3 bg-slate-900/80 hover:bg-slate-800/90 rounded-full text-white cursor-pointer select-none transition-colors"
              aria-label="Next image"
            >
              <ArrowRight size={24} />
            </button>
          </div>

          <div className="text-center text-slate-400 text-sm font-medium z-10">
            {activeIndex + 1} / {assets.length}
          </div>
        </div>
      )}
    </section>
  );
}
