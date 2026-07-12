import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL } from "@/app/lib/data";
import { getPublishedReviews, getPublishedVideos } from "@/app/lib/public-data";
import { PageHero, PageShell, SectionHeader } from "@/app/components/SiteShell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Patient Testimonials",
  description: "Approved patient feedback and video testimonials for Protone Care Hospital. Public display requires consent and admin approval.",
  alternates: { canonical: `${SITE_URL}/testimonials` },
};

export default async function TestimonialsPage() {
  const [reviews, videos] = await Promise.all([getPublishedReviews(), getPublishedVideos()]);
  return (
    <PageShell>
      <PageHero
        eyebrow="Testimonials"
        title="Patient stories after consent and approval"
        body="Written feedback and YouTube videos appear here only after phone verification, consent, and admin approval."
      />
      <section className="section">
        <div className="container">
          <SectionHeader eyebrow="Reviews" title="Approved patient feedback" />
          {reviews.length ? (
            <div className="testimonial-grid">
              {reviews.map((review) => (
                <article className="testimonial-card" key={review.id}>
                  <strong>{review.patient_name}</strong>
                  <span>{"★".repeat(Number(review.rating || 0))}</span>
                  <p>{review.message}</p>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              Approved patient reviews will appear here after verification, consent, and super admin review.
              <div className="action-row"><Link href="/feedback" className="button subtle">Submit feedback</Link></div>
            </div>
          )}
        </div>
      </section>
      <section className="section alt">
        <div className="container">
          <SectionHeader eyebrow="Video stories" title="Approved patient videos" />
          {videos.length ? (
            <div className="video-grid">
              {videos.map((video) => (
                <article className="video-card" key={video.id}>
                  <iframe title={video.title} src={`https://www.youtube.com/embed/${video.youtube_id}`} loading="lazy" allowFullScreen />
                  <h3>{video.title}</h3>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">Approved patient video testimonials will appear here once YouTube links and consent notes are reviewed.</div>
          )}
        </div>
      </section>
    </PageShell>
  );
}
