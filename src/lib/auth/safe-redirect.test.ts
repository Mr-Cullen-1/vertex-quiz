import { test } from "node:test";
import assert from "node:assert/strict";
import { getSafeRedirectPath } from "./safe-redirect.ts";

test("a normal relative path is passed through unchanged", () => {
  assert.equal(getSafeRedirectPath("/update-password"), "/update-password");
});

test("null (no ?next= at all) falls back to /", () => {
  assert.equal(getSafeRedirectPath(null), "/");
});

test("an empty string falls back to /", () => {
  assert.equal(getSafeRedirectPath(""), "/");
});

test("an absolute URL to another host is rejected", () => {
  assert.equal(getSafeRedirectPath("https://evil.example.com/phish"), "/");
});

test("a protocol-relative //host path is rejected", () => {
  assert.equal(getSafeRedirectPath("//evil.example.com"), "/");
});

test("a path with no leading slash is rejected", () => {
  assert.equal(getSafeRedirectPath("update-password"), "/");
});
