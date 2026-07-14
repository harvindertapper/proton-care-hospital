import type { Metadata } from "next";
import { BriefcaseBusiness, Mail } from "lucide-react";
import { hospital, SITE_URL } from "@/app/lib/data";
import { getPublishedJobs } from "@/app/lib/public-data";
import { PageHero, PageShell, SectionHeader } from "@/app/components/SiteShell";

export const dynamic = "force-dynamic";

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
                <article className="career-card" key={job.slug}>
                  <BriefcaseBusiness size={24} aria-hidden="true" />
                  <h3>{job.title}</h3>
                  <p>{job.department || "Hospital"} · {job.employment_type || "Role"}</p>
                  <p>{job.description || "Please contact the hospital for role details."}</p>
                  <a href={hospital.emailHref} className="small-button"><Mail size={16} aria-hidden="true" /> Apply by Email</a>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              Our current job openings will appear here. To apply, please send your CV to <a href={hospital.emailHref}>{hospital.email}</a>.
            </div>
          )}
        </div>
      </section>
    </PageShell>
  );
}
