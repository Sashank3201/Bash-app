import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { buildFixture } from '../../content';
import { getMission } from '../../content/missions';
import { lookupRef } from '../../content/reference';
import { ROMAN, STORY } from '../../content/story';
import { SYLLABUS } from '../../content/syllabus';
import type { Mission, Step, TaskStep } from '../../content/types';
import { getCase } from '../../content/cases';
import { Icon } from '../../design/Icon';
import { Markdown } from '../../design/Markdown';
import { Button, haptic, IconButton, ProgressRule } from '../../design/ui';
import { checkCommand } from '../../engine/grader';
import { xpAfterHints, XP } from '../../engine/progress';
import { parse } from '../../shell/parser';
import { useApp, type MissionRecord } from '../../store/app';
import { TerminalSession } from '../../terminal/session';
import { TerminalPanel } from '../../terminal/TerminalPanel';
import { astFacts } from '../../engine/grader';
import { ExampleStep, FillStep, OrderStep, QuizStep, ReadStep, StepKicker, TaskStepView, WidgetStep, type TaskStatus } from './steps';
import s from './MissionPlayer.module.css';

export default function MissionPlayer() {
  const { day } = useParams();
  const n = Number(day);
  const mission = getMission(n);
  if (!mission) return <ComingSoon day={n} />;
  return <Player key={n} mission={mission} />;
}

function ComingSoon({ day }: { day: number }) {
  const syl = SYLLABUS.find((d) => d.day === day);
  return (
    <div className={s.soon}>
      <div className="kicker">Day {day}</div>
      <h1 className="display">{syl?.title ?? 'Unknown mission'}</h1>
      <p className="prose">This mission’s files are still being written up. Check back soon.</p>
      <Link to="/path">
        <Button variant="secondary" icon="arrowLeft">
          Back to the Path
        </Button>
      </Link>
    </div>
  );
}

const blankRecord = (): MissionRecord => ({ step: 0, phase: 'briefing', steps: {}, done: false });

function stepXp(step: Step, rec: { wrong: number; hints: number; revealed?: boolean }): number {
  switch (step.kind) {
    case 'task':
      return xpAfterHints(step.xp ?? XP.task, rec.hints, !!rec.revealed);
    case 'quiz':
    case 'predict':
    case 'fill':
    case 'order':
      return rec.wrong === 0 ? XP.quizFirst : XP.quizRetry;
    default:
      return 5;
  }
}

function firstCommands(src: string): Set<string> {
  try {
    return astFacts(parse(src)).commands;
  } catch {
    return new Set();
  }
}

