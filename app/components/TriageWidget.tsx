"use client";

import React, { useState } from "react";
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
      { text: "Chest Pain / Heart Concerns", next: "cardiac" },
      { text: "Bone, Joint, or Muscle Pain", next: "ortho" },
      { text: "For a Child (under 18)", next: "child" },
      { text: "Pregnancy or Women's Health", next: "women" },
      { text: "Skin Rashes / Acne / Hair Loss", next: "skin" },
      { text: "Anxiety, Stress, or Mood Changes", next: "mental" },
      { text: "Fever, Cold, Cough, General Checkup", next: "general" },
      { text: "Sudden Severe Injury or Trauma", next: "trauma" }
    ]
  },
  cardiac: {
    question: "Is the chest pain accompanied by pain in the left arm, sweating, or severe shortness of breath?",
    options: [
      { text: "Yes, this is severe/sudden", emergency: true },
      { text: "No, it's a mild or chronic concern", dept: { name: "Cardiology", slug: "cardiology" } }
    ]
  },
  ortho: {
    question: "Did this pain occur after a recent fall, accident, or sudden twist?",
    options: [
      { text: "Yes, there is swelling or possible fracture", dept: { name: "Orthopedics", slug: "orthopedics" } },
      { text: "No, it is a chronic joint ache or stiffness", dept: { name: "Orthopedics", slug: "orthopedics" } }
    ]
  },
  child: {
    question: "What is the primary concern for the child?",
    options: [
      { text: "Fever, cold, or general pediatrics", dept: { name: "Pediatrics", slug: "pediatrics" } },
      { text: "Vaccination or growth checkup", dept: { name: "Pediatrics", slug: "pediatrics" } }
    ]
  },
  women: {
    question: "Select the primary care area:",
    options: [
      { text: "Pregnancy checkups or maternity care", dept: { name: "Obstetrics & Gynecology", slug: "obstetrics-and-gynecology" } },
      { text: "General women's health / menstrual issues", dept: { name: "Obstetrics & Gynecology", slug: "obstetrics-and-gynecology" } }
    ]
  },
  skin: {
    question: "Is the rash spreading rapidly or painful?",
    options: [
      { text: "Yes, it is painful / spreading fast", dept: { name: "Dermatology", slug: "dermatology" } },
      { text: "No, it's a chronic concern or acne issue", dept: { name: "Dermatology", slug: "dermatology" } }
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
      { text: "No, minor wound / sprain", dept: { name: "Emergency Triage", slug: "emergency-triage" } }
    ]
  }
};

export function TriageWidget() {
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

  return (
    <div style={{ position: "fixed", bottom: "24px", right: "24px", zIndex: 9999, fontFamily: "'Outfit', sans-serif" }}>
      {!isOpen && (
        <button
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
          style={{
            width: "360px",
            background: "white",
            borderRadius: "16px",
            border: "1px solid #e2e8f0",
            boxShadow: "0 10px 30px rgba(15, 23, 42, 0.08)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden"
          }}
        >
          <div
            style={{
              padding: "16px 20px",
              background: "linear-gradient(135deg, #0f172a, #1e293b)",
              color: "white",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center"
            }}
          >
            <div>
              <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 600 }}>Symptom Triage Assistant</h3>
              <span style={{ fontSize: "11px", color: "#94a3b8" }}>Protone Care Hospital</span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              style={{ background: "transparent", border: 0, color: "#94a3b8", cursor: "pointer", padding: "4px" }}
            >
              <X size={18} />
            </button>
          </div>

          <div style={{ padding: "20px", flex: 1, display: "flex", flexDirection: "column", gap: "16px", minHeight: "260px", justifyContent: "space-between" }}>
            {result ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px", textAlign: "center", padding: "10px 0" }}>
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
                  onClick={resetTriage}
                  style={{ background: "transparent", border: 0, color: "#64748b", fontSize: "12px", textDecoration: "underline", cursor: "pointer", marginTop: "10px" }}
                >
                  Start Over
                </button>
              </div>
            ) : (
              <>
                <p style={{ margin: 0, fontSize: "13px", color: "#334155", fontWeight: 500, lineHeight: "1.5", background: "#f8fafc", padding: "12px", borderRadius: "8px" }}>
                  {SYMPTOM_TREE[currentNode].question}
                </p>

                <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "200px", overflowY: "auto", paddingRight: "4px" }}>
                  {SYMPTOM_TREE[currentNode].options.map((opt, i) => (
                    <button
                      key={i}
                      onClick={() => handleOptionClick(opt)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "10px 14px",
                        background: "white",
                        border: "1px solid #cbd5e1",
                        borderRadius: "8px",
                        cursor: "pointer",
                        fontSize: "12.5px",
                        color: "#1e293b",
                        fontWeight: 500,
                        textAlign: "left",
                        transition: "all 0.15s ease"
                      }}
                    >
                      <span>{opt.text}</span>
                      <ChevronRight size={14} style={{ color: "#94a3b8" }} />
                    </button>
                  ))}
                </div>

                {history.length > 0 && (
                  <button
                    onClick={handleBack}
                    style={{
                      alignSelf: "flex-start",
                      background: "transparent",
                      border: 0,
                      color: "#64748b",
                      fontSize: "12px",
                      cursor: "pointer"
                    }}
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
