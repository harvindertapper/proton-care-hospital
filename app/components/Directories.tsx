"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarDays, Search, ShieldCheck, UserRound } from "lucide-react";
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
            <article className="doctor-card" key={doctor.slug}>
              <div className="doctor-photo">
                {doctor.photo ? (
                  <img src={doctor.photo} alt={`${doctor.name}, ${doctor.speciality} at Protone Care Hospital`} />
                ) : (
                  <div className="doctor-placeholder" aria-label={`${doctor.name} photo placeholder`}>
                    <UserRound size={30} aria-hidden="true" />
                    <span>{initials(doctor.name)}</span>
                  </div>
                )}
              </div>
              <div className="doctor-body">
                <span>{dept?.name || "Department"}</span>
                <h3>{doctor.name}</h3>
                <p>{doctor.speciality}</p>
                <strong>{doctor.qualification || "Qualification not provided in source list"}</strong>
                <Link href={`/appointment?dept=${doctor.departmentSlug}`} className="small-button">
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
