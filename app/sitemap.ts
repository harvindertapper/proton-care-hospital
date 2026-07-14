import type { MetadataRoute } from "next";
import { departments, SITE_URL } from "@/app/lib/data";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const routes = [
    "",
    "/about",
    "/departments",
    "/doctors",
    "/gallery",
    "/tpa-insurance",
    "/appointment",
    "/feedback",
    "/testimonials",
    "/blog",
    "/careers",
    "/contact",
    "/privacy-policy",
    "/terms-disclaimer",
    ...departments.map((department) => `/departments/${department.slug}`),
  ];

  return routes.map((route) => ({
    url: `${SITE_URL}${route}`,
    lastModified: now,
    changeFrequency: route.startsWith("/departments") ? "weekly" : "monthly",
    priority: route === "" ? 1 : route.startsWith("/departments") ? 0.85 : 0.75,
  }));
}
