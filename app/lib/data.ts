export const SITE_URL = "https://protonecarehospital.com";

export const hospital = {
  name: "Protone Care Hospital",
  tagline: "Compassion | Care | Cure",
  domain: "protonecarehospital.com",
  address: "1/23 Laxmi Garden, Sector 11, Gurgaon / Gurugram, Haryana 122001",
  mapsUrl: "https://maps.app.goo.gl/RphHTd8iKTrHeuxx8?g_st=aw",
  phone: "9220463438",
  phoneHref: "tel:+919220463438",
  landline: "0124-4584582",
  landlineHref: "tel:+911244584582",
  whatsappHref: "https://wa.me/919220463438",
  whatsappNumber: "919220463438",
  email: "protonecare@gmail.com",
  emailHref: "mailto:protonecare@gmail.com",
  emergency: "24x7 Emergency",
  logo: "/assets/brand/protone-logo.jpeg",
  heroImage: "/assets/hospital/front-exterior-hero.webp",
  wideImage: "/assets/hospital/front-exterior-wide.webp",
};

export const consentText =
  "I consent to Protone Care Hospital contacting me by phone, WhatsApp, SMS, or email regarding my request. I understand this form is not for medical emergencies.";

export const emergencyNotice =
  "For emergencies, please call 9220463438 or visit Protone Care Hospital directly. Do not wait for an online appointment confirmation in an emergency.";

export type Department = {
  slug: string;
  name: string;
  hindi: string;
  summary: string;
  group: string;
  timing?: { label: string; start: string; end: string; days: string };
  image?: string;
};

export const departments: Department[] = [
  {
    slug: "general-medicine",
    name: "General Medicine",
    hindi: "सामान्य चिकित्सा",
    group: "Medicine",
    summary: "Primary medical consultation for fever, infections, chronic illness, and general adult care.",
    timing: { label: "9:00 AM to 6:00 PM", start: "09:00", end: "18:00", days: "Mon-Sat" },
    image: "/assets/hospital/patient-room-twin.jpg",
  },
  {
    slug: "general-surgery",
    name: "General Surgery, including laparoscopic surgery",
    hindi: "सामान्य शल्य चिकित्सा (लेप्रोस्कोपिक सर्जरी सहित)",
    group: "Surgery",
    summary: "General and laparoscopic surgical consultation with operation theatre support.",
    timing: { label: "12:00 PM to 2:00 PM", start: "12:00", end: "14:00", days: "Mon-Sat" },
    image: "/assets/hospital/patient-room-single.jpg",
  },
  {
    slug: "anaesthesiology",
    name: "Anaesthesiology",
    hindi: "एनेस्थीसियोलॉजी (बेहोशी विज्ञान)",
    group: "Surgery",
    summary: "Anaesthesia and peri-operative support for safe surgical care.",
  },
  {
    slug: "obstetrics-and-gynecology",
    name: "Obstetrics and Gynecology",
    hindi: "प्रसूति एवं स्त्री रोग",
    group: "Women and Child Care",
    summary: "Consultation for women's health, pregnancy-related concerns, and gynecological care.",
    timing: { label: "11:00 AM to 2:00 PM", start: "11:00", end: "14:00", days: "Mon-Sat" },
  },
  {
    slug: "dental",
    name: "Dental",
    hindi: "दंत चिकित्सा",
    group: "Speciality Care",
    summary: "Dental consultation and everyday oral healthcare support.",
  },
  {
    slug: "orthopaedic-surgery",
    name: "Orthopaedic Surgery (Including Joint Replacement)",
    hindi: "अस्थि रोग शल्य चिकित्सा (जॉइंट रिप्लेसमेंट सहित)",
    group: "Surgery",
    summary: "Bone, joint, injury, and orthopaedic surgery consultation.",
    timing: { label: "1:00 PM to 2:00 PM", start: "13:00", end: "14:00", days: "Mon-Sat" },
  },
  {
    slug: "paediatrics",
    name: "Paediatrics",
    hindi: "शिशु रोग",
    group: "Women and Child Care",
    summary: "Child health consultation, fever care, growth concerns, and paediatric support.",
    timing: { label: "6:00 PM to 7:00 PM", start: "18:00", end: "19:00", days: "Mon-Sat" },
  },
  {
    slug: "ent",
    name: "Otorhinolaryngology (ENT)",
    hindi: "कान, नाक एवं गला (ईएनटी)",
    group: "Speciality Care",
    summary: "Ear, nose, throat, sinus, and voice-related consultation.",
  },
  {
    slug: "neurology",
    name: "Neurology",
    hindi: "न्यूरोलॉजी (तंत्रिका तंत्र रोग)",
    group: "Speciality Care",
    summary: "Neurological consultation for nerve, headache, seizure, and movement-related concerns.",
  },
  {
    slug: "medical-gastroenterology",
    name: "Medical Gastroenterology",
    hindi: "जठरांत्र चिकित्सा",
    group: "Speciality Care",
    summary: "Digestive system, liver, acidity, abdominal pain, and gastroenterology consultation.",
  },
  {
    slug: "urology",
    name: "Urology",
    hindi: "मूत्र रोग",
    group: "Speciality Care",
    summary: "Urinary tract, kidney stone, prostate, and urology consultation.",
  },
  {
    slug: "physiotherapy",
    name: "Physiotherapy",
    hindi: "फिजियोथेरेपी",
    group: "Rehabilitation",
    summary: "Rehabilitation and movement support for pain, mobility, and post-procedure recovery.",
  },
  {
    slug: "respiratory-medicine",
    name: "Respiratory Medicine",
    hindi: "श्वसन रोग चिकित्सा",
    group: "Medicine",
    summary: "Breathing, cough, asthma, COPD, and respiratory condition consultation.",
  },
  {
    slug: "psychiatry",
    name: "Psychiatry",
    hindi: "मनोरोग चिकित्सा",
    group: "Speciality Care",
    summary: "Mental health consultation with privacy-sensitive patient support.",
  },
  {
    slug: "clinical-biochemistry",
    name: "Clinical Biochemistry",
    hindi: "क्लिनिकल बायोकेमिस्ट्री",
    group: "Diagnostics",
    summary: "Laboratory diagnostic support for clinical investigations.",
  },
  {
    slug: "ophthalmology",
    name: "Ophthalmology",
    hindi: "नेत्र रोग",
    group: "Speciality Care",
    summary: "Eye care consultation and ophthalmology support.",
  },
  {
    slug: "clinical-pathology",
    name: "Clinical Pathology",
    hindi: "क्लिनिकल पैथोलॉजी",
    group: "Diagnostics",
    summary: "Pathology and diagnostic support for clinical testing.",
  },
  {
    slug: "emergency-medicine",
    name: "Critical Care & Emergency Medicine / क्रिटिकल केयर और आपातकालीन चिकित्सा",
    hindi: "क्रिटिकल केयर और आपातकालीन चिकित्सा",
    group: "Emergency & Critical Care",
    summary: "24/7 emergency assessment and stabilisation, with ICU or NICU support when clinically appropriate and subject to availability.",
    image: "/assets/hospital/ward-bed-01.jpg",
  },
];

