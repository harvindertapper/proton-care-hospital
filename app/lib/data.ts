export const SITE_URL = "https://Protonecarehospital.com";

export const hospital = {
  name: "Protone Care Hospital",
  tagline: "Compassion | Care | Cure",
  domain: "Protonecarehospital.com",
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
};

export const departments: Department[] = [
  {
    slug: "general-medicine",
    name: "General Medicine",
    hindi: "सामान्य चिकित्सा",
    group: "Medicine",
    summary: "Primary medical consultation for fever, infections, chronic illness, and general adult care.",
    timing: { label: "9:00 AM to 6:00 PM", start: "09:00", end: "18:00", days: "Mon-Sat" },
  },
  {
    slug: "general-surgery",
    name: "General Surgery (including Laparoscopy Surgery)",
    hindi: "सामान्य शल्य चिकित्सा (लेप्रोस्कोपिक सर्जरी सहित)",
    group: "Surgery",
    summary: "General and laparoscopic surgical consultation with operation theatre support.",
    timing: { label: "12:00 PM to 2:00 PM", start: "12:00", end: "14:00", days: "Mon-Sat" },
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
    summary: "24x7 immediate emergency medical care and intensive care unit (ICU/NICU) triage support.",
  },
];

export type Doctor = {
  slug: string;
  name: string;
  speciality: string;
  qualification?: string;
  departmentSlug: string;
  photo?: string;
};

