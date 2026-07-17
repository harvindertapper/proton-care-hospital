import type { Metadata } from "next";
import { hospital, SITE_URL } from "@/app/lib/data";
import { PageHero, PageShell, SectionHeader } from "@/app/components/SiteShell";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Privacy policy for Protone Care Hospital aligned with SPDI Rules and Digital Personal Data Protection (DPDP) frameworks.",
  alternates: { canonical: `${SITE_URL}/privacy-policy` },
};

export default function PrivacyPolicyPage() {
  return (
    <PageShell>
      <PageHero
        eyebrow="Privacy Policy"
        title="Privacy Policy & Data Rights"
        body="Effective Date: July 18, 2026 | Version 1.2"
      />
      <section className="section">
        <div className="container">
          <SectionHeader eyebrow="Compliance & Transparency" title="Information Practices" />
          
          <div className="space-y-6 text-slate-750 text-sm leading-relaxed" style={{ maxWidth: 800, margin: "0 auto", marginTop: 24 }}>
            
            <section style={{ marginBottom: 24 }}>
              <h2 className="text-xl font-bold text-slate-800 mb-2">1. Legal Entity & Scope</h2>
              <p>
                This Privacy Policy describes how <strong>Protone Care Hospital Private Limited</strong> ("we", "us", or "our"), having its registered office at 1/23 Laxmi Garden, Sector 11, Gurugram (Gurgaon), Haryana 122001, collects, handles, stores, and protects personal information through its public website (<a href={SITE_URL}>{SITE_URL}</a>). 
              </p>
              <p className="mt-2 text-amber-800 bg-amber-50 p-3 rounded-lg border border-amber-100">
                <strong>Important Patient Notice:</strong> Please do not submit prescriptions, diagnostic reports or detailed medical records through public website forms. Information voluntarily entered in message or feedback fields may include health-related information and will be handled only for the stated purpose.
              </p>
            </section>

            <section style={{ marginBottom: 24 }}>
              <h2 className="text-xl font-bold text-slate-800 mb-2">2. Nature of Data Collected & Purpose</h2>
              <p>
                Under the Indian Information Technology (Reasonable Security Practices and Procedures and Sensitive Personal Data or Information) Rules, 2011 (SPDI Rules) and the Digital Personal Data Protection (DPDP) framework, we act as a Data Fiduciary. We collect:
              </p>
              <ul className="list-disc pl-5 mt-2 space-y-1">
                <li><strong>Appointment Requests:</strong> Name, phone number, email address, preferred department, date, time, and patient concerns.</li>
                <li><strong>Feedback/Testimonials:</strong> Patient name, rating, clinical experience testimonial, and consent flags.</li>
                <li><strong>Contact Inquiries:</strong> Name, contact details, and the text of your query.</li>
                <li><strong>Technical Logs:</strong> IP address, browser information, cookies and security logs.</li>
              </ul>
              <p className="mt-2">
                <strong>Purpose:</strong> To coordinate outpatient appointments, process feedback, respond to contact inquiries, prevent cyber abuse, and verify mobile numbers via One-Time Passwords (OTP). We do not collect medical records or carry out financial transactions on this public site.
              </p>
            </section>

            <section style={{ marginBottom: 24 }}>
              <h2 className="text-xl font-bold text-slate-800 mb-2">3. Third-Party Processors & Data Transfers</h2>
              <p>
                We use authorised hosting, communication, security and analytics service providers to operate this website, verify contact details, prevent misuse and respond to patient enquiries. These providers process information only for authorised purposes and subject to applicable contractual and legal safeguards.
              </p>
              <p className="mt-2">
                Personal data may be processed by authorised technology service providers in India or other jurisdictions, subject to contractual safeguards and applicable Indian law. We do not sell personal data.
              </p>
            </section>

            <section style={{ marginBottom: 24 }}>
              <h2 className="text-xl font-bold text-slate-800 mb-2">4. Minor Patients</h2>
              <p>
                We do not knowingly collect personal data from individuals under 18 years of age without parental or guardian consent. If a parent or legal guardian submits an appointment request on behalf of a minor, they consent to the processing of the minor's data for scheduling purposes.
              </p>
            </section>

            <section style={{ marginBottom: 24 }}>
              <h2 className="text-xl font-bold text-slate-800 mb-2">5. Data Retention & Deletion Period</h2>
              <p>
                We retain your personal data submitted via website forms only for as long as necessary to fulfill the requested purposes (e.g. confirming appointment requests, resolving inquiries). 
              </p>
              <ul className="list-disc pl-5 mt-2 space-y-1">
                <li><strong>Unconfirmed Appointment Requests:</strong> Retained for a maximum of 90 days.</li>
                <li><strong>Contact Messages & Inquiries:</strong> Retained for up to 180 days for audit and service quality review.</li>
                <li><strong>Approved Testimonials:</strong> Displayed on the website until consent is withdrawn by the user.</li>
              </ul>
            </section>

            <section style={{ marginBottom: 24 }}>
              <h2 className="text-xl font-bold text-slate-800 mb-2">6. Consent Withdrawal, Access & Correction</h2>
              <p>
                You have the right to access, correct, or request the deletion of your personal data held by us. You may also withdraw your consent for processing at any time. To exercise these rights:
              </p>
              <p className="mt-2">
                Send an email to our Grievance Redressal Officer at <strong>protonecare@gmail.com</strong> with the subject line "Data Principal Rights". Upon validation of your identity, we will process your request within 30 days.
              </p>
            </section>

            <section style={{ marginBottom: 24 }}>
              <h2 className="text-xl font-bold text-slate-800 mb-2">7. Data Breach Response</h2>
              <p>
                We use reasonable technical and organisational safeguards designed to protect personal information against unauthorised access, misuse, alteration or loss. In the unlikely event of a data breach, we will notify affected individuals and regulatory authorities in accordance with applicable laws, including the guidelines issued by the Indian Computer Emergency Response Team (CERT-In).
              </p>
            </section>

            <section style={{ marginBottom: 24 }} className="p-4 bg-slate-100 rounded-xl border border-slate-200">
              <h2 className="text-lg font-bold text-slate-800 mb-1">8. Grievance Officer & Contact</h2>
              <p className="text-xs">
                For any complaints or concerns regarding data privacy, please contact our designated Grievance Officer:
              </p>
              <ul className="mt-2 space-y-1 text-xs text-slate-700">
                <li><strong>Name:</strong> Sunil Sharma</li>
                <li><strong>Designation:</strong> Grievance Officer</li>
                <li><strong>Address:</strong> 1/23 Laxmi Garden, Sector 11, Gurugram, Haryana 122001</li>
                <li><strong>Email:</strong> protonecare@gmail.com</li>
                <li><strong>Resolution Time:</strong> Acknowledged within 36 hours and resolved within 30 days.</li>
              </ul>
            </section>

          </div>
        </div>
      </section>
    </PageShell>
  );
}
