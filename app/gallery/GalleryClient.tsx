"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { ArrowLeft, ArrowRight, X, ZoomIn } from "lucide-react";

type GalleryAsset = {
  url: string;
  title: string;
  note: string;
};

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

  useEffect(() => {
    async function fetchGallery() {
      try {
        const res = await fetch("/api/gallery");
        const data = await res.json();
        if (data.success && data.assets && data.assets.length > 0) {
          const formatted = data.assets.map((asset: any) => ({
            url: `/api/media/${asset.r2_key}`,
            title: asset.file_name || "Gallery Asset",
            note: asset.consent_note || "Protone Care Hospital Facility",
          }));
          setAssets(formatted);
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

  function handlePrev() {
    if (activeIndex === null) return;
    setActiveIndex((prev) => (prev === 0 ? assets.length - 1 : (prev ?? 0) - 1));
  }

  function handleNext() {
    if (activeIndex === null) return;
    setActiveIndex((prev) => (prev === assets.length - 1 ? 0 : (prev ?? 0) + 1));
  }

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (activeIndex === null) return;
      if (e.key === "ArrowLeft") handlePrev();
      if (e.key === "ArrowRight") handleNext();
      if (e.key === "Escape") setActiveIndex(null);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeIndex, assets.length]);

  return (
    <section className="py-12 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto px-4">
        <div className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between border-b border-slate-200 pb-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">Our Medical Facilities & Technology</h2>
            <p className="text-slate-600 text-sm mt-1">Take a virtual tour of the clinical environments designed for patient safety and healing.</p>
          </div>
          <div className="mt-4 md:mt-0">
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-teal-50 text-teal-700 border border-teal-200">
              NABH Accredited Standards
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
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            {assets.map((asset, idx) => (
              <article
                key={asset.url + idx}
                className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col justify-between group"
              >
                <div className="relative overflow-hidden rounded-xl h-56 w-full bg-slate-100 mb-4 cursor-pointer" onClick={() => setActiveIndex(idx)}>
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

      {/* Lightbox Modal */}
      {activeIndex !== null && (
        <div
          className="fixed inset-0 bg-slate-950/95 z-[2000] flex flex-col justify-between p-4 md:p-8 animate-fade-in"
          onClick={() => setActiveIndex(null)}
        >
          <div className="flex justify-between items-center text-white w-full max-w-7xl mx-auto z-10">
            <div>
              <h3 className="font-semibold text-lg md:text-xl">{assets[activeIndex].title}</h3>
              <p className="text-slate-400 text-xs md:text-sm mt-0.5">{assets[activeIndex].note}</p>
            </div>
            <button
              onClick={() => setActiveIndex(null)}
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
