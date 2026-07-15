import type { Metadata } from "next";
import { PageShell } from "@/app/components/SiteShell";
import StatusClient from "./StatusClient";

export const metadata: Metadata = {
  title: "Track Appointment Status | Protone Care Hospital",
  description: "Check the real-time status of your outpatient consultation request.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function AppointmentStatusPage() {
  return (
    <PageShell>
      <div className="section" style={{ minHeight: "80vh", background: "var(--soft)" }}>
        <div className="container" style={{ maxWidth: 640 }}>
          <StatusClient />
        </div>
      </div>
    </PageShell>
  );
}
