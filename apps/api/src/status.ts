import type { ResponderStatusUpdate, SOSRequest } from "@deadzone/schema";

/**
 * Applies a responder's status update to a stored SOS.
 *
 * Returns the updated record, or null when the update is stale -- i.e. the
 * record already reflects something at least as recent. That makes the
 * operation idempotent: the same envelope delivered twice (a retry, a
 * reconnect) changes nothing the second time.
 *
 * Ordering is last-write-wins on the responder's timestamp, the same rule the
 * sync layer uses everywhere else (CLAUDE.md: "plain PouchDB sync,
 * last-write-wins"). A newer update may move status backwards -- that is how a
 * responder's "Undo" on a dispatch reaches the victim's phone.
 */
export function applyStatusUpdate<T extends SOSRequest>(sos: T, update: ResponderStatusUpdate): T | null {
  if (sos.id !== update.sosId) {
    throw new Error(`status update for ${update.sosId} applied to ${sos.id}`);
  }
  if (sos.updatedAt && Date.parse(sos.updatedAt) >= Date.parse(update.at)) {
    return null;
  }
  const teams = update.teams ?? [];
  const next: T = { ...sos, status: update.status, updatedAt: update.at };
  if (teams.length > 0) {
    next.assignedTeams = teams;
  } else {
    delete next.assignedTeams;
  }
  return next;
}

/** What the victim's phone needs to redraw its tracking screen. Nothing else. */
export function publicStatus(sos: SOSRequest) {
  return {
    id: sos.id,
    status: sos.status,
    assignedTeams: sos.assignedTeams ?? [],
    createdAt: sos.createdAt,
    updatedAt: sos.updatedAt ?? null,
  };
}
