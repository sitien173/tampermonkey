import React from 'react';
import { useCookieHealth } from './useCookieHealth';

function relativeTime(iso: string | null): string {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}

export const CookieHealthSection: React.FC = () => {
  const { status, snapshot, refresh } = useCookieHealth();

  return (
    <section style={{ marginBottom: 'var(--space-lg)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="ff-label-sm ff-fg-subdued" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>Cookie health</span>
        <button
          onClick={refresh}
          disabled={status === 'loading'}
          className="ff-label-sm"
          style={{
            background: 'transparent',
            border: '1px solid var(--color-border-subdued)',
            padding: 'var(--space-xxs) var(--space-xs)',
            borderRadius: 'var(--radius-xxs)',
            cursor: status === 'loading' ? 'not-allowed' : 'pointer',
            opacity: status === 'loading' ? 0.6 : 1,
            color: 'var(--fg1)',
          }}
        >
          Refresh
        </button>
      </div>

      <div className="ff-text-sm ff-fg-subdued" style={{ marginTop: 'var(--space-xxs)' }}>
        Backend sweeps run every 15 min.
      </div>

      {status === 'loading' && (
        <div style={{ marginTop: 'var(--space-sm)' }}>
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              style={{
                height: 'var(--space-lg)',
                background: 'var(--bg-surface-hover)',
                borderRadius: 'var(--radius-xxs)',
                marginBottom: 'var(--space-xs)',
              }}
            />
          ))}
        </div>
      )}

      {status === 'error' && (
        <div className="ff-text-sm" style={{ color: 'var(--color-text-red)', marginTop: 'var(--space-sm)' }}>
          Couldn't load cookie health.{' '}
          <a
            onClick={(e) => {
              e.preventDefault();
              refresh();
            }}
            style={{ color: 'var(--color-text-red)', textDecoration: 'underline', cursor: 'pointer' }}
          >
            Try again
          </a>
        </div>
      )}

      {status === 'ok' && (!snapshot || snapshot.domains.length === 0) && (
        <div className="ff-text-sm ff-fg-subdued" style={{ marginTop: 'var(--space-sm)' }}>
          No domains configured.
        </div>
      )}

      {status === 'ok' && snapshot && snapshot.domains.length > 0 && (
        <div style={{ marginTop: 'var(--space-sm)' }}>
          {snapshot.domains.map((domain) => {
            let dotColor = 'var(--color-border-default)';
            if (domain.status === 'healthy') {
              dotColor = 'var(--color-border-green)';
            } else if (domain.status === 'down') {
              dotColor = 'var(--color-border-red)';
            }

            return (
              <div
                key={domain.host}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: 'var(--space-xs) 0',
                  borderBottom: '1px solid var(--color-border-subdued)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <span
                    style={{
                      display: 'inline-block',
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      marginRight: 'var(--space-xs)',
                      background: dotColor,
                    }}
                  />
                  <span className="ff-text-sm" style={{ fontFamily: 'var(--font-mono)' }}>
                    {domain.host}
                  </span>
                </div>
                <span
                  className="ff-text-xs ff-fg-subdued"
                  title={domain.lastChecked || ''}
                >
                  {relativeTime(domain.lastChecked)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {snapshot && (
        <div className="ff-text-xs ff-fg-subdued" style={{ marginTop: 'var(--space-xs)' }}>
          Snapshot: {relativeTime(snapshot.runAt)}.
        </div>
      )}
    </section>
  );
};
