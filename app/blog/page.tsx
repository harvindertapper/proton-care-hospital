import type { Metadata } from "next";
import { Newspaper } from "lucide-react";
import { SITE_URL } from "@/app/lib/data";
import { getPublishedBlogs } from "@/app/lib/public-data";
import { PageHero, PageShell, SectionHeader } from "@/app/components/SiteShell";

export const dynamic = "force-dynamic";

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
                <article className="blog-card" key={blog.slug}>
                  <Newspaper size={24} aria-hidden="true" />
                  <h3>{blog.title}</h3>
                  <p>{blog.excerpt}</p>
                  {blog.body ? <p>{blog.body.slice(0, 260)}{blog.body.length > 260 ? "..." : ""}</p> : null}
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
