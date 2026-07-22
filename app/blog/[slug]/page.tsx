import { notFound } from "next/navigation";
import { type Metadata } from "next";
import { SITE_URL } from "@/app/lib/data";
import { getBlogBySlug } from "@/app/lib/public-data";
import { PageShell } from "@/app/components/SiteShell";
import Link from "next/link";
import { CalendarDays, ArrowLeft } from "lucide-react";

export const revalidate = 300;

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await params;
  const blog = await getBlogBySlug(p.slug);
  if (!blog) return {};

  return {
    title: `${blog.title} | Protone Care Hospital Blog`,
    description: blog.excerpt,
    alternates: {
      canonical: `${SITE_URL}/blog/${blog.slug}`,
    },
  };
}

export default async function BlogDetailPage({ params }: Props) {
  const p = await params;
  const blog = await getBlogBySlug(p.slug);
  
  if (!blog) {
    notFound();
  }

  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: blog.title,
    abstract: blog.excerpt,
    datePublished: blog.created_at || new Date().toISOString(),
    publisher: {
      "@type": "Organization",
      name: "Protone Care Hospital",
      logo: {
        "@type": "ImageObject",
        url: `${SITE_URL}/assets/pch-logo.png`
      }
    }
  };

  if (blog.coverMediaUrl) {
    jsonLd.image = blog.coverMediaUrl;
  }

  return (
    <PageShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="section" style={{ minHeight: "70vh" }}>
        <div className="container" style={{ maxWidth: 800 }}>
          <Link href="/blog" style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "var(--blue)", fontWeight: 600, marginBottom: 32 }}>
            <ArrowLeft size={18} /> Back to Blog
          </Link>

          {blog.coverMediaUrl && (
            <img
              src={blog.coverMediaUrl}
              alt={blog.coverAltText || blog.title}
              width={800}
              height={400}
              style={{ width: "100%", maxHeight: 400, objectFit: "cover", borderRadius: 12, marginBottom: 32 }}
            />
          )}
          
          <h1 style={{ fontSize: "clamp(32px, 5vw, 48px)", color: "var(--navy)", lineHeight: 1.1, marginBottom: 16 }}>
            {blog.title}
          </h1>
          
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13, color: "var(--muted)", marginBottom: 32, alignItems: "center" }}>
            {blog.created_at && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <CalendarDays size={16} />
                {new Date(blog.created_at).toLocaleDateString("en-IN", { year: 'numeric', month: 'long', day: 'numeric' })}
              </span>
            )}
            {blog.author && (
              <span>By: <strong>{blog.author}</strong></span>
            )}
            {blog.reviewer && (
              <span style={{ padding: "2px 8px", background: "var(--soft)", border: "1px solid var(--line)", borderRadius: 4 }}>
                Medically Reviewed by: <strong>{blog.reviewer}</strong>
              </span>
            )}
          </div>
          
          <div style={{ fontSize: 20, lineHeight: 1.6, color: "var(--muted)", fontWeight: 500, marginBottom: 48, paddingBottom: 32, borderBottom: "1px solid var(--line)" }}>
            {blog.excerpt}
          </div>

          <div style={{ fontSize: 18, lineHeight: 1.8, color: "var(--ink)", whiteSpace: "pre-wrap" }}>
            {blog.body || "Full article text will appear here."}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
