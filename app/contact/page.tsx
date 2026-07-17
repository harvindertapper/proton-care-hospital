import type { Metadata } from "next";
import { Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { ContactForm } from "@/app/components/Forms";
import { hospital, SITE_URL } from "@/app/lib/data";
import { EmergencyBand, PageHero, PageShell, SectionHeader } from "@/app/components/SiteShell";

export const metadata: Metadata = {
  title: "Contact",
  description: "Contact Protone Care Hospital in Sector 11, Gurugram by phone, WhatsApp, email, landline, or Google Maps directions.",
  alternates: { canonical: `${SITE_URL}/contact` },
};

export default function ContactPage() {
  return (
    <PageShell>
      <PageHero
        eyebrow="Contact"
        title="Reach Protone Care Hospital"
        body="We are here to assist you. Contact our desk for general queries, OPD schedules, or other support."
      />
      <EmergencyBand />
      <section className="section">
        <div className="container flow-layout">
          <div>
            <SectionHeader eyebrow="Message desk" title="Send a contact message" body="Send us a message using the form below, and our administration team will respond as soon as reasonably practicable." />
            <ContactForm turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY} />
          </div>
          <aside className="contact-card">
            <h3>Hospital contacts</h3>
            <a href={hospital.phoneHref}><Phone size={18} aria-hidden="true" /> {hospital.phone}</a>
            <a href={hospital.landlineHref}><Phone size={18} aria-hidden="true" /> {hospital.landline}</a>
            <a href={hospital.whatsappHref}><MessageCircle size={18} aria-hidden="true" /> WhatsApp {hospital.phone}</a>
            <a href={hospital.emailHref}><Mail size={18} aria-hidden="true" /> {hospital.email}</a>
            <a href={hospital.mapsUrl}><MapPin size={18} aria-hidden="true" /> {hospital.address}</a>
          </aside>
        </div>
      </section>
    </PageShell>
  );
}
