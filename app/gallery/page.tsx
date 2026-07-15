import type { Metadata } from "next";
import { SITE_URL } from "@/app/lib/data";
import { PageHero, PageShell, PrimaryActions, Breadcrumbs } from "@/app/components/SiteShell";
import GalleryClient from "./GalleryClient";

export const metadata: Metadata = {
  title: "Media Gallery & Medical Facilities | Protone Care Hospital",
  description: "Take a virtual tour of Protone Care Hospital's advanced clinical facilities, patient rooms, and state-of-the-art diagnostics infrastructure in Gurugram.",
  alternates: {
    canonical: `${SITE_URL}/gallery`,
  },
};

export default function GalleryPage() {
  return (
    <PageShell>
      <PageHero
        eyebrow="Media Gallery"
        title="Inside Protone Care Hospital"
        body="Explore our state-of-the-art facilities, advanced medical systems, operation theatres, and diagnostics infrastructure."
      >
        <PrimaryActions />
      </PageHero>
      <Breadcrumbs paths={[{ label: "Gallery" }]} />
      <GalleryClient />
    </PageShell>
  );
}
