import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import s from './Page.module.css';

export function Page({ children, wide, className }: { children: ReactNode; wide?: boolean; className?: string }) {
  return (
    <motion.div
      className={[s.page, wide && s.wide, className].filter(Boolean).join(' ')}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ type: 'spring', stiffness: 300, damping: 32 }}
    >
      {children}
    </motion.div>
  );
}

export function PageHeader({ kicker, title, children }: { kicker?: string; title: ReactNode; children?: ReactNode }) {
  return (
    <header className={s.header}>
      {kicker && <div className="kicker">{kicker}</div>}
      <h1 className={s.title}>{title}</h1>
      {children && <div className={s.sub}>{children}</div>}
    </header>
  );
}
