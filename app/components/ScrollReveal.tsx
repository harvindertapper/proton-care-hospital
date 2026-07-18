"use client";
import { useEffect, useRef, type ReactNode } from "react";

export function ScrollReveal({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Safety net 1: reduced-motion users or browsers without IntersectionObserver
    // get the content revealed immediately, no animation.
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReducedMotion || typeof IntersectionObserver === "undefined") {
      el.classList.add("revealed");
      return;
    }

    // Safety net 2: if the observer never fires, reveal after 1.2s so content is never stuck hidden.
    const fallbackTimer = window.setTimeout(() => {
      el.classList.add("revealed");
    }, 1200);

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("revealed");
          observer.unobserve(el);
          window.clearTimeout(fallbackTimer);
        }
      },
      { threshold: 0.15 }
    );
    observer.observe(el);
    return () => {
      window.clearTimeout(fallbackTimer);
      observer.disconnect();
    };
  }, []);
  return (
    <div ref={ref} className={`scroll-reveal ${className}`}>
      {children}
    </div>
  );
}
