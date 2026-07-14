import type { Metadata } from "next";
import { FeedbackForm } from "@/app/components/Forms";
import { hospital, SITE_URL } from "@/app/lib/data";
import { PageHero, PageShell, SectionHeader } from "@/app/components/SiteShell";

export const metadata: Metadata = {
  title: "Patient Feedback",
  description: "Share your experience and feedback with Protone Care Hospital to help us serve you better.",
  alternates: { canonical: `${SITE_URL}/feedback` },
};

export default function FeedbackPage() {
  return (
    <PageShell>
      <PageHero
        eyebrow="Feedback"
        title="Share your feedback with us"
        body="Your experience matters to us. Please share your suggestions or thoughts so we can continue to improve our patient care."
      />
      <section className="section">
        <div className="container flow-layout">
          <div>
            <SectionHeader
              eyebrow="Your Experience"
              title="Tell us about your visit"
              body="We value your feedback. Please take a moment to share your suggestions, compliments, or concerns with our care team."
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
