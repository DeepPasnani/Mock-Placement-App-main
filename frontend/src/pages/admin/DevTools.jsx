import { useState } from 'react';
import { Alert, Tabs, Btn } from '../../components/shared/UI';

/* ═══════════════════════════════════════════════════════════
 * Dev Tools — quick access to the local pgAdmin and Judge0
 * instances started via docker-compose (see infra/judge0/ and
 * docker-compose.yml). Visible to both `admin` and `super_admin`
 * — same access level as the rest of /admin.
 *
 * Both tools run as separate services on their own ports, so we
 * embed them in an iframe for convenience, but always show an
 * "Open in new tab" escape hatch since some tools (pgAdmin in
 * particular) may refuse to render in an iframe depending on how
 * it's configured, and browsers give no reliable way to detect
 * that from the parent page.
 * ═══════════════════════════════════════════════════════════ */

const TOOLS = {
  pgadmin: {
    label: 'pgAdmin',
    url: import.meta.env.VITE_PGADMIN_URL || 'http://localhost:8467',
    description: 'Browse and query the Postgres database directly.',
  },
  judge0: {
    label: 'Judge0',
    url: import.meta.env.VITE_JUDGE0_URL || 'http://localhost:2358',
    description: 'Self-hosted code execution engine used for running and grading coding submissions.',
  },
};

export default function DevTools() {
  const [active, setActive] = useState('pgadmin');
  const [iframeError, setIframeError] = useState({ pgadmin: false, judge0: false });
  const tool = TOOLS[active];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display font-bold text-xl text-ink">Dev Tools</h1>
        <p className="text-sm text-annotation mt-0.5">
          Quick links to the local pgAdmin and Judge0 instances running via Docker on this machine.
        </p>
      </div>

      <Alert type="warning">
        These point at services running on <strong>your own machine</strong> ({TOOLS.pgadmin.url} and {TOOLS.judge0.url}).
        They won't load here if the Docker containers aren't running, or if you're viewing CampusTrack from a different
        device than the one hosting them.
      </Alert>

      <Tabs
        tabs={[
          { id: 'pgadmin', label: 'pgAdmin' },
          { id: 'judge0', label: 'Judge0' },
        ]}
        active={active}
        onChange={setActive}
      />

      <div className="panel p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <div className="font-semibold text-sm text-ink">{tool.label}</div>
            <div className="text-xs text-annotation">{tool.description}</div>
          </div>
          <a href={tool.url} target="_blank" rel="noopener noreferrer">
            <Btn variant="ghost" size="sm">
              Open in new tab ↗
            </Btn>
          </a>
        </div>

        {iframeError[active] ? (
          <Alert type="error">
            Couldn't load {tool.label} at <code>{tool.url}</code> in an embedded view. Make sure the container is
            running (<code>docker-compose ps</code>), or use "Open in new tab" above instead.
          </Alert>
        ) : (
          <iframe
            key={active}
            src={tool.url}
            title={tool.label}
            className="w-full rounded-lg border border-rim"
            style={{ height: '70vh' }}
            onError={() => setIframeError((prev) => ({ ...prev, [active]: true }))}
          />
        )}
      </div>
    </div>
  );
}
