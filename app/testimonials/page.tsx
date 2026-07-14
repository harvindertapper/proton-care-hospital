import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL } from "@/app/lib/data";
import { getPublishedReviews, getPublishedVideos } from "@/app/lib/public-data";
import { PageHero, PageShell, SectionHeader } from "@/app/components/SiteShell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Patient Testimonials",
  description: "Read patient testimonials, reviews, and success stories from those who received care at Protone Care Hospital.",
  alternates: { canonical: `${SITE_URL}/testimonials` },
};

export default async function TestimonialsPage() {
  const [reviews, videos] = await Promise.all([getPublishedReviews(), getPublishedVideos()]);
  return (
    <PageShell>
      <PageHero
        eyebrow="Testimonials"
        title="What Our Patients Say"
        body="Read genuine experiences shared by patients who have trusted us with their health."
      />
      <section className="section">
        <div className="container">
          <SectionHeader eyebrow="Reviews" title="Patient Reviews" />
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
              No patient reviews have been published yet. Share your experience with us by submitting your feedback.
              <div className="action-row"><Link href="/feedback" className="button subtle">Submit Feedback</Link></div>
            </div>
          )}
        </div>
      </section>
      <section className="section alt">
        <div className="container">
          <SectionHeader eyebrow="Video stories" title="Video Testimonials" />
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
            <div className="empty-state">No video testimonials are currently available. Check back soon.</div>
          )}
        </div>
      </section>
    </PageShell>
  );
}
