import {
  assertAdmin,
  corsHeaders,
  getAdminClient,
  getAuthenticatedUser,
  jsonResponse,
  requireProfile,
} from "../_shared/trusted.ts";

type YouTubeEntry = {
  videoId: string;
  channelId: string;
  title: string;
  url: string;
  publishedAt: string;
  updatedAt: string | null;
  channelTitle: string | null;
};

const YOUTUBE_VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_CHANNEL_ID_PATTERN = /^UC[A-Za-z0-9_-]{22}$/;
const YOUTUBE_BOT_USERNAME = "youtube_bot";

function decodeXml(value: string) {
  return String(value ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .trim();
}

function readTag(source: string, tagName: string) {
  const match = source.match(new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  return match?.[1] ? decodeXml(match[1]) : null;
}

function readLinkHref(source: string) {
  const match = source.match(/<link\s+rel="alternate"\s+href="([^"]+)"/i);
  return match?.[1] ? decodeXml(match[1]) : null;
}

function parseYouTubeFeed(xml: string): YouTubeEntry[] {
  const entries = xml.match(/<entry>[\s\S]*?<\/entry>/gi) ?? [];

  return entries
    .map((entry) => {
      const videoId = readTag(entry, "yt:videoId") ?? "";
      const channelId = readTag(entry, "yt:channelId") ?? "";
      const title = readTag(entry, "title") ?? "";
      const publishedAt = readTag(entry, "published") ?? "";
      const updatedAt = readTag(entry, "updated");
      const channelTitle = readTag(entry, "name");
      const url = readLinkHref(entry) ?? `https://www.youtube.com/watch?v=${videoId}`;

      if (!YOUTUBE_VIDEO_ID_PATTERN.test(videoId) || !YOUTUBE_CHANNEL_ID_PATTERN.test(channelId) || !title || !publishedAt) {
        return null;
      }

      return {
        videoId,
        channelId,
        title,
        url,
        publishedAt,
        updatedAt,
        channelTitle,
      };
    })
    .filter((entry): entry is YouTubeEntry => Boolean(entry));
}

async function fetchChannelEntries(channelId: string) {
  const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
  const response = await fetch(feedUrl, {
    headers: {
      "User-Agent": "PlayThreadBot/1.0 (+https://playthread.app)",
    },
  });

  if (!response.ok) {
    throw new Error(`YouTube feed returned ${response.status}.`);
  }

  return parseYouTubeFeed(await response.text());
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const adminClient = getAdminClient();
    const importSecret = Deno.env.get("YOUTUBE_IMPORT_SECRET")?.trim();
    const requestSecret = request.headers.get("x-youtube-import-secret")?.trim();

    if (!importSecret || requestSecret !== importSecret) {
      const user = await getAuthenticatedUser(request);
      const profile = await requireProfile(adminClient, user.id);
      assertAdmin(profile);
    }

    const configuredBotUserId = Deno.env.get("YOUTUBE_BOT_USER_ID")?.trim() ?? "";
    const botQuery = adminClient
      .from("profiles")
      .select("id")
      .limit(1);
    const { data: botProfile, error: botError } = configuredBotUserId
      ? await botQuery.eq("id", configuredBotUserId).maybeSingle()
      : await botQuery.eq("username", YOUTUBE_BOT_USERNAME).maybeSingle();

    if (botError) {
      throw new Error(botError.message);
    }

    if (!botProfile) {
      throw new Error("Create the YouTube Bot profile from the admin panel before running imports.");
    }

    const botUserId = botProfile.id;

    const { data: sources, error: sourcesError } = await adminClient
      .from("game_youtube_sources")
      .select("id, igdb_game_id, game_title, game_cover_url, channel_id, channel_title, enabled, autopost_started_at")
      .eq("enabled", true)
      .order("updated_at", { ascending: false });

    if (sourcesError) {
      throw new Error(sourcesError.message);
    }

    const imported: Array<{ sourceId: string; videoId: string; postId: string }> = [];
    const skipped: Array<{ sourceId: string; videoId?: string; reason: string }> = [];
    const failed: Array<{ sourceId: string; error: string }> = [];

    for (const source of sources ?? []) {
      try {
        const entries = await fetchChannelEntries(source.channel_id);
        const startedAt = new Date(source.autopost_started_at).getTime();
        let latestPublishedAt: string | null = null;

        for (const entry of entries.reverse()) {
          const publishedTime = new Date(entry.publishedAt).getTime();

          if (!Number.isFinite(publishedTime) || publishedTime < startedAt) {
            skipped.push({ sourceId: source.id, videoId: entry.videoId, reason: "before_autopost_start" });
            continue;
          }

          latestPublishedAt = !latestPublishedAt || new Date(entry.publishedAt).getTime() > new Date(latestPublishedAt).getTime()
            ? entry.publishedAt
            : latestPublishedAt;

          const { data: existingImport, error: existingError } = await adminClient
            .from("youtube_imported_posts")
            .select("id, post_id")
            .eq("source_id", source.id)
            .eq("youtube_video_id", entry.videoId)
            .maybeSingle();

          if (existingError) {
            throw new Error(existingError.message);
          }

          if (existingImport) {
            skipped.push({ sourceId: source.id, videoId: entry.videoId, reason: "already_imported" });
            continue;
          }

          const { data: post, error: postError } = await adminClient
            .from("posts")
            .insert({
              user_id: botUserId,
              igdb_game_id: source.igdb_game_id,
              game_title: source.game_title,
              game_cover_url: source.game_cover_url ?? null,
              type: "discussion",
              reaction_mode: "sentiment",
              title: entry.title,
              body: `Official YouTube upload from ${source.channel_title ?? entry.channelTitle ?? "YouTube"}.`,
              external_video_provider: "youtube",
              external_video_id: entry.videoId,
              external_video_url: entry.url,
              external_video_title: entry.title,
              video_status: "none",
              moderation_state: "clean",
              moderation_labels: [],
              spoiler: false,
              is_nsfw: false,
            })
            .select("id")
            .single();

          if (postError || !post?.id) {
            throw new Error(postError?.message ?? "Could not create imported post.");
          }

          const { error: importError } = await adminClient
            .from("youtube_imported_posts")
            .insert({
              source_id: source.id,
              igdb_game_id: source.igdb_game_id,
              channel_id: entry.channelId,
              youtube_video_id: entry.videoId,
              youtube_video_url: entry.url,
              youtube_video_title: entry.title,
              youtube_published_at: entry.publishedAt,
              post_id: post.id,
              import_status: "imported",
            });

          if (importError) {
            await adminClient.from("posts").delete().eq("id", post.id);
            throw new Error(importError.message);
          }

          imported.push({ sourceId: source.id, videoId: entry.videoId, postId: post.id });
        }

        await adminClient
          .from("game_youtube_sources")
          .update({
            last_checked_at: new Date().toISOString(),
            last_seen_video_published_at: latestPublishedAt,
            channel_title: source.channel_title ?? entries[0]?.channelTitle ?? null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", source.id);
      } catch (error) {
        failed.push({
          sourceId: source.id,
          error: error instanceof Error ? error.message : "Unknown import error.",
        });
      }
    }

    return jsonResponse({
      success: true,
      imported,
      skipped,
      failed,
    });
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unknown function error." },
      400,
    );
  }
});
