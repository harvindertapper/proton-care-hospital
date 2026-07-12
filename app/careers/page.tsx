import type { Metadata } from "next";
import { BriefcaseBusiness, Mail } from "lucide-react";
import { hospital, SITE_URL } from "@/app/lib/data";
import { getPublishedJobs } from "@/app/lib/public-data";
import { PageHero, PageShell, SectionHeader } from "@/app/components/SiteShell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Careers",
  description: "Approved job openings at Protone Care Hospital. Apply through the confirmed hospital email contact.",
  alternates: { canonical: `${SITE_URL}/careers` },
};

export default async function CareersPage() {
  const jobs = await getPublishedJobs();
  return (
    <PageShell>
      <PageHero
        eyebrow="Careers"
        title="Join Protone Care Hospital"
        body="Open roles are controlled from the admin panel and published after approval."
      />
      <section className="section">
        <div className="container">
          <SectionHeader eyebrow="Open roles" title="Approved job posts" />
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
              Approved career openings will appear here. For current opportunities, email <a href={hospital.emailHref}>{hospital.email}</a>.
            </div>
          )}
        </div>
      </section>
    </PageShell>
  );
}
