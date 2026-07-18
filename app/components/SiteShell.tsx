"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Mail,
  MapPin,
  Menu,
  MessageCircle,
  Phone,
  ShieldCheck,
  ChevronRight,
  Home,
} from "lucide-react";
import { formatWhatsApp, hospital, publicNav } from "@/app/lib/data";

export function Header() {
  useEffect(() => {
    fetch("/api/analytics", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ eventType: "pageview", path: window.location.pathname }),
    }).catch(() => {});
  }, []);

  return (
    <header className="site-header">
      <div className="topbar">
        <a href={hospital.phoneHref} className="topbar-link emergency">
          <Phone size={16} aria-hidden="true" /> {hospital.emergency}: {hospital.phone}
        </a>
        <a href={hospital.mapsUrl} className="topbar-link">
          <MapPin size={16} aria-hidden="true" /> Sector 11, Gurugram
        </a>
        <a href={hospital.emailHref} className="topbar-link">
          <Mail size={16} aria-hidden="true" /> {hospital.email}
        </a>
      </div>
      <div className="nav-shell">
        <Link href="/" className="brand" aria-label="Protone Care Hospital home">
          <img src={hospital.logo} alt="Protone Care Hospital logo" />
          <span>
            <strong>{hospital.name}</strong>
            <small>{hospital.tagline}</small>
          </span>
        </Link>
        <nav className="desktop-nav" aria-label="Main navigation">
          {publicNav.map((item) => (
            <Link href={item.href} key={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
        <details className="mobile-nav">
          <summary aria-label="Open navigation">
            <Menu size={22} aria-hidden="true" />
          </summary>
          <div>
            {publicNav.map((item) => (
              <Link href={item.href} key={item.href}>
                {item.label}
              </Link>
            ))}
          </div>
        </details>
        <Link href="/appointment" className="nav-appointment">
          <CalendarDays size={18} aria-hidden="true" /> Appointment
        </Link>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <div className="footer-grid">
        <div>
          <img src={hospital.logo} alt="Protone Care Hospital logo" className="footer-logo" />
          <p>{hospital.name} provides emergency, OPD/IPD, diagnostics, critical care, and speciality consultation support in Sector 11, Gurugram.</p>
          <p className="fineprint">Online requests are not emergency confirmations. Final availability is confirmed by the hospital team.</p>
        </div>
        <div>
          <h3>Visit</h3>
          <a href={hospital.mapsUrl}>{hospital.address}</a>
          <a href={hospital.mapsUrl}>Open Google Maps</a>
        </div>
        <div>
          <h3>Contact</h3>
          <a href={hospital.phoneHref}>Call {hospital.phone}</a>
          <a href={hospital.landlineHref}>Landline {hospital.landline}</a>
          <a href={hospital.whatsappHref}>WhatsApp {hospital.phone}</a>
          <a href={hospital.emailHref}>{hospital.email}</a>
        </div>
        <div>
          <h3>Care & Info</h3>
          <Link href="/about">About Us</Link>
          <Link href="/departments">Departments</Link>
          <Link href="/doctors">Doctors</Link>
          <Link href="/gallery">Gallery</Link>
          <Link href="/tpa-insurance">TPA / Insurance</Link>
          <Link href="/faqs">FAQs</Link>
          <Link href="/appointment/status">Track Appointment</Link>
          <Link href="/privacy-policy">Privacy Policy</Link>
          <Link href="/terms-disclaimer">Terms & Medical Disclaimer</Link>
        </div>
      </div>
      <div className="footer-bottom">
        <span>© {new Date().getFullYear()} {hospital.name}</span>
        <span>{hospital.tagline}</span>
      </div>
    </footer>
  );
}

export function MobileActionBar() {
  return (
    <div className="mobile-action-bar" aria-label="Quick contact actions">
      <a href={hospital.phoneHref}>
        <Phone size={18} aria-hidden="true" /> Call
      </a>
      <a href={hospital.whatsappHref}>
        <MessageCircle size={18} aria-hidden="true" /> WhatsApp
      </a>
      <a href={hospital.mapsUrl}>
        <MapPin size={18} aria-hidden="true" /> Directions
      </a>
      <Link href="/appointment">
        <CalendarDays size={18} aria-hidden="true" /> Appointment
      </Link>
    </div>
  );
}

export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <main>{children}</main>
      <Footer />
      <MobileActionBar />
      <a
        href={formatWhatsApp("Hi, I would like to enquire about services at Protone Care Hospital.")}
        className="whatsapp-float"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Chat on WhatsApp"
      >
        <MessageCircle size={24} color="white" aria-hidden="true" />
      </a>
    </>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  body,
}: {
  eyebrow?: string;
  title: string;
  body?: string;
}) {
  return (
    <div className="section-header">
      {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
      <h2>{title}</h2>
      {body ? <p>{body}</p> : null}
    </div>
  );
}

export function PageHero({
  eyebrow,
  title,
  body,
  children,
}: {
  eyebrow: string;
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="page-hero">
      <div className="container hero-grid">
        <div>
          <span className="eyebrow">{eyebrow}</span>
          <h1>{title}</h1>
          <p>{body}</p>
          {children}
        </div>
        <div className="hero-contact-panel">
          <span>Direct hospital desk</span>
          <a href={hospital.phoneHref}>
            <Phone size={18} aria-hidden="true" /> {hospital.phone}
          </a>
          <a href={hospital.whatsappHref}>
            <MessageCircle size={18} aria-hidden="true" /> WhatsApp
          </a>
        </div>
      </div>
    </section>
  );
}

export function EmergencyBand() {
  return (
    <section className="emergency-band">
      <div className="container emergency-grid">
        <div>
          <span>24x7 Emergency</span>
          <strong>For urgent symptoms, call or visit directly.</strong>
        </div>
        <a href={hospital.phoneHref} className="button light">
          <Phone size={18} aria-hidden="true" /> Call {hospital.phone}
        </a>
        <a href={hospital.mapsUrl} className="button ghost-light">
          <MapPin size={18} aria-hidden="true" /> Directions
        </a>
      </div>
    </section>
  );
}

export function PrimaryActions({ departmentSlug }: { departmentSlug?: string }) {
  const appointmentHref = departmentSlug ? `/appointment?dept=${departmentSlug}` : "/appointment";
  return (
    <div className="action-row">
      <Link href={appointmentHref} className="button primary">
        <CalendarDays size={18} aria-hidden="true" /> Request Appointment
      </Link>
      <a href={formatWhatsApp("Hello Protone Care Hospital, I need assistance.")} className="button secondary">
        <MessageCircle size={18} aria-hidden="true" /> WhatsApp Desk
      </a>
      <a href={hospital.phoneHref} className="button subtle">
        <Phone size={18} aria-hidden="true" /> Call Now
      </a>
    </div>
  );
}

export function InfoBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="info-badge">
      <CheckCircle2 size={15} aria-hidden="true" /> {children}
    </span>
  );
}

