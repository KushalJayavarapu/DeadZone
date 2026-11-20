import { z } from "zod";
import { SOSStatusSchema } from "./sos";

/**
 * Body of an Envelope with `type: "responder_status"`: a responder telling the
 * command node (and, through its fan-out, the victim's phone) what has
 * happened to one SOS.
 *
 * Added for the Think to Impact 3.0 build (closed-loop acknowledgement). Before
 * this, nothing ever travelled back to the victim: the tracking screen on the
 * phone showed a scripted "Acknowledged by Responder Alpha, 4 min ETA" that no
 * responder had sent. Every field here is something a responder actually did.
 *
 * `at` is the responder's clock. Updates for the same SOS are applied
 * last-write-wins on `at` (see apps/api/src/status.ts), matching the plain
 * last-write-wins rule the rest of the sync layer uses.
 */
export const ResponderStatusUpdateSchema = z.object({
  sosId: z.uuid(),
  status: SOSStatusSchema,
  /** Display names of the teams sent. Empty or absent means none assigned. */
  teams: z.array(z.string().min(1).max(80)).max(5).optional(),
  /** Who pressed the button, for the victim's screen. */
  responderName: z.string().max(80).optional(),
  at: z.iso.datetime(),
});
export type ResponderStatusUpdate = z.infer<typeof ResponderStatusUpdateSchema>;