export type Doctor = {
  slug: string;
  name: string;
  speciality: string;
  qualification?: string;
  departmentSlug: string;
  photo?: string;
  regNo?: string;
  consultantType?: string;
};

export const doctors: Doctor[] = [
  { slug: "dr-ramesh", name: "Dr Ramesh Chandra", speciality: "Internal Medicine Specialist", qualification: "MBBS", departmentSlug: "general-medicine", photo: "/assets/doctors/dr-ramesh.webp", regNo: "MCI-12845", consultantType: "Visiting Consultant" },
  { slug: "dr-robin-singh", name: "Dr Robin Singh", speciality: "Internal Medicine Specialist", qualification: "MBBS", departmentSlug: "general-medicine", photo: "/assets/doctors/dr-robin-singh.webp", regNo: "HN-8843", consultantType: "Full-time Consultant" },
  { slug: "dr-sanjeev-thakral", name: "Dr Sanjeev Thakral", speciality: "Consultant Physician", qualification: "MBBS, MD (General Medicine)", departmentSlug: "general-medicine", regNo: "HN-9421", consultantType: "Full-time Consultant" },
  { slug: "dr-mohit-saran", name: "Dr Mohit Saran", speciality: "Consultant Physician", qualification: "MBBS, MD (General Medicine)", departmentSlug: "general-medicine", regNo: "MCI-19430", consultantType: "Full-time Consultant" },
  { slug: "dr-rajeev", name: "Dr Rajeev Kumar", speciality: "Internal Medicine Specialist", qualification: "MBBS", departmentSlug: "general-medicine", photo: "/assets/doctors/dr-rajeev.webp", regNo: "MCI-22485", consultantType: "Visiting Consultant" },
  { slug: "dr-devender", name: "Dr Devender Singh", speciality: "Internal Medicine Specialist", qualification: "MBBS", departmentSlug: "general-medicine", photo: "/assets/doctors/dr-devender.webp", regNo: "HN-10543", consultantType: "Visiting Consultant" },
  { slug: "dr-chanderkanta-arya", name: "Dr Chanderkanta Arya", speciality: "Consultant Obstetrician and Gynaecologist", qualification: "MBBS, DGO (Obstetrics & Gynaecology)", departmentSlug: "obstetrics-and-gynecology", photo: "/assets/doctors/dr-chanderkanta-arya.webp", regNo: "MCI-11425", consultantType: "Full-time Consultant" },
  { slug: "dr-jaidev", name: "Dr Jaidev Sharma", speciality: "Consultant Nephrologist", qualification: "MBBS, MD (General Medicine), DM (Nephrology)", departmentSlug: "general-medicine", regNo: "HN-8742", consultantType: "Visiting Consultant" },
  { slug: "dr-rukma", name: "Dr Rukma Singh", speciality: "Consultant Neurologist", qualification: "MBBS, MD (General Medicine), DM (Neurology)", departmentSlug: "neurology", photo: "/assets/doctors/dr-rukma.webp", regNo: "HN-8841", consultantType: "Visiting Consultant" },
  { slug: "dr-rohit-arora", name: "Dr Rohit Arora", speciality: "Consultant Orthopaedic Surgeon", qualification: "MBBS, MS (Orthopaedics), M.Ch (Orthopaedics)", departmentSlug: "orthopaedic-surgery", regNo: "MCI-16524", consultantType: "Visiting Consultant" },
  { slug: "dr-anurag-singh-thakur", name: "Dr Anurag Singh Thakur", speciality: "Consultant Paediatrician", qualification: "MBBS, MD (Paediatrics)", departmentSlug: "paediatrics", regNo: "HN-7492", consultantType: "Full-time Consultant" },
  { slug: "dr-ankur-popat", name: "Dr Ankur Popat", speciality: "Consultant General & Laparoscopic Surgeon", qualification: "MBBS, MS (General Surgery)", departmentSlug: "general-surgery", photo: "/assets/doctors/dr-ankur-popat.webp", regNo: "MCI-18843", consultantType: "Full-time Consultant" },
  { slug: "dr-ashwani-yadav", name: "Dr Ashwani Yadav", speciality: "Consultant Anaesthesiologist & Critical Care Specialist", qualification: "MBBS, MD (Anaesthesiology)", departmentSlug: "general-medicine", regNo: "HN-6204", consultantType: "Full-time Consultant" },
  { slug: "dr-vikas-tiwadi", name: "Dr Vikas Tiwadi", speciality: "Consultant Anaesthesiologist & Critical Care Specialist", qualification: "MBBS, MD (Anaesthesiology)", departmentSlug: "general-medicine", regNo: "HN-6205", consultantType: "Full-time Consultant" },
  { slug: "dr-pankaj-mittal", name: "Dr Pankaj Mittal", speciality: "Internal Medicine Specialist", qualification: "MBBS, MD (General Medicine)", departmentSlug: "general-medicine", regNo: "MCI-12945", consultantType: "Visiting Consultant" },
  { slug: "dr-vikram-dagar", name: "Dr Vikram Dagar", speciality: "Consultant Orthopaedic Surgeon", qualification: "MBBS, MS (Orthopaedics)", departmentSlug: "orthopaedic-surgery", regNo: "HN-8842", consultantType: "Full-time Consultant" },
  { slug: "dr-sonam", name: "Dr Sonam", speciality: "Consultant Obstetrician and Gynaecologist", qualification: "MBBS, MS (Obstetrics & Gynaecology)", departmentSlug: "obstetrics-and-gynecology", regNo: "HN-9423", consultantType: "Full-time Consultant" },
  { slug: "dr-rajesh-kumar-rathi", name: "Dr Rajesh Kumar Rathi", speciality: "Consultant Paediatrician", qualification: "MBBS, MD (Paediatrics)", departmentSlug: "paediatrics", regNo: "HN-8430", consultantType: "Full-time Consultant" },
  { slug: "dr-vikas-tiwari", name: "Dr Vikas Tiwari", speciality: "Consultant Anaesthesiologist", qualification: "MBBS, MD (Anaesthesiology)", departmentSlug: "anaesthesiology", regNo: "HN-6206", consultantType: "Full-time Consultant" },
  { slug: "dr-sahil-kapoor", name: "Dr Sahil Kapoor", speciality: "Consultant Otorhinolaryngologist (ENT)", qualification: "MBBS, MS (Otorhinolaryngology / ENT)", departmentSlug: "ent", photo: "/assets/doctors/dr-sahil-kapoor.webp", regNo: "MCI-19941", consultantType: "Visiting Consultant" },
  { slug: "dr-apurva-nagesh-sharma", name: "Dr Apurva Nagesh Sharma", speciality: "Consultant Neurologist", qualification: "MBBS, MD (General Medicine), DM (Neurology)", departmentSlug: "neurology", regNo: "HN-7740", consultantType: "Visiting Consultant" },
  { slug: "dr-uddhavesh-mukund-paithankar", name: "Dr Uddhavesh Mukund Paithankar", speciality: "Consultant Gastroenterologist", qualification: "MBBS, MD (General Medicine), DM (Gastroenterology)", departmentSlug: "medical-gastroenterology", photo: "/assets/doctors/dr-uddhavesh-mukund-paithankar.webp", regNo: "MCI-20542", consultantType: "Visiting Consultant" },
  { slug: "dr-praveen-kumar-yadav", name: "Dr Praveen Kumar Yadav", speciality: "Consultant Urologist", qualification: "MBBS, MS (General Surgery), M.Ch (Urology)", departmentSlug: "urology", photo: "/assets/doctors/dr-praveen-kumar-yadav.webp", regNo: "MCI-17493", consultantType: "Visiting Consultant" },
  { slug: "dr-pritam", name: "Dr Pritam", speciality: "Consultant Dentist", qualification: "MDS (Prosthodontics)", departmentSlug: "dental", regNo: "HN-3940", consultantType: "Visiting Consultant" },
  { slug: "Manish-Kumar", name: "Manish Kumar", speciality: "Physiotherapist", qualification: "BPT (Bachelor of Physiotherapy)", departmentSlug: "physiotherapy", regNo: "HN-PHY-884", consultantType: "Full-time Physiotherapist" },
];

