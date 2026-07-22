"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Play, X } from "lucide-react";
import {
  resolveYouTubeId,
  thumbnailUrl as ytThumbnailUrl,
  embedUrl as ytEmbedUrl,
} from "@/app/lib/youtube";

type VideoItem = {
  id: string;
  title: string;
  youtube_id: string;
  youtube_url?: string;
};

type ResolvedVideo = VideoItem & { _resolvedId: string };

type Props = {
  videos: VideoItem[];
};

type PlayHandler = (v: ResolvedVideo, trigger: HTMLButtonElement) => void;

function ThumbnailImg({
  resolvedId,
  title,
  className,
  style,
}: {
  resolvedId: string;
  title: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [phase, setPhase] = useState<"maxres" | "hqdefault" | "unavailable">(
    "maxres",
  );

  if (phase === "unavailable") {
    return (
      <div
        className={className}
        style={{
          ...style,
          background: "var(--story-navy)",
        }}
        aria-hidden="true"
      />
    );
  }

  return (
    <img
      src={ytThumbnailUrl(resolvedId, phase === "hqdefault")}
      alt={title}
      className={className}
      style={style}
      loading="lazy"
      decoding="async"
      onError={() =>
        setPhase(phase === "maxres" ? "hqdefault" : "unavailable")
      }
    />
  );
}

function PlayButton({
  title,
  size,
  onClick,
}: {
  title: string;
  size: number;
  onClick: (trigger: HTMLButtonElement) => void;
}) {
  return (
    <button
      type="button"
      className="ps-play-btn"
      style={{ width: size, height: size }}
      aria-label={`Play patient story: ${title}`}
      onClick={(e) => onClick(e.currentTarget)}
    >
      <Play
        size={size * 0.38}
        fill="var(--story-navy)"
        color="var(--story-navy)"
        aria-hidden="true"
      />
    </button>
  );
}

function FeaturedCard({
  video,
  onPlay,
}: {
  video: ResolvedVideo;
  onPlay: PlayHandler;
}) {
  return (
    <article className="ps-featured" data-testid="featured-story">
      <div className="ps-featured-media">
        <ThumbnailImg
          key={video._resolvedId}
          resolvedId={video._resolvedId}
          title={video.title}
          className="ps-featured-thumb"
        />
        <div className="ps-featured-overlay">
          <PlayButton
            title={video.title}
            size={68}
            onClick={(trigger) => onPlay(video, trigger)}
          />
        </div>
      </div>
      <div className="ps-featured-content">
        <span className="ps-badge featured-badge">Featured Patient Story</span>
        <h3 className="ps-featured-title">{video.title}</h3>
        <p className="ps-featured-subtitle">Watch this patient experience</p>
        <button
          type="button"
          className="ps-watch-btn"
          onClick={(e) => onPlay(video, e.currentTarget)}
        >
          <Play size={16} fill="white" color="white" aria-hidden="true" />{" "}
          Watch Story
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
  video: ResolvedVideo;
  onPlay: PlayHandler;
}) {
  return (
    <article className="ps-card" data-testid="story-card">
      <div className="ps-card-media">
        <ThumbnailImg
          key={video._resolvedId}
          resolvedId={video._resolvedId}
          title={video.title}
          className="ps-card-thumb"
        />
        <div className="ps-card-overlay" />
        <span className="ps-badge card-badge">Patient Story</span>
        <h3 className="ps-card-title">{video.title}</h3>
        <div className="ps-card-play-wrap">
          <PlayButton
            title={video.title}
            size={58}
            onClick={(trigger) => onPlay(video, trigger)}
          />
        </div>
      </div>
      <div className="ps-card-body">
        <span className="ps-card-cta">
          Watch patient story{" "}
          <Play
            size={13}
            fill="currentColor"
            color="currentColor"
            aria-hidden="true"
          />
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
  video: ResolvedVideo;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const closingRef = useRef(false);

  useEffect(() => {
    const el = dialogRef.current;
    if (el && !el.open) el.showModal();
  }, []);

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  const finalizeClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    onClose();
    requestAnimationFrame(() => {
      triggerRef.current?.focus();
    });
  }, [onClose, triggerRef]);

  return (
    <dialog
      ref={dialogRef}
      className="ps-modal"
      onClose={finalizeClose}
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
            onClick={() => dialogRef.current?.close()}
          >
            <X size={22} aria-hidden="true" />
          </button>
        </div>
        <div className="ps-modal-player">
          <iframe
            src={ytEmbedUrl(video._resolvedId)}
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
  const [selectedVideo, setSelectedVideo] = useState<ResolvedVideo | null>(
    null,
  );
  const activeTriggerRef = useRef<HTMLButtonElement | null>(null);

  const resolvedVideos: ResolvedVideo[] = [];
  for (const v of videos) {
    const resolvedId = resolveYouTubeId({
      youtubeId: v.youtube_id,
      youtubeUrl: v.youtube_url,
    });
    if (resolvedId) resolvedVideos.push({ ...v, _resolvedId: resolvedId });
  }

  const featured = resolvedVideos[0] ?? null;
  const rest = resolvedVideos.slice(1);

  const handlePlay = useCallback(
    (v: ResolvedVideo, trigger: HTMLButtonElement) => {
      activeTriggerRef.current = trigger;
      setSelectedVideo(v);
    },
    [],
  );

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
        <p>
          Watch experiences shared by patients and families with publication
          consent.
        </p>
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
        <Modal
          video={selectedVideo}
          onClose={handleClose}
          triggerRef={activeTriggerRef}
        />
      )}
    </div>
  );
}
