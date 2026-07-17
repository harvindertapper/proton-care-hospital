import type { Metadata } from "next";
import { hospital, SITE_URL } from "@/app/lib/data";
import { PageHero, PageShell, SectionHeader } from "@/app/components/SiteShell";

export const metadata: Metadata = {
  title: "Terms of Use & Medical Disclaimer",
  description: "Website terms, emergency disclaimer, appointment request disclaimer, and insurance/cashless approval disclaimer for Protone Care Hospital.",
  alternates: { canonical: `${SITE_URL}/terms-disclaimer` },
};

export default function TermsDisclaimerPage() {
  return (
    <PageShell>
      <PageHero
        eyebrow="Terms"
        title="Terms of Use & Medical Disclaimer"
        body="Effective Date: July 18, 2026 | Version 1.2"
      />
      <section className="section">
        <div className="container">
          <SectionHeader eyebrow="Important Legal Notice" title="Website Terms and Conditions" />
          
          <div className="space-y-6 text-slate-750 text-sm leading-relaxed" style={{ maxWidth: 800, margin: "0 auto", marginTop: 24 }}>
            
            <section style={{ marginBottom: 24 }}>
              <h2 className="text-xl font-bold text-slate-800 mb-2">1. Legal Entity & Website Operator</h2>
              <p>
                This website is operated by <strong>Protone Care Hospital Private Limited</strong>, located at 1/23 Laxmi Garden, Sector 11, Gurugram (Gurgaon), Haryana 122001. All references to "hospital", "we", "us", or "our" refer to this legal entity.
              </p>
            </section>

            <section style={{ marginBottom: 24 }}>
              <h2 className="text-xl font-bold text-slate-800 mb-2">2. No Doctor–Patient Relationship</h2>
              <p>
                <strong>Using this website, sending a WhatsApp message or submitting an online form does not by itself create a doctor–patient relationship.</strong> Diagnosis and treatment are provided only after an appropriate clinical evaluation by an authorised healthcare professional in person or through an approved clinical consultation.
              </p>
            </section>

            <section style={{ marginBottom: 24 }}>
              <h2 className="text-xl font-bold text-slate-800 mb-2">3. Emergency Care Disclaimer</h2>
              <p>
                This website and its online forms are <strong>NOT</strong> for emergencies. If you are experiencing a life-threatening medical emergency, please call <strong>112</strong> (national emergency hotline) or visit the nearest emergency department immediately. Do not wait for online response or callback.
              </p>
            </section>

            <section style={{ marginBottom: 24 }}>
              <h2 className="text-xl font-bold text-slate-800 mb-2">4. Outpatient Appointment Requests</h2>
              <p>
                Submitting an appointment request form does not guarantee a slot or confirm a scheduled time. All online submissions are requests only. Final appointment times, doctor availability, and schedules must be manually confirmed by our coordination desk by phone.
              </p>
              <p className="mt-2">
                If you miss a confirmed time, our staff will try to offer the next available slot, subject to doctor and department availability.
              </p>
            </section>

            <section style={{ marginBottom: 24 }}>
              <h2 className="text-xl font-bold text-slate-800 mb-2">5. Insurance & TPA Cashless Disclaimers</h2>
              <p>
                Cashless treatment assistance is available for the insurers and TPAs currently listed on our website. Cashless approval is subject to policy terms, exclusions, medical necessity, documentation, and insurer/TPA authorisation. Processing times are estimates provided for convenience and cannot be guaranteed. The hospital does not assume liability for claim rejections or delays by insurers/TPAs.
              </p>
            </section>

            <section style={{ marginBottom: 24 }}>
              <h2 className="text-xl font-bold text-slate-800 mb-2">6. Permitted Website Use & Intellectual Property</h2>
              <p>
                You may access this website solely for personal, non-commercial purposes to learn about our services and request clinical consultations. All content, logo, graphics, design, text, and structure are the intellectual property of Protone Care Hospital Private Limited and protected by copyright and trademark laws.
              </p>
            </section>

            <section style={{ marginBottom: 24 }}>
              <h2 className="text-xl font-bold text-slate-800 mb-2">7. Third-Party Links & WhatsApp Disclaimer</h2>
              <p>
                This website may contain links to third-party sites or external tools (such as WhatsApp). We do not control or endorse the content or privacy policies of third-party platforms. Any data sent over WhatsApp is subject to WhatsApp's own end-to-end encryption protocols and terms of service.
              </p>
            </section>

            <section style={{ marginBottom: 24 }}>
              <h2 className="text-xl font-bold text-slate-800 mb-2">8. Website Availability & Liability</h2>
              <p>
                We try to maintain accurate information on this website, but we make no warranties regarding website uptime, error corrections, or absolute accuracy of web content. Nothing in these terms excludes liability or statutory consumer rights that cannot legally be excluded under applicable Indian laws, including the Consumer Protection Act, 2019.
              </p>
            </section>

            <section style={{ marginBottom: 24 }}>
              <h2 className="text-xl font-bold text-slate-800 mb-2">9. Governing Law & Jurisdiction</h2>
              <p>
                These terms are governed by the laws of India. Any disputes arising out of the use of this website shall be subject to the exclusive jurisdiction of the courts in Gurugram, Haryana.
              </p>
            </section>

            <section style={{ marginBottom: 24 }} className="p-4 bg-slate-100 rounded-xl border border-slate-200">
              <h2 className="text-lg font-bold text-slate-800 mb-1">10. Grievance Redressal Officer</h2>
              <p className="text-xs">
                In compliance with the Information Technology Act, 2000 and Digital Personal Data Protection (DPDP) standards, the Grievance Officer details are:
              </p>
              <ul className="mt-2 space-y-1 text-xs text-slate-700">
                <li><strong>Name:</strong> Mr. Harvinder Singh</li>
                <li><strong>Designation:</strong> Grievance Officer, Protone Care Hospital</li>
                <li><strong>Address:</strong> 1/23 Laxmi Garden, Sector 11, Gurugram, Haryana 122001</li>
                <li><strong>Email:</strong> protonecare@gmail.com (Mark subject: "Grievance Redressal")</li>
                <li><strong>Response Timeframe:</strong> Grievances will be acknowledged within 36 hours and resolved within 30 days.</li>
              </ul>
            </section>

          </div>
        </div>
      </section>
    </PageShell>
  );
}