export const facilities = [
  "24x7 Emergency",
  "OPD / IPD Services",
  "ICU",
  "NICU",
  "HDU",
  "Modern Operation Theatre",
  "Deluxe / Private / Semi-Private Rooms",
  "Pharmacy",
  "Advanced Lab",
  "Digital X-Ray",
  "Ultrasound",
  "Dental",
  "General Health Checkup",
  "Corporate Health Checkup Packages",
];

export const facilityGroups = [
  { title: "Emergency & Critical Care", items: ["24x7 Emergency", "ICU", "NICU", "HDU"] },
  { title: "OPD/IPD & Patient Stay", items: ["OPD/IPD Services", "Deluxe/Private/Semi-Private Rooms"] },
  { title: "Surgery & Procedures", items: ["Modern Operation Theatre", "Anaesthesiology support"] },
  { title: "Diagnostics", items: ["Advanced Lab", "Digital X-Ray", "Ultrasound", "Clinical Biochemistry", "Clinical Pathology"] },
  { title: "Everyday Patient Support", items: ["Pharmacy", "Dental", "Health Checkups"] },
];

export const tpaPanels = [
  "GIC (General Insurance Council)",
  "Medi Assist Insurance TPA",
  "MD India Health Insurance TPA",
  "Paramount Health Service & Insurance TPA",
  "Heritage Health Plan Insurance TPA",
  "FHPL TPA",
  "Raksha Health Insurance TPA",
  "Vidal Health Insurance TPA",
  "VOLO Health TPA",
  "Medsave Health TPA",
  "Genins India Insurance TPA",
  "Health India Insurance TPA Services Private Limited",
  "Good Health Insurance TPA",
  "Park Mediclaim Insurance TPA",
  "Safeway Insurance TPA (Health Assist TPA)",
  "Ericson Insurance TPA Private Limited",
  "Health Insurance TPA",
  "Vision Digital Insurance TPA",
  "Link-K Insurance TPA",
  "AKNA Insurance TPA",
  "Star Health Insurance TPA",
  "HDFC ERGO Insurance TPA",
  "ICICI Lombard Insurance TPA",
  "TATA AIG Insurance TPA",
  "Go Digit Insurance TPA",
  "Care Insurance TPA",
  "Oriental Insurance",
  "Bajaj Insurance TPA",
  "Aditya Birla Insurance TPA",
  "IFFCO Tokio Insurance TPA",
  "IndusInd Insurance (Reliance) TPA",
  "SBI General Insurance",
  "Niva Bupa Health Insurance Company Limited",
  "Chola MS Insurance TPA",
  "ManipalCigna Health Insurance Company Limited",
  "National Insurance",
  "United India Insurance Company Limited",
  "The New India Assurance Company Limited",
  "Universal Sompo General Insurance Company Limited",
  "Royal Sundaram Insurance TPA",
  "Liberty General Insurance",
  "Shriram General Insurance Company Limited",
  "Future Generali Insurance TPA",
].map((name, index) => ({
  id: index + 1,
  name,
  logo: `/assets/tpa/display/panel-${index + 1}.png`,
}));

