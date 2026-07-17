import { notFound } from "next/navigation";
import { type Metadata } from "next";
import { hospital, SITE_URL } from "@/app/lib/data";
import { getJobBySlug } from "@/app/lib/public-data";
import { PageShell } from "@/app/components/SiteShell";
import Link from "next/link";
import { ArrowLeft, BriefcaseBusiness, Mail, MapPin } from "lucide-react";

export const revalidate = 300;

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await params;
  const job = await getJobBySlug(p.slug);
  if (!job) return {};

  return {
    title: `${job.title} | Careers at Protone Care Hospital`,
    description: `Join Protone Care Hospital as a ${job.title}. ${job.department ? `Department: ${job.department}` : ''}`,
    alternates: {
      canonical: `${SITE_URL}/careers/${job.slug}`,
    },
  };
}

export default async function CareerDetailPage({ params }: Props) {
  const p = await params;
  const job = await getJobBySlug(p.slug);
  
  if (!job) {
    notFound();
  }

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: job.title,
    description: job.description || `Join Protone Care Hospital as a ${job.title}.`,
    employmentType: job.employment_type?.toUpperCase() || "FULL_TIME",
    hiringOrganization: {
      "@type": "Organization",
      name: hospital.name,
      sameAs: SITE_URL,
      logo: `${SITE_URL}/assets/pch-logo.png`
    },
    jobLocation: {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        streetAddress: hospital.address,
        addressLocality: "Gurugram",
        addressRegion: "Haryana",
        addressCountry: "IN"
      }
    }
  };

  const applySubject = encodeURIComponent(`Application for ${job.title}`);
  const applyBody = encodeURIComponent(`Hi HR Team,\n\nI am interested in applying for the ${job.title} position at Protone Care Hospital. Please find my details and CV attached.\n\nThanks,\n[Your Name]`);

  return (
    <PageShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="section" style={{ minHeight: "70vh" }}>
        <div className="container" style={{ maxWidth: 840 }}>
          <Link href="/careers" style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "var(--blue)", fontWeight: 600, marginBottom: 32 }}>
            <ArrowLeft size={18} /> Back to Careers
          </Link>
          
          <div style={{ background: "white", padding: 48, borderRadius: 16, boxShadow: "var(--shadow-premium)", border: "1px solid var(--line)" }}>
            <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
              <span className="eyebrow" style={{ margin: 0 }}>{job.department || "Hospital"}</span>
              <span style={{ color: "var(--line)" }}>|</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase" }}>
                {job.employment_type || "Role"}
              </span>
            </div>
            
            <h1 style={{ fontSize: "clamp(32px, 5vw, 42px)", color: "var(--navy)", lineHeight: 1.1, marginBottom: 24 }}>
              {job.title}
            </h1>
            
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 32, paddingBottom: 32, borderBottom: "1px solid var(--line)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--muted)" }}>
                <MapPin size={18} />
                <span>Gurugram, Haryana (On-site)</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--muted)" }}>
                <BriefcaseBusiness size={18} />
                <span>{job.employment_type || "Full-time"}</span>
              </div>
            </div>

            <div style={{ fontSize: 17, lineHeight: 1.8, color: "var(--ink)", whiteSpace: "pre-wrap", marginBottom: 48 }}>
              {job.description || "Detailed role description is available upon contact. Please reach out to our HR department for more information about this position."}
            </div>

            <div style={{ padding: 24, background: "var(--soft)", borderRadius: 12, border: "1px solid var(--line)", display: "flex", flexWrap: "wrap", gap: 24, alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <h3 style={{ margin: "0 0 8px", fontSize: 20 }}>Interested in this role?</h3>
                <p style={{ margin: 0, color: "var(--muted)" }}>Email your CV to our HR department.</p>
              </div>
              <a href={`mailto:${hospital.email}?subject=${applySubject}&body=${applyBody}`} className="button primary">
                <Mail size={18} aria-hidden="true" /> Apply via Email
              </a>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
