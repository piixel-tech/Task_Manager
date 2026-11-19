import React, { useEffect, useState } from 'react';
import '../pages/login.css';

/** 120 ticks around the bezel; every fifth is a little stronger. */
const TICKS = Array.from({ length: 120 }, (_, i) => i);

/** The left panel: decorative only, so it is hidden from assistive technology. Everything on it is drawn once, then idles. */
export const BrandPanel: React.FC = () => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <aside className="z1-brand" aria-hidden="true">
      {/* hairlines across the panel, drawn in on load */}
      <svg className="z1-hl" viewBox="0 0 100 1" preserveAspectRatio="none" focusable="false">
        <path className="z1-line" pathLength={1} d="M0 0.5 H100" />
      </svg>
      <svg className="z1-vl" viewBox="0 0 1 100" preserveAspectRatio="none" focusable="false">
        <path className="z1-line" pathLength={1} d="M0.5 0 V100" />
      </svg>

      <div className="z1-stage">
        <svg viewBox="0 0 200 200" focusable="false">
          <circle className="z1-ring" pathLength={1} cx="100" cy="100" r="86" />
        </svg>
        <svg className="z1-bezel" viewBox="0 0 200 200" focusable="false">
          {TICKS.map((i) => {
            const major = i % 5 === 0;
            return <line key={i} className={`z1-tick${major ? ' major' : ''}`} x1="100" y1={major ? 2 : 4} x2="100" y2="8" transform={`rotate(${i * 3} 100 100)`} />;
          })}
        </svg>
        <span className="z1-sweep" />
        <span className="z1-bar" />
        <span className="z1-stem" />
      </div>

      <div className="z1-cap tl">Task Manager</div>
      <div className="z1-cap tr">{now.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}</div>
      <div className="z1-cap bl">
        <span>Local time</span>
        <b className="num">{now.toLocaleTimeString('en-GB', { hour12: false })}</b>
      </div>
      <div className="z1-cap br">Piixel × Unwork</div>
    </aside>
  );
};

interface AuthShellProps {
  /** The small label above the title, e.g. "Reset password". */
  eyebrow: string;
  /** The title in two lines: the first is light, the second bold. */
  title: [string, string];
  children: React.ReactNode;
}

/** The sign-in layout (brand panel on the left, form on the right) shared by Sign in, Forgot password and Reset password. */
export const AuthShell: React.FC<AuthShellProps> = ({ eyebrow, title, children }) => (
  <div className="z1">
    <BrandPanel />
    <main className="z1-form">
      <div className="z1-inner">
        <p className="z1-eyebrow">{eyebrow}</p>
        <h1 className="z1-title">
          <span className="z1-clip">
            <span className="light">{title[0]}</span>
          </span>
          <span className="z1-clip">
            <span className="bold">{title[1]}</span>
          </span>
        </h1>
        {children}
      </div>
    </main>
  </div>
);
