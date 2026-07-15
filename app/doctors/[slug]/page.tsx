import { notFound } from "next/navigation";
import { type Metadata } from "next";
import { departments, SITE_URL, hospital } from "@/app/lib/data";
import { PageShell } from "@/app/components/SiteShell";
import { User, GraduationCap, BriefcaseMedical } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { getDoctorBySlug } from "@/app/lib/public-data";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await params;
  const doctor = await getDoctorBySlug(p.slug);
  if (!doctor) return {};

  return {
    title: `${doctor.name} — ${doctor.speciality} | Protone Care Hospital`,
    description: `Book an appointment with ${doctor.name}, ${doctor.speciality} at Protone Care Hospital, Gurugram.`,
    alternates: {
      canonical: `${SITE_URL}/doctors/${doctor.slug}`,
    },
  };
}

export default async function DoctorPage({ params }: Props) {
  const p = await params;
  const doctor = await getDoctorBySlug(p.slug);
  
  if (!doctor) {
    notFound();
  }

  const department = departments.find(d => d.slug === doctor.departmentSlug);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Physician",
    name: doctor.name,
    medicalSpecialty: doctor.speciality,
    worksFor: {
      "@type": "Hospital",
      name: hospital.name,
      address: hospital.address,
    },
    url: `${SITE_URL}/doctors/${doctor.slug}`,
    ...(doctor.photo && { image: `${SITE_URL}${doctor.photo}` }),
  };

  return (
    <PageShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="section" style={{ minHeight: "70vh", display: "grid", alignItems: "center" }}>
        <div className="container">
          <div style={{ maxWidth: 840, margin: "0 auto", background: "white", padding: 32, borderRadius: 16, boxShadow: "var(--shadow-premium)", border: "1px solid var(--line)" }}>
            <div style={{ display: "flex", gap: 32, flexWrap: "wrap", alignItems: "flex-start" }}>
              {doctor.photo ? (
                <div style={{ flexShrink: 0, width: 140, height: 140, borderRadius: "50%", overflow: "hidden", border: "4px solid var(--soft)", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
                  <Image src={doctor.photo} alt={doctor.name} width={140} height={140} style={{ objectFit: "cover", width: "100%", height: "100%" }} />
                </div>
              ) : (
                <div style={{ flexShrink: 0, width: 140, height: 140, borderRadius: "50%", background: "var(--soft)", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid var(--line)", color: "var(--muted)" }}>
                  <User size={64} />
                </div>
              )}
              
              <div style={{ flex: 1, minWidth: 280 }}>
                <span className="eyebrow">Doctor Profile</span>
                <h1 style={{ fontSize: 32, margin: "0 0 12px", color: "var(--navy)" }}>{doctor.name}</h1>
                
                <div style={{ display: "flex", flexDirection: "column", gap: 8, color: "var(--muted)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <BriefcaseMedical size={18} color="var(--blue)" />
                    <strong>{doctor.speciality}</strong>
                  </div>
                  {doctor.qualification && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <GraduationCap size={18} color="var(--blue)" />
                      <span>{doctor.qualification}</span>
                    </div>
                  )}
                </div>
                
                <div style={{ marginTop: 24, padding: "16px", background: "var(--soft)", borderRadius: 8, border: "1px solid var(--line)" }}>
                  <p style={{ margin: "0 0 12px", fontSize: 15, color: "var(--muted)" }}>Associated Department:</p>
                  {department ? (
                    <Link href={`/departments/${department.slug}`} style={{ fontSize: 18, color: "var(--blue)", fontWeight: 600, display: "inline-block" }}>
                      {department.name}
                    </Link>
                  ) : (
                    <strong>{doctor.departmentSlug}</strong>
                  )}
                </div>

                <div className="action-row" style={{ marginTop: 32 }}>
                  <Link href={`/appointment?dept=${doctor.departmentSlug}`} className="button primary">
                    Request Appointment
                  </Link>
                  <Link href="/departments" className="button subtle">
                    View all departments
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
