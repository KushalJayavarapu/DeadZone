import { test } from "node:test";
import assert from "node:assert/strict";
import type { SOSRequest } from "@deadzone/schema";
import { applyStatusUpdate, publicStatus } from "./status";

const base: SOSRequest = {
  id: "b1a2c3d4-0001-4a11-8b11-000000000001",
  deviceId: "d1a2c3d4-0001-4a11-8b11-100000000001",
  incidentType: "medical",
  priority: "critical",
  victimCount: 2,
  description: "2 people affected",
  geo: { lat: 12.97, lng: 77.59 },
  status: "new",
  createdAt: "2026-11-21T09:00:00.000Z",
};

test("acknowledge moves a new SOS forward and stamps updatedAt", () => {
  const next = applyStatusUpdate(base, { sosId: base.id, status: "acknowledged", at: "2026-11-21T09:01:00.000Z" });
  assert.equal(next?.status, "acknowledged");
  assert.equal(next?.updatedAt, "2026-11-21T09:01:00.000Z");
  assert.equal(next?.assignedTeams, undefined);
});

test("dispatch records the teams", () => {
  const next = applyStatusUpdate(base, {
    sosId: base.id,
    status: "dispatched",
    teams: ["NDRF Alpha", "Fire Unit 3"],
    at: "2026-11-21T09:02:00.000Z",
  });
  assert.deepEqual(next?.assignedTeams, ["NDRF Alpha", "Fire Unit 3"]);
});

test("the same update twice is a no-op the second time", () => {
  const u = { sosId: base.id, status: "acknowledged" as const, at: "2026-11-21T09:01:00.000Z" };
  const once = applyStatusUpdate(base, u)!;
  assert.equal(applyStatusUpdate(once, u), null);
});

test("an older update arriving late does not overwrite a newer one", () => {
  const dispatched = applyStatusUpdate(base, {
    sosId: base.id,
    status: "dispatched",
    teams: ["NDRF Alpha"],
    at: "2026-11-21T09:05:00.000Z",
  })!;
  const lateAck = applyStatusUpdate(dispatched, { sosId: base.id, status: "acknowledged", at: "2026-11-21T09:01:00.000Z" });
  assert.equal(lateAck, null);
});

test("a newer update can undo a dispatch and clears the teams", () => {
  const dispatched = applyStatusUpdate(base, {
    sosId: base.id,
    status: "dispatched",
    teams: ["NDRF Alpha"],
    at: "2026-11-21T09:05:00.000Z",
  })!;
  const undone = applyStatusUpdate(dispatched, { sosId: base.id, status: "acknowledged", teams: [], at: "2026-11-21T09:06:00.000Z" })!;
  assert.equal(undone.status, "acknowledged");
  assert.equal(undone.assignedTeams, undefined);
});

test("refuses an update addressed to a different SOS", () => {
  assert.throws(() =>
    applyStatusUpdate(base, { sosId: "b1a2c3d4-0002-4a11-8b11-000000000002", status: "acknowledged", at: "2026-11-21T09:01:00.000Z" }),
  );
});

test("publicStatus exposes only what the victim's screen needs", () => {
  const s = publicStatus({ ...base, reporterPhone: "+91-9800000001", bloodGroup: "O+" });
  assert.deepEqual(Object.keys(s).sort(), ["assignedTeams", "createdAt", "id", "status", "updatedAt"]);
});
