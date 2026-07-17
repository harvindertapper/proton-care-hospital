import type { Metadata } from "next";
import { MessageCircle, Phone } from "lucide-react";
import { hospital, SITE_URL, tpaPanels } from "@/app/lib/data";
import { TpaDirectory } from "@/app/components/Directories";
import { PageHero, PageShell, SectionHeader, Breadcrumbs } from "@/app/components/SiteShell";

export const metadata: Metadata = {
  title: "TPA & Insurance Panels",
  description: "Search Protone Care Hospital's confirmed TPA and insurance panel list with cashless assistance contact links.",
  alternates: { canonical: `${SITE_URL}/tpa-insurance` },
};

export default function TpaInsurancePage() {
  return (
    <PageShell>
      <PageHero
        eyebrow="TPA / Insurance"
        title="Cashless assistance and supported panel list"
        body="Search our list of supported TPA and insurance panels. Please contact our desk for documentation requirements and pre-authorization support."
      >
        <div className="action-row">
          <a className="button primary" href={hospital.phoneHref}><Phone size={18} aria-hidden="true" /> Cashless Assistance</a>
          <a className="button secondary" href={hospital.whatsappHref}><MessageCircle size={18} aria-hidden="true" /> WhatsApp Desk</a>
        </div>
      </PageHero>
      <Breadcrumbs paths={[{ label: "TPA & Insurance" }]} />
      <section className="section">
        <div className="container">
          <SectionHeader
            eyebrow={`${tpaPanels.length} listed insurance/TPA panels — last verified on July 2026. Empanelment and cashless availability are subject to confirmation.`}
            title="Search TPA / Insurance Support"
            body="Cashless treatment assistance is available for the insurers and TPAs currently listed on this page. Cashless approval is subject to policy terms, exclusions, medical necessity, documentation and insurer/TPA authorisation. Processing times are estimates and cannot be guaranteed."
          />
          <TpaDirectory panels={tpaPanels} />
        </div>
      </section>
    </PageShell>
  );
}
