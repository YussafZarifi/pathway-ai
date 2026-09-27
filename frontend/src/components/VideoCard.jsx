import { useState } from "react";
import { PlayCircle, Search } from "lucide-react";

/**
 * The one YouTube preview card used across the app (roadmap steps and
 * Today's focus).
 *
 * - video: {title, channel, thumbnail, url} renders a real video.
 * - searchUrl (and no video): the same card shell linking to a YouTube
 *   search, for steps where the API returned no videos.
 *
 * The thumbnail is lazy-loaded; if it's missing or fails to load, a
 * placeholder is shown instead of a broken image. The same thumbnail URL
 * is reused everywhere, so the browser cache serves repeats. The image is
 * decorative (alt=""): the link's accessible name carries the title and
 * channel.
 */
export default function VideoCard({ video, searchUrl, compact = false }) {
  const [thumbFailed, setThumbFailed] = useState(false);

  const isSearch = !video;
  const href = isSearch ? searchUrl : video.url;
  if (!href) return null;

  const title = isSearch ? "Search YouTube for this step" : video.title;
  const meta = isSearch ? "No video found yet · opens YouTube search" : `${video.channel} · YouTube`;
  const label = isSearch
    ? "Search YouTube for this step (opens in a new tab)"
    : `Watch "${video.title}" by ${video.channel} on YouTube (opens in a new tab)`;
  const showImage = !isSearch && video.thumbnail && !thumbFailed;

  return (
    <a
      className={`videoCard ${compact ? "videoCard--compact" : ""} ${isSearch ? "videoCard--search" : ""}`}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
    >
      <span className={`videoThumb ${showImage ? "" : "videoThumb--placeholder"}`}>
        {showImage && (
          <img
            src={video.thumbnail}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setThumbFailed(true)}
          />
        )}
        <span className="videoThumbIcon" aria-hidden="true">
          {isSearch ? <Search size={20} /> : <PlayCircle size={compact ? 22 : 26} />}
        </span>
      </span>
      <span className="videoText">
        <span className="videoTitle">{title}</span>
        <span className="videoMeta">{meta}</span>
      </span>
    </a>
  );
}
