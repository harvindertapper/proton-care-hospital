import type { Metadata } from "next";
import { FileCheck2, MessageCircle, Phone } from "lucide-react";
import { hospital, SITE_URL, tpaPanels } from "@/app/lib/data";
import { TpaDirectory } from "@/app/components/Directories";
import { PageHero, PageShell, SectionHeader } from "@/app/components/SiteShell";

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
        title="Cashless assistance and confirmed panel list"
        body="Search the client-confirmed TPA and insurance panel list. Please contact the hospital desk for documentation and current approval steps."
      >
        <div className="action-row">
          <a className="button primary" href={hospital.phoneHref}><Phone size={18} aria-hidden="true" /> Cashless Assistance</a>
          <a className="button secondary" href={hospital.whatsappHref}><MessageCircle size={18} aria-hidden="true" /> WhatsApp Desk</a>
        </div>
      </PageHero>
      <section className="section">
        <div className="container">
          <SectionHeader
            eyebrow={`${tpaPanels.length} confirmed panels`}
            title="Search TPA / insurance support"
            body="Do not use old address or phone details from the source banner; all CTAs here use the confirmed hospital contact data."
          />
          <TpaDirectory panels={tpaPanels} />
          <div className="safety-note" style={{ marginTop: 18 }}>
            <FileCheck2 size={20} aria-hidden="true" />
            <p>Cashless approval is subject to policy terms, insurer/TPA approval, and hospital documentation.</p>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
