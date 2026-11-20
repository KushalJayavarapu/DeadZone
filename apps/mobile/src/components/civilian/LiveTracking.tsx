import { useEffect, useState } from 'react';
import TopBar from '../ui/TopBar';
import { MeshClient, type MeshStatus } from '../../services/mesh';
import { drainQueue } from '../../services/queue';
import { RESPONDER_CONFIG, getOrCreateDeviceId } from '../../config';
import { ResponderStatusUpdateSchema, type SOSStatus } from '@deadzone/schema';

/**
 * The victim's view of their own SOS after sending it.
 *
 * Closed-loop acknowledgement (added for Think to Impact 3.0). This screen
 * used to be a script: "sent 8 min ago, 5 hops, acknowledged by Responder
 * Alpha, 4 min ETA", none of which had happened. Every line below is now
 * something that did happen, with the time it happened:
 *
 *   Saved on this phone      -- the local write (always succeeds, no network)
 *   Delivered                -- the command node's ACK, or the SOS found on it
 *   Seen by a responder      -- a responder opened the incident on the map
 *   Rescue team dispatched   -- a responder pressed Dispatch, with team names
 *
 * Updates arrive live as `responder_status` envelopes on the socket. Because a
 * phone can be out of reach when the responder acts, it also asks the command
 * node for the current status (GET /sos/:id) every time the socket connects.
 *
 * There is deliberately no ETA and no moving team marker: nothing in this
 * build knows where a team is, and an invented countdown to a person waiting
 * for rescue is worse than none.
 */

interface Props {
  severity: string;
  people: number;
  onBack: () => void;
  userName: string;
  sent: { sosId: string; savedAt: string; deliveredAt: string | null } | null;
}

interface Progress {
  deliveredAt: string | null;
  status: SOSStatus;
  seenAt: string | null;
  seenBy: string | null;
  dispatchedAt: string | null;
  teams: string[];
}

const RANK: Record<SOSStatus, number> = {
  new: 0,
  acknowledged: 1,
  dispatched: 2,
  in_progress: 2,
  resolved: 3,
  closed: 3,
};