function Player({ mission }: { mission: Mission }) {
  const navigate = useNavigate();
  const steps: Step[] = useMemo(() => [...mission.lesson, ...mission.drills], [mission]);
  const drillStart = mission.lesson.length;
  const stored = useApp((st) => st.missions[mission.day]) ?? blankRecord();
  const updateMission = useApp((st) => st.updateMission);
  const addXp = useApp((st) => st.addXp);
  const completeMission = useApp((st) => st.completeMission);

  const [phase, setPhase] = useState<'briefing' | 'steps' | 'debrief'>(() => (stored.done ? 'debrief' : stored.phase === 'briefing' && stored.step === 0 && !Object.keys(stored.steps).length ? 'briefing' : 'steps'));
  const [idx, setIdx] = useState(() => Math.min(stored.done ? 0 : stored.step, steps.length - 1));
  const [restoring, setRestoring] = useState(true);
  const [status, setStatus] = useState<TaskStatus>({ state: 'idle' });
  const [ranExample, setRanExample] = useState(false);
  const [widgetDone, setWidgetDone] = useState(false);
  const [termOpen, setTermOpen] = useState(false);
  const [kbd, setKbd] = useState(false);
  const [stripOpen, setStripOpen] = useState(false);
  const xpAtStart = useRef(useApp.getState().xp);

  const session = useMemo(
    () =>
      new TerminalSession({
        vfs: buildFixture(mission.fixture),
        banner: `Day ${mission.day} · ${mission.title} — your workstation is ready.\n`,
        hasManual: (t) => !!lookupRef(t),
      }),
    [mission],
  );

  const step = steps[idx];
  const rec = stored.steps[step?.id ?? ''] ?? { done: false, wrong: 0, hints: 0 };
  const stepRef = useRef(step);
  stepRef.current = step;

  // restore the terminal state from steps already completed
  useEffect(() => {
    let alive = true;
    (async () => {
      const srcs: string[] = [];
      for (let i = 0; i < Math.min(idx, steps.length); i++) {
        const st = steps[i];
        if (st.kind === 'task' && stored.steps[st.id]?.done) srcs.push(st.solution);
      }
      if (srcs.length) await session.replay(srcs);
      if (alive) setRestoring(false);
    })();
    return () => {
      alive = false;
    };
    // run once per mission mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const markStep = useCallback(
    (id: string, fn: (r: { done: boolean; wrong: number; hints: number; revealed?: boolean }) => void) =>
      updateMission(mission.day, (m) => {
        const r = m.steps[id] ?? { done: false, wrong: 0, hints: 0 };
        fn(r);
        m.steps[id] = r;
      }),
    [updateMission, mission.day],
  );

  const finishStep = useCallback(
    (st: Step) => {
      const cur = useApp.getState().missions[mission.day]?.steps[st.id] ?? { done: false, wrong: 0, hints: 0 };
      if (cur.done) return;
      markStep(st.id, (r) => {
        r.done = true;
      });
      const xp = stepXp(st, cur);
      addXp(xp);
      if (st.kind === 'task') useApp.getState().pushToast({ kind: 'xp', title: `+${xp} XP`, body: 'Task complete' });
    },
    [markStep, addXp, mission.day],
  );

  // grade commands typed in the terminal
  useEffect(() => {
    session.onCommand = async (r) => {
      const st = stepRef.current;
      if (!st) return;
      if (st.kind === 'example') {
        if (r.src.trim().replace(/\s+/g, ' ') === st.code.trim().replace(/\s+/g, ' ')) setRanExample(true);
        return;
      }
      if (st.kind !== 'task') return;
      const already = useApp.getState().missions[mission.day]?.steps[st.id]?.done;
      if (already) return;
      const res = await checkCommand(st.check, { ...r, cols: session.cols }, st.solution);
      if (res.ok) {
        setStatus({ state: 'success' });
        haptic('success');
        finishStep(st);
        return;
      }
      // only give feedback when the command looks like an attempt at this task
      const want = new Set([...firstCommands(st.solution), ...(st.check.uses ?? [])]);
      const got = firstCommands(r.src);
      const attempt = [...got].some((c) => want.has(c));
      if (attempt) {
        markStep(st.id, (x) => {
          x.wrong++;
        });
        setStatus({ state: 'error', message: res.message, expected: res.expected });
        haptic('error');
      }
    };
    return () => {
      session.onCommand = undefined;
    };
  }, [session, finishStep, markStep, mission.day]);

  // persist position
  useEffect(() => {
    if (phase === 'steps') {
      updateMission(mission.day, (m) => {
        if (!m.done) m.step = idx;
        if (m.phase === 'briefing') m.phase = 'lesson';
      });
    }
  }, [idx, phase, updateMission, mission.day]);

  // reset per-step UI
  useEffect(() => {
    setStatus({ state: 'idle' });
    setRanExample(false);
    setWidgetDone(false);
    setStripOpen(false);
  }, [idx]);

  const needsTerm = step && (step.kind === 'task' || step.kind === 'example');
  useEffect(() => {
    if (needsTerm) setTermOpen(true);
  }, [needsTerm, idx]);

  const canContinue = (() => {
    if (!step) return false;
    if (rec.done) return true;
    switch (step.kind) {
      case 'read':
      case 'note':
        return true;
      case 'example':
        return true;
      case 'widget':
        return true;
      default:
        return false;
    }
  })();

  const next = () => {
    if (!step) return;
    if (!rec.done && (step.kind === 'read' || step.kind === 'note' || step.kind === 'example' || step.kind === 'widget')) finishStep(step);
    if (idx + 1 < steps.length) {
      setIdx(idx + 1);
      document.getElementById('step-pane')?.scrollTo({ top: 0 });
    } else {
      completeMission(mission.day, mission.debrief.cards);
      haptic('stamp');
      setPhase('debrief');
    }
  };

  const onRun = (code: string) => {
    setTermOpen(true);
    void session.run(code);
  };

  if (phase === 'briefing') {
    return (
      <Briefing
        mission={mission}
        onStart={() => {
          updateMission(mission.day, (m) => {
            m.phase = 'lesson';
          });
          setPhase('steps');
        }}
        onClose={() => navigate('/path')}
      />
    );
  }
  if (phase === 'debrief') {
    return (
      <Debrief
        mission={mission}
        xpEarned={Math.max(0, useApp.getState().xp - xpAtStart.current)}
        onReplay={() => {
          setIdx(0);
          setPhase('steps');
        }}
        onClose={() => navigate('/path')}
      />
    );
  }

  const doneCount = steps.filter((st) => stored.steps[st.id]?.done).length;
  const inDrills = idx >= drillStart;
  const total = steps.length;

  return (
    <div className={[s.player, kbd && s.kbdOpen].filter(Boolean).join(' ')}>
      <header className={s.top}>
        <IconButton icon="close" label="Leave mission" onClick={() => navigate('/path')} />
        <div className={s.topMid}>
          <div className={s.topTitle}>
            <span className={s.topDay}>Day {mission.day}</span> · {mission.title}
            {inDrills && <span className={s.drillTag}>Drills</span>}
          </div>
          <ProgressRule value={doneCount / total} tone="red" />
        </div>
        <span className={s.topCount}>
          {Math.min(idx + 1, total)}/{total}
        </span>
      </header>

      <div className={[s.body, needsTerm || termOpen ? s.split : s.solo].join(' ')}>
        <section id="step-pane" className={[s.stepPane, kbd && !stripOpen && s.stepPaneCollapsed].filter(Boolean).join(' ')}>
          {kbd && !stripOpen &&
            (rec.done && step?.kind === 'task' ? (
              <button className={[s.strip, s.stripOk].join(' ')} onPointerDown={(e) => e.preventDefault()} onClick={next}>
                <span className={s.stripCheck}>
                  <Icon name="check" size={14} />
                </span>
                <span className={s.stripText}>Task complete — tap to continue</span>
                <Icon name="arrowRight" size={16} />
              </button>
            ) : (
              <button className={[s.strip, status.state === 'error' && s.stripErr].filter(Boolean).join(' ')} onClick={() => setStripOpen(true)}>
                <span className={s.stripLabel}>{status.state === 'error' ? 'Not yet' : step?.kind === 'task' ? 'Task' : 'Step'}</span>
                <span className={s.stripText}>
                  {status.state === 'error' && status.message ? status.message : step && 'md' in step && step.md ? step.md.replace(/[`*#>]/g, '').replace(/```\w*/g, '').replace(/\s+/g, ' ').slice(0, 160) : ''}
                </span>
                <Icon name="chevronDown" size={16} />
              </button>
            ))}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={idx} className={s.card} initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -18 }} transition={{ type: 'spring', stiffness: 420, damping: 38 }}>
              {idx === drillStart && (
                <div className={s.drillIntro}>
                  <span className="kicker">Drills</span>
                  <p>Lesson done. Now prove it — quick tasks, no new material.</p>
                </div>
              )}
              {step && <StepKicker step={step} index={idx} total={total} drill={inDrills} />}
              {step && (
                <StepBody
                  step={step}
                  rec={rec}
                  status={status}
                  ranExample={ranExample}
                  onRun={onRun}
                  onHint={() => {
                    markStep(step.id, (r) => {
                      r.hints++;
                    });
                  }}
                  onReveal={() =>
                    markStep(step.id, (r) => {
                      r.revealed = true;
                    })
                  }
                  onAnswer={(ok) => {
                    if (ok) finishStep(step);
                    else
                      markStep(step.id, (r) => {
                        r.wrong++;
                      });
                  }}
                  onWidget={() => setWidgetDone(true)}
                />
              )}
            </motion.div>
          </AnimatePresence>
          <div className={s.actions}>
            {idx > 0 && (
              <Button variant="ghost" size="small" icon="arrowLeft" onClick={() => setIdx(idx - 1)}>
                Back
              </Button>
            )}
            <div style={{ flex: 1 }} />
            {!needsTerm && (
              <Button variant="ghost" size="small" icon="terminal" onClick={() => setTermOpen((x) => !x)} className={s.termToggle}>
                {termOpen ? 'Hide terminal' : 'Terminal'}
              </Button>
            )}
            <Button onClick={next} disabled={!canContinue} iconRight="arrowRight" className={step?.kind === 'widget' && !widgetDone && !rec.done ? s.pulseBtn : undefined}>
              {idx + 1 === total ? 'Finish mission' : rec.done || canContinue ? 'Continue' : step?.kind === 'task' ? 'Solve to continue' : 'Answer to continue'}
            </Button>
          </div>
        </section>

        <section
          className={s.termPane}
          onFocusCapture={(e) => {
            if ((e.target as HTMLElement).tagName === 'INPUT' && window.matchMedia('(max-width: 899px)').matches) setKbd(true);
          }}
          onBlurCapture={() => setKbd(false)}
        >
          {restoring ? <div className={s.restoring}>Restoring your session…</div> : <TerminalPanel session={session} className={s.term} title={`analyst@${STORY.host} — day ${mission.day}`} />}
        </section>
      </div>
    </div>
  );
}

