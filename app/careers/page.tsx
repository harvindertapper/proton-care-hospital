import type { Metadata } from "next";
import { BriefcaseBusiness, Mail } from "lucide-react";
import { hospital, SITE_URL } from "@/app/lib/data";
import { getPublishedJobs } from "@/app/lib/public-data";
import { PageHero, PageShell, SectionHeader } from "@/app/components/SiteShell";
import Link from "next/link";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Careers",
  description: "Explore rewarding career opportunities and join our team of medical practitioners and care professionals.",
  alternates: { canonical: `${SITE_URL}/careers` },
};

export default async function CareersPage() {
  const jobs = await getPublishedJobs();
  return (
    <PageShell>
      <PageHero
        eyebrow="Careers"
        title="Join Protone Care Hospital"
        body="Work alongside senior clinical specialists and healthcare leaders in Sector 11, Gurugram."
      />
      <section className="section">
        <div className="container">
          <SectionHeader eyebrow="Open roles" title="Current Career Opportunities" />
          {jobs.length ? (
            <div className="career-grid">
              {jobs.map((job) => (
                <article className="career-card" key={job.slug} style={{ display: "flex", flexDirection: "column" }}>
                  <BriefcaseBusiness size={24} aria-hidden="true" style={{ marginBottom: 16 }} />
                  <Link href={`/careers/${job.slug}`} style={{ flex: 1 }}>
                    <h3 className="transition-colors duration-300 hover:text-teal-600">{job.title}</h3>
                    <p style={{ marginTop: 8 }}>{job.department || "Hospital"} · {job.employment_type || "Role"}</p>
                    <p style={{ marginTop: 12, opacity: 0.8, fontSize: "0.9em" }}>{job.description ? job.description.slice(0, 150) + "..." : "View role details."}</p>
                  </Link>
                  <div style={{ marginTop: 24, display: "flex", gap: 12 }}>
                    <Link href={`/careers/${job.slug}`} className="small-button">
                      View Details
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              Our current job openings will appear here. To apply, please send your CV to <a href={hospital.emailHref}>{hospital.email}</a>.
            </div>
          )}
          <div style={{ marginTop: 40, padding: 20, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 16, fontSize: 13, color: "#475569", lineHeight: 1.6 }}>
            <strong>Recruitment Notice:</strong> CVs submitted through this website or via email will be used strictly for recruitment and evaluation purposes and retained in accordance with our recruitment data-retention policy. Protone Care Hospital Private Limited does not charge candidates any recruitment, processing, or interview fees. Any such solicitation is fraudulent.
          </div>
        </div>
      </section>
    </PageShell>
  );
}
