import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  normalizeCommentLink,
  parsePlayThreadCommentLink,
} from "../commentLinks.js";

const POST_ID = "123e4567-e89b-12d3-a456-426614174000";
const COMMENT_ID = "223e4567-e89b-12d3-a456-426614174111";

describe("comment link helpers", () => {
  it("normalizes PlayThread post links", () => {
    assert.deepEqual(
      normalizeCommentLink({
        label: "that thread",
        url: `https://www.playthread.app/post/${POST_ID}?utm_source=x`,
      }),
      {
        label: "that thread",
        url: `https://playthread.app/post/${POST_ID}`,
        postId: POST_ID,
        commentId: null,
      },
    );
  });

  it("normalizes PlayThread comment links", () => {
    assert.deepEqual(
      parsePlayThreadCommentLink(`/post/${POST_ID}?comment=${COMMENT_ID}`),
      {
        url: `https://playthread.app/post/${POST_ID}?comment=${COMMENT_ID}`,
        postId: POST_ID,
        commentId: COMMENT_ID,
      },
    );
  });

  it("rejects external links", () => {
    assert.throws(
      () => normalizeCommentLink({ label: "not allowed", url: "https://example.com/post/123" }),
      /Only PlayThread post and comment links/,
    );
  });

  it("requires matching label and URL values", () => {
    assert.throws(
      () => normalizeCommentLink({ label: "missing url", url: "" }),
      /Add both link text/,
    );
  });
});