function StepBody({
  step,
  rec,
  status,
  ranExample,
  onRun,
  onHint,
  onReveal,
  onAnswer,
  onWidget,
}: {
  step: Step;
  rec: { done: boolean; wrong: number; hints: number; revealed?: boolean };
  status: TaskStatus;
  ranExample: boolean;
  onRun: (c: string) => void;
  onHint: () => void;
  onReveal: () => void;
  onAnswer: (ok: boolean) => void;
  onWidget: () => void;
}) {
  switch (step.kind) {
    case 'read':
    case 'note':
      return <ReadStep step={step} onRun={onRun} />;
    case 'example':
      return <ExampleStep step={step} onRun={onRun} ran={ranExample} />;
    case 'task':
      return <TaskStepView step={step as TaskStep} status={status} hintsUsed={rec.hints} revealed={!!rec.revealed} onHint={onHint} onReveal={onReveal} onRun={onRun} done={rec.done} />;
    case 'quiz':
    case 'predict':
      return <QuizStep step={step} onAnswer={onAnswer} done={rec.done} />;
    case 'fill':
      return <FillStep step={step} onAnswer={onAnswer} done={rec.done} />;
    case 'order':
      return <OrderStep step={step} onAnswer={onAnswer} done={rec.done} />;
    case 'widget':
      return <WidgetStep step={step} onComplete={onWidget} />;
  }
}

