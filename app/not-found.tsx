import Link from "next/link";
import { ArrowLeft, Phone } from "lucide-react";
import { PageShell } from "@/app/components/SiteShell";
import { hospital } from "@/app/lib/data";

export default function NotFound() {
  return (
    <PageShell>
      <section className="section py-24 bg-slate-50 min-h-[60vh] flex items-center justify-center">
        <div className="container max-w-xl mx-auto px-4 text-center">
          <div className="inline-flex p-6 bg-teal-50 border border-teal-100 rounded-full text-teal-600 mb-6 font-mono text-4xl font-extrabold shadow-sm">
            404
          </div>
          <h1 className="text-4xl font-black text-slate-800 tracking-tight mb-4">
            Page Not Found / पृष्ठ नहीं मिला
          </h1>
          <p className="text-slate-600 text-lg max-w-md mx-auto mb-8 leading-relaxed">
            We couldn&apos;t find the page you are looking for. It may have been moved, deleted, or the address might be incorrect.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Link href="/" className="button primary flex items-center gap-2">
              <ArrowLeft size={18} /> Back to Home / मुख्य पृष्ठ
            </Link>
            <a href={hospital.phoneHref} className="button secondary flex items-center gap-2">
              <Phone size={18} /> Call Desk: {hospital.phone}
            </a>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
