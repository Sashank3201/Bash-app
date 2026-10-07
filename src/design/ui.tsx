// Small shared UI primitives.

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../store/app';
import { Icon, type IconName } from './Icon';
import s from './ui.module.css';

type Variant = 'primary' | 'secondary' | 'ghost' | 'accent';

export function Button({
  variant = 'primary',
  size,
  block,
  icon,
  iconRight,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'small'; block?: boolean; icon?: IconName; iconRight?: IconName }) {
  return (
    <button type="button" className={[s.btn, s[variant], size && s.small, block && s.block, className].filter(Boolean).join(' ')} {...rest}>
      {icon && <Icon name={icon} size={size ? 16 : 18} />}
      {children}
      {iconRight && <Icon name={iconRight} size={size ? 16 : 18} />}
    </button>
  );
}

export function IconButton({ icon, label, size = 22, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; label: string; size?: number }) {
  return (
    <button type="button" aria-label={label} title={label} className={[s.iconBtn, className].filter(Boolean).join(' ')} {...rest}>
      <Icon name={icon} size={size} />
    </button>
  );
}

export function Chip({ tone, children, className }: { tone?: 'red' | 'green' | 'amber'; children: ReactNode; className?: string }) {
  return <span className={[s.chip, tone === 'red' && s.chipRed, tone === 'green' && s.chipGreen, tone === 'amber' && s.chipAmber, className].filter(Boolean).join(' ')}>{children}</span>;
}

export function Card({ children, className, ...rest }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={[s.card, className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </div>
  );
}

export function ProgressRule({ value, tone, className }: { value: number; tone?: 'red'; className?: string }) {
  return (
    <div className={[s.rule, tone === 'red' && s.ruleRed, className].filter(Boolean).join(' ')} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)}>
      <motion.div className={s.ruleFill} initial={false} animate={{ scaleX: Math.max(0, Math.min(1, value)) }} transition={{ type: 'spring', stiffness: 140, damping: 24 }} style={{ width: '100%' }} />
    </div>
  );
}

export function Segmented<T extends string>({ options, value, onChange, id }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; id: string }) {
  return (
    <div className={s.segmented} role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={o.value === value} className={[s.segment, o.value === value && s.segmentActive].filter(Boolean).join(' ')} onClick={() => onChange(o.value)}>
          {o.value === value && <motion.span layoutId={`seg-${id}`} className={s.segmentPill} transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className={s.kbd}>{children}</kbd>;
}

export function Sheet({
  open,
  onClose,
  title,
  children,
  full,
  headerExtra,
  label,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  full?: boolean;
  headerExtra?: ReactNode;
  label?: string;
}) {
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  const desktop = typeof window !== 'undefined' && window.matchMedia('(min-width: 900px)').matches;
  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div className={s.scrim} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={label ?? (typeof title === 'string' ? title : undefined)}
            className={[s.sheet, full && s.sheetFull].filter(Boolean).join(' ')}
            initial={reduce ? { opacity: 0 } : desktop ? { opacity: 0, scale: 0.97 } : { y: '100%' }}
            animate={reduce ? { opacity: 1 } : desktop ? { opacity: 1, scale: 1 } : { y: 0 }}
            exit={reduce ? { opacity: 0 } : desktop ? { opacity: 0, scale: 0.97 } : { y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 38 }}
            drag={desktop || reduce ? false : 'y'}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_e, info) => {
              if (info.offset.y > 120 || info.velocity.y > 600) onClose();
            }}
          >
            <div className={s.sheetHandle} />
            <div className={s.sheetHeader}>
              <div className={s.sheetTitle}>{title}</div>
              {headerExtra}
              <IconButton icon="close" label="Close" onClick={onClose} />
            </div>
            <div className={s.sheetBody} onPointerDownCapture={(e) => e.stopPropagation()}>
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export function Toasts() {
  const toasts = useApp((st) => st.toasts);
  const dismiss = useApp((st) => st.dismissToast);
  return createPortal(
    <div className={s.toasts} aria-live="polite">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            className={s.toast}
            initial={{ opacity: 0, y: -16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            onClick={() => dismiss(t.id)}
          >
            {t.kind === 'badge' ? (
              <Seal glyph="★" size={38} earned dark />
            ) : t.kind === 'xp' ? (
              <span className={s.toastXp}>{t.title}</span>
            ) : (
              <Icon name="spark" />
            )}
            <div>
              {t.kind !== 'xp' && <div className={s.toastTitle}>{t.kind === 'badge' ? `Seal earned · ${t.title}` : t.title}</div>}
              {t.body && <div className={s.toastBody}>{t.body}</div>}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>,
    document.body,
  );
}

/** An ink seal for badges: scalloped ring + glyph. */
export function Seal({ glyph, size = 72, earned = true, dark, title }: { glyph: string; size?: number; earned?: boolean; dark?: boolean; title?: string }) {
  const teeth = 28;
  const r1 = 46;
  const r2 = 42;
  let d = '';
  for (let i = 0; i <= teeth * 2; i++) {
    const a = (Math.PI * i) / teeth;
    const r = i % 2 ? r2 : r1;
    d += `${i ? 'L' : 'M'}${50 + r * Math.cos(a)},${50 + r * Math.sin(a)}`;
  }
  const color = dark ? 'var(--term-accent)' : 'var(--red)';
  return (
    <svg className={[s.seal, !earned && s.sealLocked].filter(Boolean).join(' ')} width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={title ?? glyph}>
      <path d={d + 'Z'} fill={color} opacity={0.14} />
      <path d={d + 'Z'} fill="none" stroke={color} strokeWidth={1.6} />
      <circle cx={50} cy={50} r={33} fill="none" stroke={color} strokeWidth={1.2} strokeDasharray="2 3" />
      <circle cx={50} cy={50} r={28} fill="none" stroke={color} strokeWidth={1.6} />
      <text x={50} y={50} textAnchor="middle" dominantBaseline="central" fill={color} fontFamily="var(--font-serif)" fontWeight={600} fontSize={glyph.length > 2 ? 18 : 24}>
        {glyph}
      </text>
    </svg>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className={s.empty}>{children}</div>;
}

export function haptic(kind: 'tap' | 'success' | 'error' | 'stamp' = 'tap') {
  if (!useApp.getState().settings.haptics) return;
  const pattern = kind === 'tap' ? 8 : kind === 'success' ? [12, 40, 18] : kind === 'error' ? [30, 60, 30] : [6, 30, 60];
  try {
    navigator.vibrate?.(pattern);
  } catch {}
}