// ------------------------------------------------------------------ briefing

function useTypewriter(text: string, enabled: boolean) {
  const [n, setN] = useState(enabled ? 0 : text.length);
  useEffect(() => {
    if (!enabled) {
      setN(text.length);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const k = Math.min(text.length, Math.floor((t - start) * 0.9));
      setN(k);
      if (k < text.length) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [text, enabled]);
  return { shown: text.slice(0, n), done: n >= text.length, skip: () => setN(text.length) };
}

function Briefing({ mission, onStart, onClose }: { mission: Mission; onStart: () => void; onClose: () => void }) {
  const typewriter = useApp((st) => st.settings.typewriter);
  const name = useApp((st) => st.profile.name);
  const reduce = useReducedMotion();
  const { shown, done, skip } = useTypewriter(mission.briefing, typewriter && !reduce);
  return (
    <div className={s.briefing} onClick={() => !done && skip()}>
      <div className={s.briefTop}>
        <IconButton icon="close" label="Back" onClick={onClose} />
      </div>
      <motion.div className={s.paper} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 200, damping: 26 }}>
        <div className={s.folio}>
          <span>Halden Security · Internal</span>
          <span>Day {String(mission.day).padStart(2, '0')}</span>
        </div>
        <div className="rule-double" />
        <div className={s.chapter}>Chapter {ROMAN[mission.week]} · Mission {ROMAN[mission.day]}</div>
        <h1 className={s.briefTitle}>{mission.title}</h1>
        <p className={s.briefTopic}>{mission.topic}</p>
        <div className={s.memo}>
          <div className={s.memoHead}>
            <span>To: {name || 'Intern'}</span>
            <span>From: {STORY.mentor}</span>
          </div>
          <div className={s.letter}>
            <Markdown dropcap>{shown + (done ? '' : '▍')}</Markdown>
          </div>
          {done && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={s.sign}>
              — Mara
            </motion.div>
          )}
        </div>
        <AnimatePresence>
          {done && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
              <div className={s.objectivesHead}>Today you will</div>
              <ul className={s.objectives}>
                {mission.objectives.map((o) => (
                  <li key={o}>{o}</li>
                ))}
              </ul>
              <div className={s.briefMeta}>
                <span>
                  <Icon name="today" size={16} /> ~{mission.minutes} min
                </span>
                <span>
                  <Icon name="target" size={16} /> {mission.lesson.length} lesson steps · {mission.drills.length} drills
                </span>
              </div>
              <Button block onClick={onStart} iconRight="arrowRight">
                Begin mission
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
        {!done && <div className={s.tapSkip}>Tap to skip</div>}
      </motion.div>
    </div>
  );
}

