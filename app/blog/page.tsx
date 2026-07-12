import type { Metadata } from "next";
import { Newspaper } from "lucide-react";
import { SITE_URL } from "@/app/lib/data";
import { getPublishedBlogs } from "@/app/lib/public-data";
import { PageHero, PageShell, SectionHeader } from "@/app/components/SiteShell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Blog",
  description: "Approved Protone Care Hospital blog posts and patient information updates.",
  alternates: { canonical: `${SITE_URL}/blog` },
};

export default async function BlogPage() {
  const blogs = await getPublishedBlogs();
  return (
    <PageShell>
      <PageHero
        eyebrow="Blog"
        title="Hospital updates and patient information"
        body="Blog posts are published from the admin panel after approval."
      />
      <section className="section">
        <div className="container">
          <SectionHeader eyebrow="Published posts" title="Approved articles" />
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
            <div className="empty-state">Approved blog posts will appear here after super admin review.</div>
          )}
        </div>
      </section>
    </PageShell>
  );
}
