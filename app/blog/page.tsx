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
        eyebrow="Wellness Hub"
        title="Clinical Updates & Health Articles"
        body="Expert medical insights, healthcare articles, and wellness guidance curated by our senior consultants."
      />
      <section className="section">
        <div className="container">
          <SectionHeader eyebrow="Published posts" title="Our Health Articles & Wellness Tips" />
          {blogs.length ? (
            <div className="blog-grid">
              {blogs.map((blog) => (
                <article className="blog-card" key={blog.slug} style={{ display: "flex", flexDirection: "column" }}>
                  <Newspaper size={24} aria-hidden="true" style={{ marginBottom: 16 }} />
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
