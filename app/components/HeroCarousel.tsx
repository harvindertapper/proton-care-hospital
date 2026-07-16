"use client";

import { useState, useEffect } from "react";
import Image from "next/image";

export function HeroCarousel() {
  const images = [
    "/assets/hospital/front-exterior-hero.webp",
    "/assets/hospital/front-exterior-wide.webp",
  ];
  const [index, setIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false,
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    const listener = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches);
    };
    mediaQuery.addEventListener("change", listener);
    return () => mediaQuery.removeEventListener("change", listener);
  }, []);

  // Handle auto-rotation
  useEffect(() => {
    if (prefersReducedMotion || isPaused) return;

    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % images.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [images.length, prefersReducedMotion, isPaused]);

  return (
    <div
      className="hero-carousel-wrapper"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocus={() => setIsPaused(true)}
      onBlur={() => setIsPaused(false)}
      style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, zIndex: -1, overflow: "hidden" }}
    >
      {images.map((img, idx) => (
        <div
          key={img}
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            opacity: idx === index ? 1 : 0,
            transition: prefersReducedMotion ? "none" : "opacity 1.5s ease-in-out",
          }}
        >
          <Image
            src={img}
            alt="Protone Care Hospital Exterior Front"
            fill
            sizes="100vw"
            priority={idx === 0}
            style={{ objectFit: "cover" }}
            unoptimized // next/image warning bypass for Workers environment
          />
          <div
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              backgroundImage: "linear-gradient(90deg, rgba(8, 37, 61, 0.9) 0%, rgba(8, 37, 61, 0.64) 38%, rgba(8, 37, 61, 0.1) 100%)",
            }}
          />
        </div>
      ))}
    </div>
  );
}
