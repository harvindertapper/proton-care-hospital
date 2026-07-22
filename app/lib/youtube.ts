const YT_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const ALLOWED_YT_HOSTS = ["www.youtube.com", "youtube.com", "m.youtube.com", "youtu.be"];

export type YouTubeResolveResult = {
  id: string;
  sourceType: string;
};

export function resolveYouTubeId({
  youtubeId,
  youtubeUrl,
}: {
  youtubeId?: string;
  youtubeUrl?: string;
}): string | null {
  if (youtubeId && YT_ID_RE.test(youtubeId)) return youtubeId;
  if (!youtubeUrl) return null;

  let url: URL;
  try {
    url = new URL(youtubeUrl);
  } catch {
    return null;
  }

  if (url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (!ALLOWED_YT_HOSTS.includes(url.hostname)) return null;
  if (url.port && url.port !== "443" && url.port !== "") return null;

  let id: string | null = null;

  if (url.hostname === "youtu.be") {
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length === 1) id = segments[0];
  } else {
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments[0] === "watch" && url.searchParams.has("v")) {
      id = url.searchParams.get("v");
    } else if (segments[0] === "shorts" && segments.length === 2) {
      id = segments[1];
    } else if (segments[0] === "embed" && segments.length === 2) {
      id = segments[1];
    }
  }

  if (!id || !YT_ID_RE.test(id)) return null;
  return id;
}

export function resolveYouTubeIdWithType({
  youtubeId,
  youtubeUrl,
}: {
  youtubeId?: string;
  youtubeUrl?: string;
}): YouTubeResolveResult | null {
  if (youtubeId && YT_ID_RE.test(youtubeId)) {
    return { id: youtubeId, sourceType: "YouTube ID" };
  }
  if (!youtubeUrl) return null;

  let url: URL;
  try {
    url = new URL(youtubeUrl);
  } catch {
    return null;
  }

  if (url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (!ALLOWED_YT_HOSTS.includes(url.hostname)) return null;
  if (url.port && url.port !== "443" && url.port !== "") return null;

  let id: string | null = null;
  let sourceType = "";

  if (url.hostname === "youtu.be") {
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length === 1) {
      id = segments[0];
      sourceType = "YouTube share URL";
    }
  } else {
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments[0] === "watch" && url.searchParams.has("v")) {
      id = url.searchParams.get("v");
      sourceType = "YouTube watch URL";
    } else if (segments[0] === "shorts" && segments.length === 2) {
      id = segments[1];
      sourceType = "YouTube short URL";
    } else if (segments[0] === "embed" && segments.length === 2) {
      id = segments[1];
      sourceType = "YouTube embed URL";
    }
  }

  if (!id || !YT_ID_RE.test(id)) return null;
  return { id, sourceType };
}

export function thumbnailUrl(id: string, fallback: boolean): string {
  return fallback
    ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
    : `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`;
}

export function embedUrl(id: string): string {
  return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&playsinline=1`;
}
