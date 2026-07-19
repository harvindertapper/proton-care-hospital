"use client";

import React, { useEffect, useRef, useState } from "react";
import { HelpCircle, X, ChevronRight, Calendar } from "lucide-react";

interface SymptomNode {
  question: string;
  options: {
    text: string;
    next?: string;
    dept?: { name: string; slug: string };
    emergency?: boolean;
  }[];
}

const SYMPTOM_TREE: Record<string, SymptomNode> = {
  start: {
    question: "Welcome to Protone Triage. What main symptom describes your condition best?",
    options: [
      // TODO: Add Cardiology and Dermatology departments to data.ts, then
      // re-enable these triage branches. They are hidden until the matching
      // department slugs exist so "Book Appointment" never mis-routes.
      { text: "Bone, Joint, or Muscle Pain", next: "ortho" },
      { text: "For a Child (under 18)", next: "child" },
      { text: "Pregnancy or Women's Health", next: "women" },
      { text: "Anxiety, Stress, or Mood Changes", next: "mental" },
      { text: "Fever, Cold, Cough, General Checkup", next: "general" },
      { text: "Sudden Severe Injury or Trauma", next: "trauma" }
    ]
  },
  ortho: {
    question: "Did this pain occur after a recent fall, accident, or sudden twist?",
    options: [
      { text: "Yes, there is swelling or possible fracture", dept: { name: "Orthopedics", slug: "orthopaedic-surgery" } },
      { text: "No, it is a chronic joint ache or stiffness", dept: { name: "Orthopedics", slug: "orthopaedic-surgery" } }
    ]
  },
  child: {
    question: "What is the primary concern for the child?",
    options: [
      { text: "Fever, cold, or general pediatrics", dept: { name: "Pediatrics", slug: "paediatrics" } },
      { text: "Vaccination or growth checkup", dept: { name: "Pediatrics", slug: "paediatrics" } }
    ]
  },
  women: {
    question: "Select the primary care area:",
    options: [
      { text: "Pregnancy checkups or maternity care", dept: { name: "Obstetrics & Gynecology", slug: "obstetrics-and-gynecology" } },
      { text: "General women's health / menstrual issues", dept: { name: "Obstetrics & Gynecology", slug: "obstetrics-and-gynecology" } }
    ]
  },
  mental: {
    question: "How long have you been experiencing these mood or anxiety changes?",
    options: [
      { text: "Recently (less than a month)", dept: { name: "Psychiatry", slug: "psychiatry" } },
      { text: "Long-standing (several months/years)", dept: { name: "Psychiatry", slug: "psychiatry" } }
    ]
  },
  general: {
    question: "Is your condition acute (sudden onset) or for a regular health screening?",
    options: [
      { text: "Regular health screening / Checkup", dept: { name: "General Medicine", slug: "general-medicine" } },
      { text: "Acute fever, cough, or general pain", dept: { name: "General Medicine", slug: "general-medicine" } }
    ]
  },
  trauma: {
    question: "Is there active heavy bleeding, loss of consciousness, or severe burns?",
    options: [
      { text: "Yes, this is an emergency", emergency: true },
      { text: "No, minor wound / sprain", dept: { name: "Emergency Medicine", slug: "emergency-medicine" } }
    ]
  }
};

