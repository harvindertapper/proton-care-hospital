"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { CalendarDays, Search, ShieldCheck, UserRound, HeartPulse, Activity, FlaskConical, Bed } from "lucide-react";
import type { Department, Doctor } from "@/app/lib/data";

type TpaPanel = { id: number; name: string; logo: string };

function initials(name: string) {
  return name
    .replace(/^dr\.?\s*/i, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function DoctorDirectory({
  doctors,
  departments,
}: {
  doctors: Doctor[];
  departments: Department[];
}) {
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("all");
  const departmentMap = new Map(departments.map((item) => [item.slug, item]));
  const filtered = doctors.filter((doctor) => {
    const dept = departmentMap.get(doctor.departmentSlug);
    const haystack = `${doctor.name} ${doctor.speciality} ${doctor.qualification || ""} ${dept?.name || ""}`.toLowerCase();
    return (department === "all" || doctor.departmentSlug === department) && haystack.includes(query.toLowerCase());
  });

  return (
    <div className="directory-stack">
      <div className="filter-bar">
        <label className="search-field">
          <Search size={18} aria-hidden="true" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search doctor, speciality, qualification" />
        </label>
        <select value={department} onChange={(event) => setDepartment(event.target.value)} aria-label="Filter doctors by department">
          <option value="all">All departments</option>
          {departments.map((item) => (
            <option value={item.slug} key={item.slug}>
              {item.name}
            </option>
          ))}
        </select>
      </div>

      <div className="doctor-grid">
        {filtered.map((doctor) => {
          const dept = departmentMap.get(doctor.departmentSlug);
          return (
            <article className="doctor-card transition-all duration-300 hover:-translate-y-1.5 hover:shadow-md hover:border-teal-500/40 group cursor-pointer" key={doctor.slug}>
              <Link href={`/doctors/${doctor.slug}`} className="doctor-photo overflow-hidden block">
                {doctor.photo ? (
                  <img src={doctor.photo} alt={`${doctor.name}, ${doctor.speciality} at Protone Care Hospital`} className="transition-transform duration-500 group-hover:scale-105" />
                ) : (
                  <div className="doctor-placeholder" aria-label={`${doctor.name} photo placeholder`}>
                    <UserRound size={30} aria-hidden="true" className="transition-transform duration-300 group-hover:scale-110" />
                    <span>{initials(doctor.name)}</span>
                  </div>
                )}
              </Link>
              <div className="doctor-body transition-colors duration-300 group-hover:bg-slate-50/50">
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-teal-50 text-teal-700 transition-all duration-300 group-hover:bg-teal-100 group-hover:text-teal-800 shadow-sm border border-teal-100/50">
                  {dept?.name || "Department"}
                </span>
                <Link href={`/doctors/${doctor.slug}`}>
                  <h3 className="transition-colors duration-300 group-hover:text-teal-600">{doctor.name}</h3>
                </Link>
                <p>{doctor.speciality}</p>
                {doctor.qualification ? <strong>{doctor.qualification}</strong> : null}
                <Link href={`/appointment?dept=${doctor.departmentSlug}`} className="small-button transition-transform duration-300 hover:scale-105">
                  <CalendarDays size={16} aria-hidden="true" /> Request Department Slot
                </Link>
              </div>
            </article>
          );
        })}
      </div>

      {filtered.length === 0 ? <p className="empty-state">No doctors match this filter.</p> : null}
    </div>
  );
}

export function TpaDirectory({ panels }: { panels: TpaPanel[] }) {
  const [query, setQuery] = useState("");
  const filtered = panels.filter((panel) => panel.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="directory-stack">
      <div className="filter-bar single">
        <label className="search-field">
          <Search size={18} aria-hidden="true" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search insurance / TPA panel" />
        </label>
      </div>

      <div className="tpa-grid">
        {filtered.map((panel) => (
          <article className="tpa-card" key={panel.id}>
            <span>{panel.id.toString().padStart(2, "0")}</span>
            <img src={panel.logo} alt={`${panel.name} logo`} />
            <strong>{panel.name}</strong>
          </article>
        ))}
      </div>
      <div className="disclaimer-card">
        <ShieldCheck size={20} aria-hidden="true" />
        <p>Cashless approval is subject to policy terms, insurer/TPA approval, and hospital documentation.</p>
      </div>
    </div>
  );
}

export function FacilitiesDirectory() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 600);
    return () => clearTimeout(timer);
  }, []);

  const assets = [
    {
      title: "ICU & Critical Care Beds",
      description: "Equipped with high-end ventilators, multi-channel patient monitors, and dedicated central monitoring systems.",
      count: "15 Critical Care Beds",
      status: "Fully Operational",
      icon: HeartPulse,
    },
    {
      title: "Modular Operation Theatres",
      description: "Laminar airflow, sterile environment filters, and integrated surgical tables designed for complex procedures.",
      count: "3 Modular OTs",
      status: "Sterile Zone Active",
      icon: Activity,
    },
    {
      title: "Advanced Diagnostic Labs",
      description: "Fully automated clinical biochemistry, haematology, and pathology labs with rapid turnaround times.",
      count: "24/7 Service",
      status: "NABL Compliant",
      icon: FlaskConical,
    },
    {
      title: "Inpatient Rooms & Wards",
      description: "Private Deluxe rooms, Semi-Private rooms, and General wards with nurse calling and emergency response systems.",
      count: "50+ Patient Beds",
      status: "Admissions Active",
      icon: Bed,
    },
  ];

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 w-full max-w-7xl mx-auto my-8">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="animate-pulse bg-slate-100 border border-slate-200 rounded-xl p-6 h-64 flex flex-col justify-between">
            <div>
              <div className="h-12 w-12 bg-slate-200 rounded-lg mb-4"></div>
              <div className="h-6 bg-slate-200 rounded-md w-3/4 mb-3"></div>
              <div className="h-4 bg-slate-200 rounded-md w-full mb-2"></div>
              <div className="h-4 bg-slate-200 rounded-md w-5/6"></div>
            </div>
            <div className="h-4 bg-slate-200 rounded-md w-1/2"></div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 w-full max-w-7xl mx-auto my-8">
      {assets.map((asset) => {
        const Icon = asset.icon;
        return (
          <article
            key={asset.title}
            className="flex flex-col justify-between bg-white border border-slate-100 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow duration-300 h-64"
          >
            <div>
              <div className="inline-flex items-center justify-center h-12 w-12 rounded-lg bg-teal-50 text-teal-600 mb-4">
                <Icon size={24} aria-hidden="true" />
              </div>
              <h3 className="text-lg font-semibold text-slate-800 mb-2">{asset.title}</h3>
              <p className="text-sm text-slate-600 line-clamp-3 mb-4">{asset.description}</p>
            </div>
            <div className="flex items-center justify-between border-t border-slate-50 pt-3 mt-auto">
              <span className="text-sm font-medium text-teal-600">{asset.count}</span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700">
                {asset.status}
              </span>
            </div>
          </article>
        );
      })}
    </div>
  );
}
