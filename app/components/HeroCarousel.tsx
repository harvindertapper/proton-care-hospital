"use client";

import { useState, useEffect } from "react";

export function HeroCarousel() {
  const images = [
    "/assets/hospital/front-exterior-hero.webp",
    "/assets/hospital/front-exterior-wide.webp",
  ];
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % images.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [images.length]);

  return (
    <div className="hero-carousel-wrapper" style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, zIndex: -1, overflow: "hidden" }}>
      {images.map((img, idx) => (
        <div
          key={img}
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            backgroundImage: `linear-gradient(90deg, rgba(8, 37, 61, 0.9) 0%, rgba(8, 37, 61, 0.64) 38%, rgba(8, 37, 61, 0.1) 100%), url(${img})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            opacity: idx === index ? 1 : 0,
            transition: "opacity 1.5s ease-in-out",
          }}
        />
      ))}
    </div>
  );
}