export function TriageWidget() {
  const launcherRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [currentNode, setCurrentNode] = useState("start");
  const [history, setHistory] = useState<string[]>([]);
  const [result, setResult] = useState<{
    dept?: { name: string; slug: string };
    emergency?: boolean;
  } | null>(null);

  function resetTriage() {
    setCurrentNode("start");
    setHistory([]);
    setResult(null);
  }

  function handleOptionClick(opt: SymptomNode["options"][number]) {
    if (currentNode === "start") {
      fetch("/api/analytics", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ eventType: "triage_start", path: window.location.pathname }),
      }).catch(() => {});
    }

    if (opt.emergency) {
      setResult({ emergency: true });
    } else if (opt.dept) {
      setResult({ dept: opt.dept });
      fetch("/api/analytics", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ eventType: "triage_match", path: window.location.pathname }),
      }).catch(() => {});
    } else if (opt.next) {
      setHistory([...history, currentNode]);
      setCurrentNode(opt.next);
    }
  }

  function handleBack() {
    if (history.length > 0) {
      const prev = history[history.length - 1];
      setCurrentNode(prev);
      setHistory(history.slice(0, -1));
    }
  }

  useEffect(() => {
    if (!isOpen) return;

    const focusFrame = window.requestAnimationFrame(() => {
      closeButtonRef.current?.focus();
    });

    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setIsOpen(false);
      window.requestAnimationFrame(() => {
        launcherRef.current?.focus();
      });
    }

    document.addEventListener("keydown", handleEscape);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  return (
    <div className="triage-widget-float">
      {!isOpen && (
        <button
          ref={launcherRef}
          type="button"
          aria-expanded={isOpen}
          aria-controls="symptom-triage-panel"
          onClick={() => {
            setIsOpen(true);
            resetTriage();
          }}
          style={{
            width: "56px",
            height: "56px",
            borderRadius: "50%",
            background: "linear-gradient(135deg, #0ea5e9, #0284c7)",
            color: "white",
            border: 0,
            cursor: "pointer",
            boxShadow: "0 8px 24px rgba(2, 132, 199, 0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "all 0.2s ease-in-out"
          }}
          aria-label="Open Symptom Triage"
        >
          <HelpCircle size={24} />
        </button>
      )}

      {isOpen && (
        <div
          id="symptom-triage-panel"
          className="triage-panel"
          role="dialog"
          aria-modal="false"
          aria-labelledby="symptom-triage-title"
        >
          <div className="triage-panel-header">
            <div>
              <h3
                id="symptom-triage-title"
                className="triage-panel-title"
              >
                Symptom Triage Assistant
              </h3>
              <span style={{ fontSize: "11px", color: "#94a3b8" }}>Protone Care Hospital</span>
            </div>
            <button
              ref={closeButtonRef}
              type="button"
              className="triage-close-button"
              aria-label="Close symptom triage"
              onClick={() => {
                setIsOpen(false);
                window.requestAnimationFrame(() => {
                  launcherRef.current?.focus();
                });
              }}
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>

          <div className="triage-panel-body">
            {result ? (
              <div className="triage-result">
                {result.emergency ? (
                  <>
                    <div style={{ fontSize: "40px" }}>🚨</div>
                    <h4 style={{ margin: 0, color: "#e11d48", fontSize: "18px", fontWeight: 700 }}>Immediate Medical Attention Required</h4>
                    <p style={{ margin: 0, fontSize: "13px", color: "#475569", lineHeight: "1.5" }}>
                      Based on your severe symptoms, please dial <strong>102 / 9220463438</strong> or go directly to the nearest Emergency Room.
                    </p>
                    <a
                      href="tel:9220463438"
                      style={{
                        padding: "12px",
                        background: "#e11d48",
                        color: "white",
                        borderRadius: "10px",
                        fontWeight: 600,
                        textDecoration: "none",
                        marginTop: "8px",
                        boxShadow: "0 4px 12px rgba(225, 29, 72, 0.2)",
                        display: "block"
                      }}
                    >
                      Call Emergency Desk
                    </a>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: "40px" }}>🩺</div>
                    <h4 style={{ margin: 0, color: "#0f172a", fontSize: "17px", fontWeight: 700 }}>Department Match Found</h4>
                    <p style={{ margin: 0, fontSize: "13px", color: "#475569", lineHeight: "1.5" }}>
                      We recommend booking a consultation in our <strong>{result.dept?.name}</strong> department.
                    </p>
                    <a
                      href={`/appointment?dept=${result.dept?.slug}`}
                      style={{
                        padding: "12px",
                        background: "linear-gradient(135deg, #0ea5e9, #0284c7)",
                        color: "white",
                        borderRadius: "10px",
                        fontWeight: 600,
                        textDecoration: "none",
                        marginTop: "8px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "8px",
                        boxShadow: "0 4px 12px rgba(2, 132, 199, 0.25)"
                      }}
                    >
                      <Calendar size={16} /> Book Appointment
                    </a>
                  </>
                )}
                <button
                  type="button"
                  className="triage-secondary-action"
                  onClick={resetTriage}
                >
                  Start Over
                </button>
              </div>
            ) : (
              <>
                <p className="triage-question">
                  {SYMPTOM_TREE[currentNode].question}
                </p>

                <div className="triage-options">
                  {SYMPTOM_TREE[currentNode].options.map((opt, i) => (
                    <button
                      key={i}
                      type="button"
                      className="triage-option"
                      onClick={() => handleOptionClick(opt)}
                    >
                      <span>{opt.text}</span>
                      <ChevronRight size={14} aria-hidden="true" />
                    </button>
                  ))}
                </div>

                {history.length > 0 && (
                  <button
                    type="button"
                    className="triage-secondary-action triage-back-button"
                    onClick={handleBack}
                  >
                    ← Back
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