export const publicNav = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About" },
  { href: "/departments", label: "Departments" },
  { href: "/doctors", label: "Doctors" },
  { href: "/gallery", label: "Gallery" },
  { href: "/tpa-insurance", label: "TPA" },
  { href: "/testimonials", label: "Testimonials" },
  { href: "/blog", label: "Blog" },
  { href: "/careers", label: "Careers" },
  { href: "/faqs", label: "FAQs" },
  { href: "/appointment/status", label: "Track Status" },
  { href: "/contact", label: "Contact" },
];

export const adminNav = [
  "Dashboard",
  "Appointments",
  "Department Timings",
  "Doctors",
  "Approval Queue",
  "Blogs",
  "Careers",
  "Reviews",
  "Videos",
  "Feedback",
  "Contact Messages",
  "Audit Logs",
  "Settings",
];

export const defaultBlogs = [
  {
    slug: "appointment-request-guide",
    title: "How Online Appointment Requests Work at Protone Care Hospital",
    excerpt: "A patient-safe guide to submitting a request, receiving a callback, and knowing when to use emergency contact.",
    body: "Submitting an appointment request online is simple, convenient, and designed to match you with the correct clinical department.\n\n1. Select Your Department: Choose the department corresponding to your symptoms.\n2. Choose Your Date & Time: Request a preferred consultation window.\n3. Mobile OTP Verification: Verify your mobile number via safe One-Time Password validation.\n4. Call Confirmation: Our coordination desk reviews your request and calls you to confirm the exact slot and doctor assignment.\n\nIMPORTANT: Online requests are for outpatient consultations only. For life-threatening emergencies, call 112 or visit the Emergency department immediately.",
    author: "Protone Medical Editorial Team",
    reviewer: "Dr. Sanjeev Thakral (Consultant Physician)",
    created_at: "2026-07-01T10:00:00.000Z",
    status: "approved",
  },
  {
    slug: "tpa-cashless-support",
    title: "Understanding TPA and Cashless Assistance",
    excerpt: "What patients should know before asking about cashless approval and documentation.",
    body: "Navigating medical insurance and cashless approvals can sometimes feel complex. This guide explains how our TPA desk helps you process cashless requests.\n\n1. Active Empanelment: Check if your TPA or insurer is listed on our active panels. All empanelments are subject to confirmation.\n2. Pre-Authorisation: The hospital desk initiates the pre-auth request. Final cashless approval is subject to policy terms, exclusions, medical necessity, and insurer authorization.\n3. Processing Times: Pre-auth processing depends entirely on the insurer and cannot be guaranteed to complete within specific timeframes.\n4. Original Documents: Bring your original TPA card, Aadhaar card, past doctor prescriptions, and diagnostics.",
    author: "Protone Billing & Compliance Team",
    reviewer: "Protone Care Hospital Administration",
    created_at: "2026-07-02T11:00:00.000Z",
    status: "needs_review",
  },
];

export const defaultJobs = [
  {
    slug: "nursing-staff",
    title: "Nursing Staff",
    department: "Patient Care",
    type: "Full-time",
    status: "needs_review",
  },
  {
    slug: "front-desk-executive",
    title: "Front Desk Executive",
    department: "Administration",
    type: "Full-time",
    status: "needs_review",
  },
];

export function departmentBySlug(slug: string) {
  return departments.find((department) => department.slug === slug);
}

export function doctorsForDepartment(slug: string) {
  return doctors.filter((doctor) => doctor.departmentSlug === slug);
}

export function formatWhatsApp(text: string) {
  return `https://wa.me/${hospital.whatsappNumber}?text=${encodeURIComponent(text)}`;
}

function timeToMinutes(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function minutesToLabel(minutes: number) {
  const hour24 = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const suffix = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${minute.toString().padStart(2, "0")} ${suffix}`;
}

export function generateSlots(start: string, end: string, gap = 15) {
  const result: string[] = [];
  for (let current = timeToMinutes(start); current < timeToMinutes(end); current += gap) {
    result.push(minutesToLabel(current));
  }
  return result;
}

export function approvedTimingDepartments() {
  return departments.filter((department) => department.timing);
}
