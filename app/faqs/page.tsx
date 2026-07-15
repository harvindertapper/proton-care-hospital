import type { Metadata } from "next";
import { SITE_URL } from "@/app/lib/data";
import { PageHero, PageShell, SectionHeader } from "@/app/components/SiteShell";

export const metadata: Metadata = {
  title: "Frequently Asked Questions",
  description: "Find answers to common questions about appointments, insurance, visiting hours, and facilities at Protone Care Hospital.",
  alternates: { canonical: `${SITE_URL}/faqs` },
};

const faqs = [
  {
    category: "Appointments",
    items: [
      {
        q: "How do I book an appointment?",
        a: "You can book an appointment by visiting our 'Request Appointment' page, calling our front desk, or directly visiting the hospital. We recommend booking online to request your preferred time slot."
      },
      {
        q: "Do I need a referral to see a specialist?",
        a: "No, a referral is not mandatory. You can directly book an appointment with any of our specialists. However, if you are claiming insurance, your provider might require one."
      }
    ]
  },
  {
    category: "Emergency & Visiting",
    items: [
      {
        q: "Are emergency services available 24x7?",
        a: "Yes, our Emergency and Trauma care department operates 24x7, fully equipped with ICU, NICU, and advanced life support systems."
      },
      {
        q: "What are the visiting hours for the wards?",
        a: "General visiting hours are from 10:00 AM to 12:00 PM and 5:00 PM to 7:00 PM. ICU visiting is strictly limited to one attendee at specific brief intervals designated by the doctor."
      }
    ]
  },
  {
    category: "Insurance & Billing",
    items: [
      {
        q: "Do you accept health insurance/TPA?",
        a: "Yes, we are empanelled with most major insurance providers and TPAs. Please visit our TPA page for the full list or contact our billing desk for cashless facility authorization."
      },
      {
        q: "What payment methods are accepted?",
        a: "We accept all major credit/debit cards, UPI, NEFT/RTGS transfers, and cash."
      }
    ]
  }
];

export default function FaqsPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqs.flatMap(category => category.items.map(item => ({
      "@type": "Question",
      "name": item.q,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": item.a
      }
    })))
  };

  return (
    <PageShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <PageHero
        eyebrow="Help Center"
        title="Frequently Asked Questions"
        body="Find answers to the most common questions regarding our hospital, admissions, appointments, and billing."
      />
      <section className="section">
        <div className="container" style={{ maxWidth: 840 }}>
          {faqs.map((category, idx) => (
            <div key={category.category} style={{ marginBottom: 48 }}>
              <h2 style={{ fontSize: 28, color: "var(--navy)", marginBottom: 24, paddingBottom: 12, borderBottom: "1px solid var(--line)" }}>
                {category.category}
              </h2>
              <div style={{ display: "grid", gap: 24 }}>
                {category.items.map((item, itemIdx) => (
                  <div key={itemIdx} style={{ background: "white", padding: 24, borderRadius: 12, boxShadow: "var(--shadow-premium)", border: "1px solid var(--line)" }}>
                    <h3 style={{ margin: "0 0 12px", fontSize: 20, color: "var(--navy)" }}>{item.q}</h3>
                    <p style={{ margin: 0, color: "var(--muted)", lineHeight: 1.6 }}>{item.a}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </PageShell>
  );
}
