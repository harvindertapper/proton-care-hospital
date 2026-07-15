import type { MetadataRoute } from "next";
import { departments, SITE_URL } from "@/app/lib/data";
import { getPublicDoctors, getPublishedBlogs, getPublishedJobs } from "@/app/lib/public-data";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  // Load dynamic items from database (falling back to static sets if unavailable)
  const [doctorsList, blogsList, jobsList] = await Promise.all([
    getPublicDoctors().catch(() => []),
    getPublishedBlogs().catch(() => []),
    getPublishedJobs().catch(() => []),
  ]);

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
    "/faqs",
    ...departments.map((department) => `/departments/${department.slug}`),
    ...doctorsList.map((doctor) => `/doctors/${doctor.slug}`),
    ...blogsList.map((blog) => `/blog/${blog.slug}`),
    ...jobsList.map((job) => `/careers/${job.slug}`),
  ];

  return routes.map((route) => ({
    url: `${SITE_URL}${route}`,
    lastModified: now,
    changeFrequency:
      route.startsWith("/departments") ||
      route.startsWith("/doctors") ||
      route.startsWith("/blog") ||
      route.startsWith("/careers")
        ? "weekly"
        : "monthly",
    priority:
      route === ""
        ? 1.0
        : route.startsWith("/departments") || route.startsWith("/doctors")
          ? 0.85
          : 0.75,
  }));
}