// ------------------------------------------------------------------ debrief

function Debrief({ mission, xpEarned, onReplay, onClose }: { mission: Mission; xpEarned: number; onReplay: () => void; onClose: () => void }) {
  const navigate = useNavigate();
  const nextDay = SYLLABUS.find((d) => d.day === mission.day + 1);
  const cs = mission.caseId ? getCase(mission.caseId) : undefined;
  const caseSolved = useApp((st) => (cs ? !!st.challenges['case:' + cs.id]?.solved : false));
  return (
    <div className={s.debrief}>
      <div className={s.briefTop}>
        <IconButton icon="close" label="Back to the path" onClick={onClose} />
      </div>
      <motion.div className={s.paper} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className={s.folio}>
          <span>Debrief</span>
          <span>Day {String(mission.day).padStart(2, '0')}</span>
        </div>
        <div className="rule-double" />
        <div className={s.stampWrap}>
          <motion.div className={s.stamp} initial={{ scale: 2.2, opacity: 0, rotate: -18 }} animate={{ scale: 1, opacity: 1, rotate: -8 }} transition={{ type: 'spring', stiffness: 520, damping: 18, delay: 0.25 }}>
            <span>Mission</span>
            <b>Complete</b>
            <span>{new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
          </motion.div>
        </div>
        <h1 className={s.briefTitle}>{mission.title}</h1>
        <div className={s.stats}>
          <div>
            <b>+{xpEarned}</b>
            <span>XP this session</span>
          </div>
          <div>
            <b>{mission.debrief.cards.length}</b>
            <span>new review cards</span>
          </div>
          <div>
            <b>{mission.lesson.length + mission.drills.length}</b>
            <span>steps</span>
          </div>
        </div>
        <div className={s.objectivesHead}>What you learned</div>
        <ul className={s.learned}>
          {mission.debrief.summary.map((x) => (
            <li key={x}>
              <Markdown>{x}</Markdown>
            </li>
          ))}
        </ul>
        {cs && (
          <div className={s.caseCta}>
            <div>
              <div className="kicker">Case file unlocked</div>
              <div className={s.caseTitle}>
                Case {cs.number}: {cs.title}
              </div>
            </div>
            <Button variant="accent" onClick={() => navigate(`/case/${cs.id}`)} iconRight="arrowRight">
              {caseSolved ? 'Review' : 'Open case'}
            </Button>
          </div>
        )}
        <div className={s.debriefActions}>
          {nextDay ? (
            <Button block onClick={() => navigate(`/mission/${nextDay.day}`)} iconRight="arrowRight">
              Next: Day {nextDay.day} · {nextDay.title}
            </Button>
          ) : cs && !caseSolved ? (
            <Button block onClick={() => navigate(`/case/${cs.id}`)} iconRight="arrowRight">
              Close the capstone to make Lead Analyst
            </Button>
          ) : (
            <Button block onClick={() => navigate('/certificate')} iconRight="arrowRight">
              View your certificate
            </Button>
          )}
          <div className={s.row}>
            <Button variant="secondary" block onClick={onClose}>
              Back to the Path
            </Button>
            <Button variant="ghost" onClick={onReplay} icon="reset">
              Replay
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
