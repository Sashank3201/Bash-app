import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Icon, type IconName } from '../../design/Icon';
import { ProgressRule } from '../../design/ui';
import { rankFor } from '../../engine/progress';
import { useApp } from '../../store/app';
import { useDueCount } from '../review/useDue';
import s from './AppShell.module.css';

const NAV: { to: string; label: string; icon: IconName }[] = [
  { to: '/', label: 'Today', icon: 'today' },
  { to: '/path', label: 'Path', icon: 'path' },
  { to: '/lab', label: 'Lab', icon: 'lab' },
  { to: '/review', label: 'Review', icon: 'review' },
  { to: '/dossier', label: 'Dossier', icon: 'dossier' },
];

export function Wordmark({ small }: { small?: boolean }) {
  return (
    <span className={[s.wordmark, small && s.wordmarkSmall].filter(Boolean).join(' ')}>
      Ink <span className={s.amp}>&amp;</span> Shell
    </span>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const xp = useApp((st) => st.xp);
  const name = useApp((st) => st.profile.name);
  const { rank, next, progress } = rankFor(xp);
  const due = useDueCount();
  const loc = useLocation();
  const isLab = loc.pathname.startsWith('/lab');
  return (
    <div className={[s.shell, isLab && s.shellLab].filter(Boolean).join(' ')}>
      <aside className={s.rail}>
        <div className={s.railTop}>
          <Wordmark />
          <div className={s.railSub}>Halden Security · Analyst Training</div>
        </div>
        <nav className={s.railNav} aria-label="Main">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => [s.railItem, isActive && s.railActive].filter(Boolean).join(' ')}>
              {({ isActive }) => (
                <>
                  {isActive && <motion.span layoutId="rail-pill" className={s.railPill} transition={{ type: 'spring', stiffness: 420, damping: 36 }} />}
                  <Icon name={n.icon} size={20} />
                  <span>{n.label}</span>
                  {n.to === '/review' && due > 0 && <span className={s.badge}>{due}</span>}
                </>
              )}
            </NavLink>
          ))}
          <NavLink to="/reference" className={({ isActive }) => [s.railItem, isActive && s.railActive].filter(Boolean).join(' ')}>
            {({ isActive }) => (
              <>
                {isActive && <motion.span layoutId="rail-pill" className={s.railPill} transition={{ type: 'spring', stiffness: 420, damping: 36 }} />}
                <Icon name="book" size={20} />
                <span>Reference</span>
              </>
            )}
          </NavLink>
        </nav>
        <div className={s.railRank}>
          <div className="kicker">{name || 'Analyst'}</div>
          <div className={s.rankTitle}>{rank.title}</div>
          <ProgressRule value={progress} tone="red" />
          <div className={s.rankMeta}>
            <span>{xp.toLocaleString()} XP</span>
            {next && <span>{(next.min - xp).toLocaleString()} to {next.title}</span>}
          </div>
        </div>
      </aside>
      <main className={s.main}>{children}</main>
      <nav className={s.tabs} aria-label="Main">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => [s.tab, isActive && s.tabActive].filter(Boolean).join(' ')}>
            {({ isActive }) => (
              <>
                <span className={s.tabIcon}>
                  <Icon name={n.icon} size={23} />
                  {n.to === '/review' && due > 0 && <span className={s.dot} />}
                </span>
                <span className={s.tabLabel}>{n.label}</span>
                {isActive && <motion.span layoutId="tab-ink" className={s.tabInk} transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
