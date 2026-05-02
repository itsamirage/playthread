import test from "node:test";
import assert from "node:assert/strict";

import {
  buildYouTubeEmbedUrl,
  buildYouTubeWatchUrl,
  extractYouTubeVideoId,
  findYouTubeVideoInText,
  isYouTubeVideoUrl,
  parseYouTubeVideoUrl,
} from "../youtube.js";

const VIDEO_ID = "dQw4w9WgXcQ";

test("extractYouTubeVideoId supports standard watch URLs", () => {
  assert.equal(extractYouTubeVideoId(`https://www.youtube.com/watch?v=${VIDEO_ID}`), VIDEO_ID);
  assert.equal(extractYouTubeVideoId(`https://m.youtube.com/watch?v=${VIDEO_ID}&feature=share`), VIDEO_ID);
});

test("extractYouTubeVideoId supports short, embed, shorts, live, and legacy URLs", () => {
  assert.equal(extractYouTubeVideoId(`https://youtu.be/${VIDEO_ID}`), VIDEO_ID);
  assert.equal(extractYouTubeVideoId(`https://www.youtube.com/embed/${VIDEO_ID}`), VIDEO_ID);
  assert.equal(extractYouTubeVideoId(`https://www.youtube.com/shorts/${VIDEO_ID}`), VIDEO_ID);
  assert.equal(extractYouTubeVideoId(`https://www.youtube.com/live/${VIDEO_ID}`), VIDEO_ID);
  assert.equal(extractYouTubeVideoId(`https://www.youtube.com/v/${VIDEO_ID}`), VIDEO_ID);
});

test("extractYouTubeVideoId supports URLs without protocols and nocookie embeds", () => {
  assert.equal(extractYouTubeVideoId(`youtu.be/${VIDEO_ID}`), VIDEO_ID);
  assert.equal(extractYouTubeVideoId(`www.youtube-nocookie.com/embed/${VIDEO_ID}`), VIDEO_ID);
});

test("extractYouTubeVideoId supports attribution links that wrap watch URLs", () => {
  const wrappedPath = encodeURIComponent(`/watch?v=${VIDEO_ID}&feature=share`);

  assert.equal(
    extractYouTubeVideoId(`https://www.youtube.com/attribution_link?u=${wrappedPath}`),
    VIDEO_ID,
  );
});

test("extractYouTubeVideoId rejects channel, playlist, invalid, and non-YouTube URLs", () => {
  assert.equal(extractYouTubeVideoId("https://www.youtube.com/@Halo/videos"), null);
  assert.equal(extractYouTubeVideoId("https://www.youtube.com/playlist?list=PL123"), null);
  assert.equal(extractYouTubeVideoId("https://example.com/watch?v=dQw4w9WgXcQ"), null);
  assert.equal(extractYouTubeVideoId("https://www.youtube.com/watch?v=too-short"), null);
});

test("parseYouTubeVideoUrl returns normalized attachment data", () => {
  assert.deepEqual(parseYouTubeVideoUrl(`https://youtu.be/${VIDEO_ID}`), {
    provider: "youtube",
    videoId: VIDEO_ID,
    watchUrl: `https://www.youtube.com/watch?v=${VIDEO_ID}`,
    embedUrl: `https://www.youtube-nocookie.com/embed/${VIDEO_ID}`,
  });
});

test("findYouTubeVideoInText finds the first playable YouTube URL", () => {
  assert.deepEqual(
    findYouTubeVideoInText(`watch this https://youtu.be/${VIDEO_ID}.`),
    {
      provider: "youtube",
      videoId: VIDEO_ID,
      watchUrl: `https://www.youtube.com/watch?v=${VIDEO_ID}`,
      embedUrl: `https://www.youtube-nocookie.com/embed/${VIDEO_ID}`,
    },
  );
});

test("buildYouTube URLs reject invalid video IDs", () => {
  assert.equal(buildYouTubeWatchUrl("invalid"), null);
  assert.equal(buildYouTubeEmbedUrl("invalid"), null);
  assert.equal(isYouTubeVideoUrl(`https://youtu.be/${VIDEO_ID}`), true);
  assert.equal(isYouTubeVideoUrl("https://www.youtube.com/@Halo/videos"), false);
});
