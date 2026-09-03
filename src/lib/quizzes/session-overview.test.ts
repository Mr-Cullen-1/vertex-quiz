import { test } from "node:test";
import assert from "node:assert/strict";
import { computeSessionOverview } from "./session-overview.ts";

test("no sessions: everything is zero or null, never a misleading 0%", () => {
  const result = computeSessionOverview([]);
  assert.deepEqual(result, {
    sessions: 0,
    completed: 0,
    expired: 0,
    completionRate: null,
    averageScore: null,
  });
});

test("sessions still in progress contribute to the count but not to average score", () => {
  const result = computeSessionOverview([
    { status: "started", score: null },
    { status: "in_progress", score: null },
  ]);
  assert.equal(result.sessions, 2);
  assert.equal(result.completed, 0);
  assert.equal(result.completionRate, 0);
  assert.equal(result.averageScore, null);
});

test("completion rate counts completed only, out of every session (nothing excluded from the denominator)", () => {
  const result = computeSessionOverview([
    { status: "completed", score: 100 },
    { status: "completed", score: 80 },
    { status: "expired", score: 40 },
    { status: "started", score: null },
  ]);
  assert.equal(result.sessions, 4);
  assert.equal(result.completed, 2);
  assert.equal(result.expired, 1);
  assert.equal(result.completionRate, 50); // 2/4
});

test("average score includes completed AND expired sessions with a persisted score", () => {
  const result = computeSessionOverview([
    { status: "completed", score: 100 },
    { status: "expired", score: 50 },
  ]);
  assert.equal(result.averageScore, 75);
});

test("a session with no persisted score (e.g. still in progress) is excluded from the average, not treated as 0", () => {
  const result = computeSessionOverview([
    { status: "completed", score: 100 },
    { status: "started", score: null },
  ]);
  assert.equal(result.averageScore, 100);
});

test("average score is rounded to a whole number", () => {
  const result = computeSessionOverview([
    { status: "completed", score: 100 },
    { status: "completed", score: 99 },
    { status: "completed", score: 99 },
  ]);
  assert.equal(result.averageScore, 99); // 99.33... rounds to 99
});
