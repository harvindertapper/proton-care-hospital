import type { Metadata } from "next";
import { hospital, SITE_URL } from "@/app/lib/data";
import { PageHero, PageShell, SectionHeader } from "@/app/components/SiteShell";

export const metadata: Metadata = {
  title: "Terms & Medical Disclaimer",
  description: "Website terms, emergency disclaimer, appointment request disclaimer, and insurance/cashless approval disclaimer for Protone Care Hospital.",
  alternates: { canonical: `${SITE_URL}/terms-disclaimer` },
};

export default function TermsDisclaimerPage() {
  return (
    <PageShell>
      <PageHero
        eyebrow="Terms"
        title="Medical and website disclaimer"
        body="Online information and requests support patient access but do not replace emergency care or professional medical advice."
      />
      <section className="section">
        <div className="container">
          <SectionHeader eyebrow="Important" title="Read before using online forms" />
          <div className="policy-grid">
            <article className="policy-card">
              <h3>Emergency care</h3>
              <p>For emergencies, call <a href={hospital.phoneHref}>{hospital.phone}</a> or visit {hospital.name} directly. Do not wait for an online appointment response.</p>
            </article>
            <article className="policy-card">
              <h3>Appointment requests</h3>
              <p>Submitting an appointment form creates a request only. Final appointment availability is confirmed manually by hospital staff.</p>
            </article>
            <article className="policy-card">
              <h3>Medical information</h3>
              <p>Website content is general information and should not be treated as diagnosis, treatment, or emergency advice.</p>
            </article>
            <article className="policy-card">
              <h3>TPA / insurance</h3>
              <p>Cashless approval is subject to policy terms, insurer/TPA approval, and hospital documentation.</p>
            </article>
            <article className="policy-card">
              <h3>Public content</h3>
              <p>Doctor profiles, jobs, blogs, feedback, and patient videos are published only through approved admin workflows.</p>
            </article>
            <article className="policy-card">
              <h3>Contact</h3>
              <p>Email <a href={hospital.emailHref}>{hospital.email}</a> or call <a href={hospital.phoneHref}>{hospital.phone}</a> for support.</p>
            </article>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
