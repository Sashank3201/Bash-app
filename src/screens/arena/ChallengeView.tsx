import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { buildFixture } from '../../content';
import { ARENA, getChallenge } from '../../content/arena';
import { lookupRef } from '../../content/reference';
import type { Challenge } from '../../content/types';
import { Button, Chip, haptic, IconButton } from '../../design/ui';
import { checkCommand, astFacts } from '../../engine/grader';
import { xpAfterHints } from '../../engine/progress';
import { parse } from '../../shell/parser';
import { useApp } from '../../store/app';
import { TerminalSession } from '../../terminal/session';
import { TerminalPanel } from '../../terminal/TerminalPanel';
import { TaskStepView, type TaskStatus } from '../mission/steps';
import s from './ChallengeView.module.css';

export default function ChallengeView() {
  const { id } = useParams();
  const c = getChallenge(id ?? '');
  if (!c) {
    return (
      <div style={{ padding: 40 }}>
        <h1 className="title">Challenge not found</h1>
        <Link to="/path?tab=arena">Back to the Arena</Link>
      </div>
    );
  }
  return <Inner key={c.id} c={c} />;
}

function Inner({ c }: { c: Challenge }) {
  const navigate = useNavigate();
  const key = 'arena:' + c.id;
  const rec = useApp((st) => st.challenges[key]);
  const solveChallenge = useApp((st) => st.solveChallenge);
  const takeHint = useApp((st) => st.takeHint);
  const [status, setStatus] = useState<TaskStatus>({ state: 'idle' });
  const [revealed, setRevealed] = useState(!!rec?.revealed);
  const revealedRef = useRef(revealed);
  revealedRef.current = revealed;
  const session = useMemo(() => new TerminalSession({ vfs: buildFixture(c.fixture), banner: `Arena · ${c.title}\n`, hasManual: (t) => !!lookupRef(t) }), [c]);
  const solved = !!rec?.solved;
  const idx = ARENA.findIndex((x) => x.id === c.id);
  const next = ARENA.slice(idx + 1).find((x) => x.unlockDay <= c.unlockDay + 7) ?? null;

  useEffect(() => {
    session.onCommand = async (r) => {
      if (useApp.getState().challenges[key]?.solved) return;
      const res = await checkCommand(c.check, { ...r, cols: session.cols }, c.solution);
      if (res.ok) {
        haptic('success');
        setStatus({ state: 'success' });
        const hints = useApp.getState().challenges[key]?.hints ?? 0;
        solveChallenge(key, 'arena', xpAfterHints(c.xp, hints, revealedRef.current), hints, revealedRef.current);
        return;
      }
      let want = new Set<string>(c.check.uses ?? []);
      try {
        want = new Set([...want, ...astFacts(parse(c.solution)).commands]);
      } catch {}
      let got = new Set<string>();
      try {
        got = astFacts(parse(r.src)).commands;
      } catch {}
      if ([...got].some((x) => want.has(x))) {
        haptic('error');
        setStatus({ state: 'error', message: res.message, expected: res.expected });
      }
    };
    return () => {
      session.onCommand = undefined;
    };
  }, [session, c, key, solveChallenge]);

  return (
    <div className={s.page}>
      <header className={s.top}>
        <IconButton icon="close" label="Back to the Arena" onClick={() => navigate('/path?tab=arena')} />
        <div className={s.topTitle}>
          <span>Arena</span> · {c.topic}
        </div>
        <Chip tone={c.difficulty === 'easy' ? 'green' : c.difficulty === 'medium' ? 'amber' : 'red'}>{c.difficulty}</Chip>
      </header>
      <div className={s.body}>
        <section className={s.left}>
          <h1 className={s.title}>{c.title}</h1>
          <TaskStepView
            step={{ kind: 'task', id: c.id, md: c.md, check: c.check, solution: c.solution, hints: c.hints }}
            status={status}
            hintsUsed={rec?.hints ?? 0}
            revealed={revealed}
            onHint={() => takeHint(key)}
            onReveal={() => setRevealed(true)}
            onRun={(code) => void session.run(code)}
            done={solved}
          />
          {solved && (
            <div className={s.nextRow}>
              <span>+{rec?.xp ?? c.xp} XP</span>
              {next ? (
                <Button onClick={() => navigate(`/arena/${next.id}`)} iconRight="arrowRight">
                  Next challenge
                </Button>
              ) : (
                <Button variant="secondary" onClick={() => navigate('/path?tab=arena')}>
                  Back to the Arena
                </Button>
              )}
            </div>
          )}
        </section>
        <section className={s.right}>
          <TerminalPanel session={session} className={s.term} />
        </section>
      </div>
    </div>
  );
}
