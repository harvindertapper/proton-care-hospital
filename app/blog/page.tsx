import type { Metadata } from "next";
import { Newspaper } from "lucide-react";
import { SITE_URL } from "@/app/lib/data";
import { getPublishedBlogs } from "@/app/lib/public-data";
import Link from "next/link";
import { PageHero, PageShell, SectionHeader } from "@/app/components/SiteShell";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Blog & Wellness Hub",
  description: "Read the latest health articles, medical news, and patient wellness tips from Protone Care Hospital.",
  alternates: { canonical: `${SITE_URL}/blog` },
};

export default async function BlogPage() {
  const blogs = await getPublishedBlogs();
  return (
    <PageShell>
      <PageHero
        eyebrow="Patient Portal"
        title="Hospital Guides & Patient Information"
        body="Find patient guides, appointment instructions, and TPA billing information from Protone Care Hospital."
      />
      <section className="section">
        <div className="container">
          <SectionHeader eyebrow="Information Guides" title="Patient Information & Guides" />
          {blogs.length ? (
            <div className="blog-grid">
              {blogs.map((blog) => (
                <article className="blog-card" key={blog.slug} style={{ display: "flex", flexDirection: "column" }}>
                  {blog.coverMediaUrl ? (
                    <img
                      src={blog.coverMediaUrl}
                      alt={blog.coverAltText || blog.title}
                      width={800}
                      height={180}
                      style={{ width: "100%", height: 180, objectFit: "cover", borderRadius: 8, marginBottom: 16 }}
                    />
                  ) : (
                    <Newspaper size={24} aria-hidden="true" style={{ marginBottom: 16 }} />
                  )}
                  <Link href={`/blog/${blog.slug}`} style={{ flex: 1 }}>
                    <h3 className="transition-colors duration-300 hover:text-teal-600">{blog.title}</h3>
                    <p style={{ marginTop: 8 }}>{blog.excerpt}</p>
                    {blog.body && <p style={{ marginTop: 12, opacity: 0.8, fontSize: "0.9em" }}>{blog.body.slice(0, 160)}...</p>}
                  </Link>
                  <div style={{ marginTop: 24 }}>
                    <Link href={`/blog/${blog.slug}`} className="small-button">
                      Read Article
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">Check back soon for our latest clinical articles and wellness updates.</div>
          )}
        </div>
      </section>
    </PageShell>
  );
}