function clock(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function Elapsed({ since }: { since: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.max(0, Math.floor((now - Date.parse(since)) / 1000));
  const m = Math.floor(s / 60);
  return <>{m > 0 ? `${m}m ` : ''}{s % 60}s ago</>;
}

/** Folds a status (from a live envelope or a catch-up fetch) into what the screen shows. */
function advance(p: Progress, status: SOSStatus, at: string, teams: string[], by?: string): Progress {
  const next = { ...p, status };
  if (RANK[status] >= 1 && !next.seenAt) {
    next.seenAt = at;
    next.seenBy = by ?? null;
  }
  if (RANK[status] >= 2 && teams.length) {
    next.dispatchedAt = next.dispatchedAt ?? at;
    next.teams = teams;
  }
  if (RANK[status] < 2) {
    // A responder undid the dispatch.
    next.dispatchedAt = null;
    next.teams = [];
  }
  return next;
}

export default function LiveTracking({ severity, people, onBack, userName, sent }: Props) {
  const [link, setLink] = useState<MeshStatus>('connecting');
  const [p, setP] = useState<Progress>({
    deliveredAt: sent?.deliveredAt ?? null,
    status: 'new',
    seenAt: null,
    seenBy: null,
    dispatchedAt: null,
    teams: [],
  });
  const severityColor = severity === 'critical' ? '#FF4D4F' : severity === 'urgent' ? '#FFA940' : '#52C41A';
  const sosId = sent?.sosId;

  useEffect(() => {
    if (!sosId) return;
    let alive = true;

    // Ask the command node what it holds for this SOS. A 404 means it has not
    // arrived yet; anything else is "try again on the next connect".
    const catchUp = async () => {
      try {
        const r = await fetch(`/sos/${sosId}`);
        if (!alive || !r.ok) return;
        const s = (await r.json()) as { status: SOSStatus; assignedTeams: string[]; updatedAt: string | null };
        const at = s.updatedAt ?? new Date().toISOString();
        setP((prev) => {
          const delivered = { ...prev, deliveredAt: prev.deliveredAt ?? new Date().toISOString() };
          return RANK[s.status] > RANK[prev.status] || s.status !== prev.status
            ? advance(delivered, s.status, at, s.assignedTeams)
            : delivered;
        });
      } catch {
        /* offline: the socket's reconnect will bring us back here */
      }
    };

    const client: MeshClient = new MeshClient({
      meshUrl: RESPONDER_CONFIG.meshUrl,
      deviceId: getOrCreateDeviceId(),
      onStatusChange: (status) => {
        if (!alive) return;
        setLink(status);
        if (status === 'connected') {
          // Anything this phone saved while out of reach goes now, then sync up.
          drainQueue(client)
            .catch((err) => console.warn('[tracking] drain failed:', err))
            .finally(() => void catchUp());
        }
      },
      onEnvelope: (envelope) => {
        if (envelope.type !== 'responder_status') return;
        const u = ResponderStatusUpdateSchema.safeParse(envelope.body);
        if (!u.success || u.data.sosId !== sosId) return;
        setP((prev) => advance(prev, u.data.status, u.data.at, u.data.teams ?? [], u.data.responderName));
      },
    });
    client.connect().catch(() => {
      /* reconnects on its own; the link indicator says so */
    });

    // Safety net while the screen stays open.
    const poll = setInterval(() => {
      if (client.isConnected()) void catchUp();
    }, 15000);

    return () => {
      alive = false;
      clearInterval(poll);
      client.disconnect();
    };
  }, [sosId]);

  const steps = [
    {
      label: 'Saved on this phone',
      done: true,
      detail: sent ? clock(sent.savedAt) : '',
    },
    {
      label: 'Delivered to the command node',
      done: Boolean(p.deliveredAt),
      detail: p.deliveredAt ? clock(p.deliveredAt) : 'Waiting. It sends by itself when the link returns.',
    },
    {
      label: 'Seen by a responder',
      done: Boolean(p.seenAt),
      detail: p.seenAt ? `${clock(p.seenAt)}${p.seenBy ? ` · ${p.seenBy}` : ''}` : p.deliveredAt ? 'Waiting for a responder to open it' : '',
    },
    {
      label: 'Rescue team dispatched',
      done: Boolean(p.dispatchedAt),
      detail: p.dispatchedAt ? `${clock(p.dispatchedAt)} · ${p.teams.join(', ')}` : '',
    },
  ];
  const currentIdx = steps.findIndex((s) => !s.done);

  const linkText =
    link === 'connected'
      ? 'Connected to the command node'
      : 'Not connected. Your SOS is safe on this phone; retrying…';
  const linkColor = link === 'connected' ? '#52C41A' : '#FFA940';

  return (
    <div className="flex-1 flex flex-col overflow-hidden" style={{ background: '#0B1220' }}>
      <TopBar title="Your SOS" onBack={onBack} onProfile={() => {}} userName={userName} />

      <div className="flex-1 overflow-y-auto flex flex-col px-4 py-4 gap-4">
        {/* My SOS card */}
        <div
          className="px-4 py-4 rounded flex items-start gap-3"
          style={{ background: '#131C2E', border: `1px solid ${severityColor}44` }}
        >
          <div
            className="w-3 h-3 rounded-full flex-shrink-0 mt-1"
            style={{ background: severityColor, boxShadow: `0 0 8px ${severityColor}` }}
          />
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <span
                className="font-semibold"
                style={{ fontSize: '15px', color: severityColor, textTransform: 'uppercase', letterSpacing: '0.06em' }}
              >
                {severity}
              </span>
              {sent && (
                <span style={{ fontSize: '13px', color: '#4A5A78', fontVariantNumeric: 'tabular-nums' }}>
                  Saved · <Elapsed since={sent.savedAt} />
                </span>
              )}
            </div>
            <div style={{ fontSize: '14px', color: '#8896B0', marginTop: 3 }}>
              {people} {people === 1 ? 'person' : 'people'}
            </div>
          </div>
        </div>

        {/* Link to the command node */}
        <div
          data-testid="link-status"
          className="px-4 py-3 rounded flex items-center gap-3"
          style={{ background: '#0D1829', border: '1px solid #243044' }}
        >
          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: linkColor }} />
          <span style={{ fontSize: '13px', color: '#C8D2E6' }}>{linkText}</span>
        </div>

        {/* Team card: only once a team really has been sent */}
        <div
          data-testid="team-card"
          className="px-4 py-4 rounded"
          style={{ background: '#131C2E', border: `1px solid ${p.dispatchedAt ? '#22D3EE' : '#243044'}` }}
        >
          {p.dispatchedAt ? (
            <>
              <div style={{ fontSize: '12px', color: '#4A5A78', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Help is on the way
              </div>
              <div className="font-semibold" style={{ fontSize: '17px', color: '#22D3EE', marginTop: 4 }}>
                {p.teams.join(', ')}
              </div>
              <div style={{ fontSize: '13px', color: '#8896B0', marginTop: 6 }}>
                Stay where you are if it is safe. Keep this screen open so you see updates.
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: '15px', color: '#F0F4FF', fontWeight: 600 }}>No team assigned yet</div>
              <div style={{ fontSize: '13px', color: '#8896B0', marginTop: 4 }}>
                You will see the team here the moment a responder dispatches one. Do not send the SOS again.
              </div>
            </>
          )}
        </div>

        {/* Status timeline */}
        <div className="px-4 py-4 rounded" style={{ background: '#131C2E', border: '1px solid #243044' }}>
          <div style={{ fontSize: '12px', color: '#4A5A78', fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 16 }}>
            What has happened
          </div>
          {steps.map((step, i) => {
            const current = i === currentIdx;
            const dot = step.done ? '#52C41A' : current ? '#22D3EE' : '#243044';
            return (
              <div key={step.label} className="flex items-start gap-4" style={{ marginBottom: i < steps.length - 1 ? 16 : 0 }}>
                <div className="flex flex-col items-center flex-shrink-0" style={{ width: 16 }}>
                  <div
                    className="rounded-full flex items-center justify-center"
                    style={{ width: 16, height: 16, background: dot, boxShadow: current ? `0 0 8px ${dot}` : 'none', transition: 'all 0.4s' }}
                  >
                    {step.done && (
                      <svg viewBox="0 0 10 10" fill="none" stroke="#0B1220" strokeWidth="2" strokeLinecap="round" className="w-2.5 h-2.5">
                        <polyline points="2 5 4.5 7.5 8 3" />
                      </svg>
                    )}
                  </div>
                  {i < steps.length - 1 && (
                    <div className="w-px flex-1 mt-1" style={{ background: step.done ? '#52C41A' : '#243044', minHeight: 20 }} />
                  )}
                </div>
                <div>
                  <div
                    style={{
                      fontSize: '15px',
                      fontWeight: step.done || current ? 600 : 400,
                      color: step.done ? '#52C41A' : current ? '#22D3EE' : '#4A5A78',
                    }}
                  >
                    {step.label}
                  </div>
                  {step.detail && (
                    <div style={{ fontSize: '12px', color: '#8896B0', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                      {step.detail}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