export const doctors: Doctor[] = [
  { slug: "dr-ramesh", name: "DR. RAMESH", speciality: "General Physician", qualification: "MBBS", departmentSlug: "general-medicine", photo: "/assets/doctors/dr-ramesh.webp" },
  { slug: "dr-robin-singh", name: "DR. ROBIN SINGH", speciality: "General Physician", qualification: "MBBS", departmentSlug: "general-medicine", photo: "/assets/doctors/dr-robin-singh.webp" },
  { slug: "dr-sanjeev-thakral", name: "DR. SANJEEV THAKRAL", speciality: "Medicine", qualification: "MBBS, MD", departmentSlug: "general-medicine" },
  { slug: "dr-mohit-saran", name: "DR. MOHIT SARAN", speciality: "Medicine", qualification: "MBBS, MD", departmentSlug: "general-medicine" },
  { slug: "dr-rajeev", name: "DR. RAJEEV", speciality: "General Physician", departmentSlug: "general-medicine", photo: "/assets/doctors/dr-rajeev.webp" },
  { slug: "dr-devender", name: "DR. DEVENDER", speciality: "General Physician", departmentSlug: "general-medicine", photo: "/assets/doctors/dr-devender.webp" },
  { slug: "dr-chanderkanta-arya", name: "DR. CHANDERKANTA ARYA", speciality: "Obs & Gyn", qualification: "MBBS, DGO", departmentSlug: "obstetrics-and-gynecology", photo: "/assets/doctors/dr-chanderkanta-arya.webp" },
  { slug: "dr-jaidev", name: "DR. JAIDEV", speciality: "Nephrologist", qualification: "MBBS, MD", departmentSlug: "general-medicine" },
  { slug: "dr-rukma", name: "DR. RUKMA", speciality: "Neurologist", qualification: "MBBS, MD", departmentSlug: "neurology", photo: "/assets/doctors/dr-rukma.webp" },
  { slug: "dr-rohit-arora", name: "DR. ROHIT ARORA", speciality: "Ortho", qualification: "MBBS, MS, M.Ch", departmentSlug: "orthopaedic-surgery" },
  { slug: "dr-anurag-singh-thakur", name: "DR. ANURAG SINGH THAKUR", speciality: "Paedia", qualification: "MBBS, MD", departmentSlug: "paediatrics" },
  { slug: "dr-ankur-popat", name: "DR. ANKUR POPAT", speciality: "General Surgeon", qualification: "MBBS, MS", departmentSlug: "general-surgery", photo: "/assets/doctors/dr-ankur-popat.webp" },
  { slug: "dr-ashwani-yadav", name: "DR. ASHWANI YADAV", speciality: "Critical Care", qualification: "MBBS, MD", departmentSlug: "general-medicine" },
  { slug: "dr-vikas-tiwadi", name: "DR. VIKAS TIWADI", speciality: "Critical Care", qualification: "MBBS, MD", departmentSlug: "general-medicine" },
  { slug: "dr-pankaj-mittal", name: "Dr Pankaj Mittal", speciality: "General Medicine", qualification: "MBBS, MD", departmentSlug: "general-medicine" },
  { slug: "dr-vikram-dagar", name: "Dr Vikram Dagar", speciality: "Orthopaedic", qualification: "MBBS, MS", departmentSlug: "orthopaedic-surgery" },
  { slug: "dr-sonam", name: "Dr Sonam", speciality: "Obs & Gynae", qualification: "MBBS, MS", departmentSlug: "obstetrics-and-gynecology" },
  { slug: "dr-rajesh-kumar-rathi", name: "Dr Rajesh Kumar Rathi", speciality: "Paediatric", qualification: "MBBS, MD", departmentSlug: "paediatrics" },
  { slug: "dr-vikas-tiwari", name: "Dr Vikas Tiwari", speciality: "Anesthesiology", qualification: "MBBS, MD", departmentSlug: "anaesthesiology" },
  { slug: "dr-sahil-kapoor", name: "DR. SAHIL KAPOOR", speciality: "ENT", qualification: "MBBS, MS", departmentSlug: "ent", photo: "/assets/doctors/dr-sahil-kapoor.webp" },
  { slug: "dr-apurva-nagesh-sharma", name: "DR. APURVA NAGESH SHARMA", speciality: "Neurology", qualification: "MBBS, MD", departmentSlug: "neurology" },
  { slug: "dr-uddhavesh-mukund-paithankar", name: "DR. UDDHAVESH MUKUND PAITHANKAR", speciality: "Gastroenterology", qualification: "MBBS, MD", departmentSlug: "medical-gastroenterology", photo: "/assets/doctors/dr-uddhavesh-mukund-paithankar.webp" },
  { slug: "dr-praveen-kumar-yadav", name: "DR. PRAVEEN KUMAR YADAV", speciality: "Urology", qualification: "MBBS, MS, M.Ch", departmentSlug: "urology", photo: "/assets/doctors/dr-praveen-kumar-yadav.webp" },
  { slug: "dr-pritam", name: "DR. PRITAM", speciality: "Dentist", qualification: "MDS", departmentSlug: "dental" },
  { slug: "dr-manish-kumar", name: "DR. MANISH KUMAR", speciality: "Physiotherapy", qualification: "BPT", departmentSlug: "physiotherapy" },
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
  "Health Indias Insurance TPA",
  "Good Health Insurance TPA",
  "Park Mediclaim Insurance TPA",
  "Safeway Insurance TPA (Health Assist TPA)",
  "Ericson Insurance TPA",
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
  "NIVA Bupa Insurance TPA",
  "Chola MS Insurance TPA",
  "Manipal Cigna Insurance TPA",
  "National Insurance",
  "United Insurance",
  "The New India Insurance",
  "Universal Sompoo Insurance TPA",
  "Royal Sundaram Insurance TPA",
  "Liberty General Insurance",
  "Shri Ram General Insurance TPA",
  "Future Generali Insurance TPA",
].map((name, index) => ({
  id: index + 1,
  name,
  logo: `/assets/tpa/display/panel-${index + 1}.png`,
}));

export const publicNav = [
  { href: "/", label: "Home" },
  { href: "/departments", label: "Departments" },
  { href: "/doctors", label: "Doctors" },
  { href: "/tpa-insurance", label: "TPA" },
  { href: "/testimonials", label: "Testimonials" },
  { href: "/blog", label: "Blog" },
  { href: "/careers", label: "Careers" },
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
    status: "approved",
  },
  {
    slug: "tpa-cashless-support",
    title: "Understanding TPA and Cashless Assistance",
    excerpt: "What patients should know before asking about cashless approval and documentation.",
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
