import type { Metadata } from "next";
import { hospital, SITE_URL } from "@/app/lib/data";
import { PageHero, PageShell, SectionHeader } from "@/app/components/SiteShell";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "DPDP-aligned privacy policy for Protone Care Hospital website forms, appointment requests, OTP verification, feedback, and contact messages.",
  alternates: { canonical: `${SITE_URL}/privacy-policy` },
};

export default function PrivacyPolicyPage() {
  return (
    <PageShell>
      <PageHero
        eyebrow="Privacy"
        title="Privacy policy for website requests"
        body="This policy covers website appointment requests, feedback, contact messages, OTP verification, and admin-managed public content."
      />
      <section className="section">
        <div className="container">
          <SectionHeader eyebrow="DPDP-aligned" title="Minimum data, consent, and clear purpose" />
          <div className="policy-grid">
            <article className="policy-card">
              <h3>Data collected</h3>
              <p>Appointment, feedback, and contact forms collect only details needed to respond: name, phone, email, department preference, preferred date/time, message, consent, OTP status, IP rate-limit metadata, and timestamps.</p>
            </article>
            <article className="policy-card">
              <h3>Data not collected</h3>
              <p>The public website does not ask for Aadhaar, prescriptions, reports, payments, insurance documents, or medical-record uploads.</p>
            </article>
            <article className="policy-card">
              <h3>Consent</h3>
              <p>Forms include explicit consent before submission. Feedback and testimonials require approval before public display.</p>
            </article>
            <article className="policy-card">
              <h3>OTP and security</h3>
              <p>OTP is used to verify phone numbers for appointment and feedback forms. OTP, forms, admin login, and mutations are rate-limited.</p>
            </article>
            <article className="policy-card">
              <h3>Sharing</h3>
              <p>Contact details are used by {hospital.name} to respond to patient requests. Public testimonials or videos are shown only after approval and consent.</p>
            </article>
            <article className="policy-card">
              <h3>Contact for privacy</h3>
              <p>For privacy requests, email <a href={hospital.emailHref}>{hospital.email}</a> or call <a href={hospital.phoneHref}>{hospital.phone}</a>.</p>
            </article>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
