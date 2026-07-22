"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Play, X } from "lucide-react";

const YT_ID_RE = /^[A-Za-z0-9_-]{11}$/;

function isValidYoutubeId(id: string): boolean {
  return YT_ID_RE.test(id);
}

function thumbnailUrl(id: string, fallback: boolean): string {
  return fallback
    ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
    : `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`;
}

function embedUrl(id: string): string {
  return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&playsinline=1`;
}

type VideoItem = {
  id: string;
  title: string;
  youtube_id: string;
};

type Props = {
  videos: VideoItem[];
};

function ThumbnailImg({
  id,
  title,
  className,
  style,
}: {
  id: string;
  title: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [src, setSrc] = useState(thumbnailUrl(id, false));
  return (
    <img
      src={src}
      alt={title}
      className={className}
      style={style}
      loading="lazy"
      decoding="async"
      onError={() => setSrc(thumbnailUrl(id, true))}
    />
  );
}

function PlayButton({
  _id,
  title,
  size,
  onClick,
}: {
  _id: string;
  title: string;
  size: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="ps-play-btn"
      style={{ width: size, height: size }}
      aria-label={`Play patient story: ${title}`}
      onClick={onClick}
    >
      <Play size={size * 0.38} fill="var(--story-navy)" color="var(--story-navy)" aria-hidden="true" />
    </button>
  );
}

function FeaturedCard({
  video,
  onPlay,
}: {
  video: VideoItem;
  onPlay: (v: VideoItem) => void;
}) {
  return (
    <article className="ps-featured" data-testid="featured-story">
      <div className="ps-featured-media">
        <ThumbnailImg id={video.youtube_id} title={video.title} className="ps-featured-thumb" />
        <div className="ps-featured-overlay">
          <PlayButton _id={video.youtube_id} title={video.title} size={68} onClick={() => onPlay(video)} />
        </div>
      </div>
      <div className="ps-featured-content">
        <span className="ps-badge featured-badge">Featured Patient Story</span>
        <h3 className="ps-featured-title">{video.title}</h3>
        <p className="ps-featured-subtitle">Watch this patient experience</p>
        <button type="button" className="ps-watch-btn" onClick={() => onPlay(video)}>
          <Play size={16} fill="white" color="white" aria-hidden="true" /> Watch Story
        </button>
        <span className="ps-meta">Plays via YouTube</span>
      </div>
    </article>
  );
}

function StandardCard({
  video,
  onPlay,
}: {
  video: VideoItem;
  onPlay: (v: VideoItem) => void;
}) {
  return (
    <article className="ps-card" data-testid="story-card">
      <div className="ps-card-media">
        <ThumbnailImg id={video.youtube_id} title={video.title} className="ps-card-thumb" />
        <div className="ps-card-overlay" />
        <span className="ps-badge card-badge">Patient Story</span>
        <h3 className="ps-card-title">{video.title}</h3>
        <div className="ps-card-play-wrap">
          <PlayButton _id={video.youtube_id} title={video.title} size={58} onClick={() => onPlay(video)} />
        </div>
      </div>
      <div className="ps-card-body">
        <span className="ps-card-cta">
          Watch patient story <Play size={13} fill="currentColor" color="currentColor" aria-hidden="true" />
        </span>
        <span className="ps-meta">Plays via YouTube</span>
      </div>
    </article>
  );
}

function Modal({
  video,
  onClose,
  triggerRef,
}: {
  video: VideoItem;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const el = dialogRef.current;
    if (el && !el.open) {
      el.showModal();
    }
  }, []);

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  const handleClose = useCallback(() => {
    const el = dialogRef.current;
    if (el?.open) el.close();
    onClose();
    requestAnimationFrame(() => {
      triggerRef.current?.focus();
    });
  }, [onClose, triggerRef]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") handleClose();
    }
    const el = dialogRef.current;
    el?.addEventListener("keydown", onKey);
    return () => el?.removeEventListener("keydown", onKey);
  }, [handleClose]);

  return (
    <dialog
      ref={dialogRef}
      className="ps-modal"
      onClose={handleClose}
      data-testid="story-modal"
      aria-label={`Patient story: ${video.title}`}
    >
      <div className="ps-modal-inner">
        <div className="ps-modal-header">
          <div>
            <span className="ps-modal-label">Patient Story</span>
            <h2 className="ps-modal-title">{video.title}</h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="ps-modal-close"
            aria-label="Close video"
            onClick={handleClose}
          >
            <X size={22} aria-hidden="true" />
          </button>
        </div>
        <div className="ps-modal-player">
          <iframe
            src={embedUrl(video.youtube_id)}
            title={`Patient story video: ${video.title}`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      </div>
    </dialog>
  );
}

export default function PatientStoriesGallery({ videos }: Props) {
  const [selectedVideo, setSelectedVideo] = useState<VideoItem | null>(null);

  const validVideos = videos.filter((v) => isValidYoutubeId(v.youtube_id));
  const featured = validVideos[0] ?? null;
  const rest = validVideos.slice(1);

  const handlePlay = useCallback((v: VideoItem) => {
    setSelectedVideo(v);
  }, []);

  const handleClose = useCallback(() => {
    setSelectedVideo(null);
  }, []);

  if (!featured) {
    return (
      <div className="empty-state">
        No video testimonials are currently available. Check back soon.
      </div>
    );
  }

  return (
    <div className="ps-gallery" data-testid="patient-stories-gallery">
      <div className="ps-intro">
        <span className="eyebrow">Patient Stories</span>
        <h2>Real experiences. Thoughtfully shared.</h2>
        <p>Watch experiences shared by patients and families with publication consent.</p>
      </div>

      <FeaturedCard video={featured} onPlay={handlePlay} />

      {rest.length > 0 && (
        <div className="ps-grid" data-testid="supporting-grid">
          {rest.map((v) => (
            <StandardCard key={v.id} video={v} onPlay={handlePlay} />
          ))}
        </div>
      )}

      {selectedVideo && (
        <Modal video={selectedVideo} onClose={handleClose} triggerRef={{ current: null }} />
      )}
    </div>
  );
}
