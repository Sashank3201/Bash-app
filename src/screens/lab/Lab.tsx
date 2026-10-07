import { del, get, set } from 'idb-keyval';
import { motion } from 'framer-motion';
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { buildFixture } from '../../content';
import { lookupRef } from '../../content/reference';
import { Button, Segmented } from '../../design/ui';
import { VFS, type JsonNode } from '../../shell/vfs';
import { TerminalSession } from '../../terminal/session';
import { TerminalPanel } from '../../terminal/TerminalPanel';
import s from './Lab.module.css';

const RealLinux = lazy(() => import('./RealLinux'));

const KEY = 'lab-vfs-v1';
const BANNER = 'Ink & Shell Lab — a private sandbox. Type `cat welcome.txt` to start, `help` for builtins, `man <cmd>` for manuals.\n';

let labSession: TerminalSession | null = null;

async function loadSession(): Promise<TerminalSession> {
  if (labSession) return labSession;
  let vfs: VFS;
  try {
    const saved = (await get(KEY)) as JsonNode | undefined;
    vfs = saved ? VFS.fromJSON(saved) : buildFixture('lab');
  } catch {
    vfs = buildFixture('lab');
  }
  labSession = new TerminalSession({ vfs, banner: BANNER, hasManual: (t) => !!lookupRef(t) });
  return labSession;
}

export default function Lab() {
  const [session, setSession] = useState<TerminalSession | null>(labSession);
  const [mode, setMode] = useState<'sim' | 'real'>('sim');
  const saveTimer = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    loadSession().then((s2) => alive && setSession(s2));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!session) return;
    session.onCommand = () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        void set(KEY, session.vfs.toJSON());
      }, 400);
    };
    return () => {
      session.onCommand = undefined;
    };
  }, [session]);

  const reset = async () => {
    if (!session) return;
    if (!window.confirm('Reset the Lab? Your files in the Lab will be replaced with a fresh copy.')) return;
    await del(KEY);
    session.reset(buildFixture('lab'), BANNER);
  };

  const toolbar = useMemo(
    () => (
      <button className={s.reset} onClick={reset} title="Restore the Lab to its original state">
        Reset
      </button>
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session],
  );

  return (
    <motion.div className={s.lab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
      <header className={s.head}>
        <div>
          <div className="kicker">Free practice</div>
          <h1 className={s.title}>The Lab</h1>
        </div>
        <div className={s.switch}>
          <Segmented
            id="lab-mode"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'sim', label: 'Simulator' },
              { value: 'real', label: 'Real Linux' },
            ]}
          />
        </div>
      </header>
      <div className={s.body}>
        {mode === 'sim' ? (
          session ? (
            <TerminalPanel session={session} autoFocus toolbar={toolbar} className={s.term} />
          ) : (
            <div className={s.loading}>Preparing your workstation…</div>
          )
        ) : (
          <Suspense fallback={<div className={s.loading}>Loading…</div>}>
            <RealLinux />
          </Suspense>
        )}
      </div>
      {mode === 'sim' && (
        <p className={s.foot}>
          Everything you create here is saved on this device.{' '}
          <Button variant="ghost" size="small" onClick={reset}>
            Reset Lab
          </Button>
        </p>
      )}
    </motion.div>
  );
}