export function SafetyNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="safety-note">
      <ShieldCheck size={20} aria-hidden="true" />
      <p>{children}</p>
    </div>
  );
}

export function TimingNote() {
  return (
    <div className="timing-note">
      <Clock3 size={18} aria-hidden="true" />
      <span>Timings may change. Please call <a href={hospital.phoneHref}>{hospital.phone}</a> to confirm availability.</span>
    </div>
  );
}

export function ArrowLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="arrow-link">
      {children} <ArrowRight size={16} aria-hidden="true" />
    </Link>
  );
}

export function Breadcrumbs({ paths }: { paths: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="bg-slate-100 border-b border-slate-200/50 py-3 text-sm">
      <div className="container max-w-7xl mx-auto px-4 flex items-center gap-2 text-slate-500 font-medium">
        <Link href="/" className="hover:text-teal-600 flex items-center gap-1.5 transition-colors text-decoration-none" style={{ display: "inline-flex", alignItems: "center" }}>
          <Home size={15} />
          <span>Home</span>
        </Link>
        {paths.map((p, idx) => {
          const isLast = idx === paths.length - 1;
          return (
            <div key={idx} className="flex items-center gap-2" style={{ display: "inline-flex", alignItems: "center" }}>
              <ChevronRight size={14} className="text-slate-400 shrink-0" />
              {isLast || !p.href ? (
                <span className="text-slate-800 font-semibold">{p.label}</span>
              ) : (
                <Link href={p.href} className="hover:text-teal-600 transition-colors text-decoration-none">
                  {p.label}
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </nav>
  );
}
