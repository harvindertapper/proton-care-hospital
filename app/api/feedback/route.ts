import {
  audit,
  checkIdempotency,
  checkRateLimit,
  getClientIp,
  isHoneypotTriggered,
  json,
  normalizePhone,
  run,
  saveIdempotency,
  sanitizeHtml,
  validatePhone,
  verifyTurnstile,
} from "@/app/lib/server";
import { clean } from "@/app/lib/utils";

const FEEDBACK_PHONE_DAILY_LIMIT = 3;

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const body = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;

  if (isHoneypotTriggered(body)) {
    return json({ success: true });
  }

  const limit = await checkRateLimit("feedback", ip, 2, 10 * 60);

  if (!limit.ok) {
    return json(
      {
        error: "Please wait before submitting more feedback.",
        code: "FEEDBACK_RATE_LIMITED",
      },
      { status: 429 },
    );
  }

  const patientName = sanitizeHtml(clean(body.patientName, 100));
  const phone = normalizePhone(clean(body.phone, 20));
  const rating = Number(body.rating || 0);
  const message = sanitizeHtml(clean(body.message, 1500));
  const consent = body.consent === true;
  const publicConsent = body.publicConsent === true;
  const requestedPublicationName = clean(body.publicationName, 20);
  const publicationName =
    publicConsent && requestedPublicationName === "named"
      ? "named"
      : "anonymous";

  if (patientName.length < 2) {
    return json(
      {
        error:
          "Please enter at least 2 characters for the patient name.",
        code: "FEEDBACK_VALIDATION_FAILED",
        field: "patientName",
      },
      { status: 400 },
    );
  }

  if (!validatePhone(phone)) {
    return json(
      {
        error:
          "Please enter a valid 10-digit Indian mobile number.",
        code: "FEEDBACK_VALIDATION_FAILED",
        field: "phone",
      },
      { status: 400 },
    );
  }

  if (
    !Number.isInteger(rating) ||
    rating < 1 ||
    rating > 5
  ) {
    return json(
      {
        error: "Please select a rating from 1 to 5.",
        code: "FEEDBACK_VALIDATION_FAILED",
        field: "rating",
      },
      { status: 400 },
    );
  }

  if (message.length < 10) {
    return json(
      {
        error:
          "Please enter at least 10 characters in your feedback.",
        code: "FEEDBACK_VALIDATION_FAILED",
        field: "message",
      },
      { status: 400 },
    );
  }

  if (!consent) {
    return json(
      {
        error:
          "Please accept the review and contact consent checkbox.",
        code: "FEEDBACK_VALIDATION_FAILED",
        field: "consent",
      },
      { status: 400 },
    );
  }

  const idempotencyKey =
    request.headers.get("idempotency-key") ||
    clean(body.idempotencyKey, 100);

  const idempotencyPayload = {
    patientName,
    phone,
    rating,
    message,
    consent,
    publicConsent,
    publicationName,
  };

  if (idempotencyKey) {
    try {
      const cached = await checkIdempotency(
        idempotencyKey,
        idempotencyPayload,
      );

      if (cached) {
        return json(cached);
      }
    } catch (error) {
      return json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Idempotency check failed.",
          code: "FEEDBACK_IDEMPOTENCY_FAILED",
        },
        { status: 400 },
      );
    }
  }

  const turnstile = await verifyTurnstile(
    clean(body.turnstileToken, 2000),
    ip,
  );

  if (!turnstile.ok) {
    return json(
      {
        error:
          "Security verification failed. Please complete the verification again.",
        code: "TURNSTILE_VERIFICATION_FAILED",
      },
      { status: 403 },
    );
  }

  const phoneLimit = await checkRateLimit(
    "feedback-phone",
    phone,
    FEEDBACK_PHONE_DAILY_LIMIT,
    24 * 60 * 60,
  );

  if (!phoneLimit.ok) {
    return json(
      {
        error: `Daily limit reached. Maximum of ${FEEDBACK_PHONE_DAILY_LIMIT} feedback submissions per phone number within 24 hours.`,
        code: "FEEDBACK_PHONE_RATE_LIMITED",
      },
      { status: 429 },
    );
  }

  const id = crypto.randomUUID();

  await run(
    `INSERT INTO feedback
      (
        id,
        patient_name,
        phone,
        rating,
        message,
        consent,
        public_consent,
        publication_name,
        otp_verified
      )
      VALUES (?, ?, ?, ?, ?, 1, ?, ?, 0)`,
    id,
    patientName,
    phone,
    rating,
    message,
    publicConsent ? 1 : 0,
    publicationName,
  );

  await audit(
    "system",
    "FEEDBACK_SUBMITTED",
    "Feedback",
    id,
    `Feedback submitted by ${patientName}; publicConsent=${publicConsent}; publicationName=${publicationName}; needs review`,
  );

  const responseData = {
    success: true,
    message:
      "Thank you. Your feedback has been submitted for hospital review.",
  };

  if (idempotencyKey) {
    await saveIdempotency(
      idempotencyKey,
      idempotencyPayload,
      responseData,
    );
  }

  return json(responseData);
}
