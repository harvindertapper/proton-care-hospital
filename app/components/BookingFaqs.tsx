"use client";

import { useState } from "react";
import { ChevronDown, HelpCircle } from "lucide-react";

export function BookingFaqs() {
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  const faqs = [
    {
      q: "What if I miss my allocated time?",
      a: "If you miss the confirmed time, our staff will try to offer the next available slot, subject to doctor and department availability.",
    },
    {
      q: "Is online payment required to request?",
      a: "Absolutely not. Protone Care Hospital does not collect any online payments during slot requests. All payments are done directly at the counter on arrival.",
    },
    {
      q: "Can I choose a specific doctor?",
      a: "To ensure direct clinical triage, appointment requests are made by department. Our team will coordinate your case details and assign the correct clinical specialist upon review.",
    },
    {
      q: "What documents are required for check-in?",
      a: "Please bring a valid photo ID (like Aadhaar card) and any relevant past medical history or prescriptions. If claiming cashless insurance, please bring your TPA card.",
    },
  ];

  return (
    <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-6 space-y-4 shadow-sm h-fit">
      <div className="flex items-center gap-2 text-slate-800 border-b border-slate-250 pb-3">
        <HelpCircle size={22} className="text-teal-650" />
        <h3 className="font-bold text-base" style={{ margin: 0 }}>Booking FAQs</h3>
      </div>
      <div className="space-y-3">
        {faqs.map((faq, idx) => {
          const isOpen = openIdx === idx;
          return (
            <div key={idx} className="border-b border-slate-200/50 pb-3 last:border-0 last:pb-0">
              <button
                type="button"
                onClick={() => setOpenIdx(isOpen ? null : idx)}
                className="flex items-center justify-between w-full text-left font-semibold text-slate-700 hover:text-teal-600 transition-colors py-1 cursor-pointer focus:outline-none"
              >
                <span className="text-xs sm:text-sm">{faq.q}</span>
                <ChevronDown size={16} className={`transform transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`} />
              </button>
              {isOpen && (
                <p className="text-xs text-slate-500 leading-relaxed mt-2 pl-1 animate-fade-in">
                  {faq.a}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
