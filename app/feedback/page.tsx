import type { Metadata } from "next";
import { FeedbackForm } from "@/app/components/Forms";
import { hospital, SITE_URL } from "@/app/lib/data";
import { PageHero, PageShell, SectionHeader } from "@/app/components/SiteShell";

export const metadata: Metadata = {
  title: "Patient Feedback",
  description: "Submit patient feedback to Protone Care Hospital after SMS OTP phone verification and consent.",
  alternates: { canonical: `${SITE_URL}/feedback` },
};

export default function FeedbackPage() {
  return (
    <PageShell>
      <PageHero
        eyebrow="Feedback"
        title="Share patient feedback after phone verification"
        body="Feedback is reviewed by the hospital before any public display. Patient privacy and consent are required."
      />
      <section className="section">
        <div className="container flow-layout">
          <div>
            <SectionHeader
              eyebrow="Verified feedback"
              title="Tell the hospital team about your experience"
              body="The form uses phone OTP, consent, Turnstile, honeypot, and server-side rate limits."
            />
            <FeedbackForm turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY} />
          </div>
          <aside className="contact-card">
            <h3>Direct contact</h3>
            <a href={hospital.phoneHref}>Call {hospital.phone}</a>
            <a href={hospital.whatsappHref}>WhatsApp desk</a>
            <a href={hospital.emailHref}>{hospital.email}</a>
          </aside>
        </div>
      </section>
    </PageShell>
  );
}
