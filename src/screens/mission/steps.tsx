// Renders one lesson step (prose, example, task, quizzes, widgets).

import { AnimatePresence, motion, Reorder } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import type { Step, TaskStep } from '../../content/types';
import { Icon } from '../../design/Icon';
import { highlightShell, Markdown } from '../../design/Markdown';
import { Button, haptic } from '../../design/ui';
import { Widget } from '../../widgets/Widgets';
import s from './steps.module.css';

export interface TaskStatus {
  state: 'idle' | 'error' | 'success';
  message?: string;
  expected?: string;
}

export function StepKicker({ step, index, total, drill }: { step: Step; index: number; total: number; drill: boolean }) {
  const label =
    step.kind === 'task' ? (drill ? 'Drill' : 'Your turn') : step.kind === 'quiz' ? 'Check yourself' : step.kind === 'predict' ? 'Predict the output' : step.kind === 'fill' ? 'Fill the gaps' : step.kind === 'order' ? 'Put it in order' : step.kind === 'example' ? 'Try it' : step.kind === 'widget' ? 'Explore' : step.kind === 'note' ? 'From Mara' : 'Lesson';
  return (
    <div className={s.kicker}>
      <span className={[s.kickerLabel, (step.kind === 'task' || step.kind === 'example') && s.kickerTask].filter(Boolean).join(' ')}>{label}</span>
      <span className={s.kickerCount}>
        {index + 1} / {total}
      </span>
    </div>
  );
}

export function ReadStep({ step, onRun }: { step: Extract<Step, { kind: 'read' | 'note' }>; onRun?: (c: string) => void }) {
  return (
    <div className={step.kind === 'note' ? s.note : undefined}>
      {step.kind === 'read' && step.title && <h2 className={s.title}>{step.title}</h2>}
      <Markdown onRun={onRun}>{step.md}</Markdown>
      {step.kind === 'note' && <div className={s.signature}>— Mara</div>}
    </div>
  );
}

export function ExampleStep({ step, onRun, ran }: { step: Extract<Step, { kind: 'example' }>; onRun: (c: string) => void; ran: boolean }) {
  return (
    <div>
      {step.md && <Markdown onRun={onRun}>{step.md}</Markdown>}
      <div className={s.example}>
        <pre>
          <code>{highlightShell(step.code)}</code>
        </pre>
        <Button size="small" variant={ran ? 'secondary' : 'primary'} icon="play" onClick={() => onRun(step.code)}>
          {ran ? 'Run again' : 'Run'}
        </Button>
      </div>
      {step.caption && <p className={s.caption}>{step.caption}</p>}
    </div>
  );
}

export function TaskStepView({
  step,
  status,
  hintsUsed,
  revealed,
  onHint,
  onReveal,
  onRun,
  done,
}: {
  step: TaskStep;
  status: TaskStatus;
  hintsUsed: number;
  revealed: boolean;
  onHint: () => void;
  onReveal: () => void;
  onRun: (c: string) => void;
  done: boolean;
}) {
  const [showExpected, setShowExpected] = useState(false);
  return (
    <div>
      <Markdown onRun={onRun}>{step.md}</Markdown>
      <AnimatePresence initial={false}>
        {done ? (
          <motion.div key="ok" className={s.success} initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 360, damping: 28 }}>
            <div className={s.successHead}>
              <span className={s.check}>
                <Icon name="check" size={18} />
              </span>
              <span>{revealed ? 'Done — you used the solution this time.' : ['Nailed it.', 'Exactly right.', 'Clean.', 'That’s the one.'][step.id.length % 4]}</span>
            </div>
            {step.explain && <Markdown className={s.successBody}>{step.explain}</Markdown>}
          </motion.div>
        ) : status.state === 'error' && status.message ? (
          <motion.div key={'err' + status.message} className={s.error} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: [0, -5, 5, -3, 0] }} transition={{ duration: 0.35 }}>
            <Icon name="info" size={18} />
            <div>
              <span>{status.message}</span>
              {status.expected !== undefined && status.expected !== '' && (
                <button className={s.linkBtn} onClick={() => setShowExpected((x) => !x)}>
                  {showExpected ? 'Hide expected output' : 'Show expected output'}
                </button>
              )}
              {showExpected && <pre className={s.expected}>{status.expected}</pre>}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
      {!done && (
        <>
          {hintsUsed > 0 && (
            <ol className={s.hints}>
              {step.hints.slice(0, hintsUsed).map((h, i) => (
                <motion.li key={i} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>
                  <Markdown>{h}</Markdown>
                </motion.li>
              ))}
            </ol>
          )}
          {revealed && (
            <div className={s.solution}>
              <span className={s.solutionLabel}>Solution</span>
              <pre>
                <code>{highlightShell(step.solution)}</code>
              </pre>
              <Button size="small" icon="play" onClick={() => onRun(step.solution)}>
                Run it
              </Button>
            </div>
          )}
          <div className={s.helpRow}>
            {hintsUsed < step.hints.length ? (
              <Button variant="ghost" size="small" icon="hint" onClick={onHint}>
                Hint {step.hints.length > 1 ? `(${step.hints.length - hintsUsed} left)` : ''}
              </Button>
            ) : (
              !revealed && (
                <Button variant="ghost" size="small" icon="eye" onClick={onReveal}>
                  Show solution
                </Button>
              )
            )}
            <span className={s.waiting}>
              <span className={s.pulse} /> Waiting for your command…
            </span>
          </div>
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ quizzes

export function QuizStep({ step, onAnswer, done }: { step: Extract<Step, { kind: 'quiz' | 'predict' }>; onAnswer: (correct: boolean) => void; done: boolean }) {
  const [picked, setPicked] = useState<number | null>(done ? step.answer : null);
  const [wrong, setWrong] = useState<Set<number>>(new Set());
  const correct = picked === step.answer;
  return (
    <div>
      {step.kind === 'quiz' ? <h2 className={s.question}>{step.q}</h2> : step.md && <Markdown>{step.md}</Markdown>}
      {step.kind === 'predict' && (
        <pre className={s.predictCode}>
          <code>{highlightShell(step.code)}</code>
        </pre>
      )}
      <div className={s.options} role="radiogroup">
        {step.options.map((o, i) => {
          const isPicked = picked === i;
          const state = isPicked && correct ? 'right' : wrong.has(i) ? 'wrong' : '';
          return (
            <motion.button
              key={i}
              role="radio"
              aria-checked={isPicked}
              className={[s.option, state === 'right' && s.optionRight, state === 'wrong' && s.optionWrong].filter(Boolean).join(' ')}
              disabled={correct || wrong.has(i)}
              animate={state === 'wrong' ? { x: [0, -6, 6, -3, 0] } : {}}
              transition={{ duration: 0.3 }}
              onClick={() => {
                setPicked(i);
                if (i === step.answer) {
                  haptic('success');
                  onAnswer(true);
                } else {
                  haptic('error');
                  setWrong((w) => new Set(w).add(i));
                  onAnswer(false);
                }
              }}
            >
              <span className={s.optionKey}>{String.fromCharCode(65 + i)}</span>
              <span className={step.kind === 'predict' ? s.optionMono : undefined}>{o}</span>
              {state === 'right' && <Icon name="check" size={18} />}
            </motion.button>
          );
        })}
      </div>
      <AnimatePresence>
        {(correct || wrong.size > 0) && (
          <motion.div className={correct ? s.explainOk : s.explainTry} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0 }}>
            {correct ? <Markdown>{step.explain}</Markdown> : <p>Not quite — have another look.</p>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function FillStep({ step, onAnswer, done }: { step: Extract<Step, { kind: 'fill' }>; onAnswer: (correct: boolean) => void; done: boolean }) {
  const parts = useMemo(() => step.template.split('___'), [step.template]);
  const [vals, setVals] = useState<string[]>(() => (done ? step.answers.map((a) => a[0]) : step.answers.map(() => '')));
  const [result, setResult] = useState<boolean[] | null>(done ? step.answers.map(() => true) : null);
  const check = () => {
    const r = vals.map((v, i) => step.answers[i].some((a) => a.trim() === v.trim()));
    setResult(r);
    const ok = r.every(Boolean);
    haptic(ok ? 'success' : 'error');
    onAnswer(ok);
  };
  const allOk = result?.every(Boolean);
  return (
    <div>
      <Markdown>{step.md}</Markdown>
      <div className={s.fill}>
        {parts.map((p, i) => (
          <span key={i}>
            <span className={s.fillText}>{p}</span>
            {i < parts.length - 1 && (
              <input
                className={[s.fillInput, result && (result[i] ? s.fillOk : s.fillBad)].filter(Boolean).join(' ')}
                value={vals[i]}
                size={Math.max(3, (step.answers[i][0] ?? '').length + 1)}
                onChange={(e) => {
                  const v = [...vals];
                  v[i] = e.target.value;
                  setVals(v);
                  setResult(null);
                }}
                onKeyDown={(e) => e.key === 'Enter' && check()}
                disabled={allOk}
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                aria-label={`Blank ${i + 1}`}
              />
            )}
          </span>
        ))}
      </div>
      {!allOk && (
        <Button size="small" onClick={check} disabled={vals.some((v) => !v.trim())} className={s.checkBtn}>
          Check
        </Button>
      )}
      {result && (
        <div className={allOk ? s.explainOk : s.explainTry}>
          {allOk ? <Markdown>{step.explain}</Markdown> : <p>Some blanks aren’t right yet (marked in red).</p>}
        </div>
      )}
    </div>
  );
}

function shuffled<T>(xs: T[], seed: number): T[] {
  const a = [...xs];
  let x = seed || 1;
  for (let i = a.length - 1; i > 0; i--) {
    x = (x * 9301 + 49297) % 233280;
    const j = Math.floor((x / 233280) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  if (a.every((v, i) => v === xs[i]) && a.length > 1) [a[0], a[1]] = [a[1], a[0]];
  return a;
}

export function OrderStep({ step, onAnswer, done }: { step: Extract<Step, { kind: 'order' }>; onAnswer: (correct: boolean) => void; done: boolean }) {
  const [items, setItems] = useState(() => (done ? step.lines.map((l, i) => ({ id: i, l })) : shuffled(step.lines.map((l, i) => ({ id: i, l })), step.id.length * 7 + step.lines.length)));
  const [result, setResult] = useState<boolean | null>(done ? true : null);
  useEffect(() => setResult(done ? true : null), [done]);
  const check = () => {
    const ok = items.every((it, i) => it.l === step.lines[i]);
    setResult(ok);
    haptic(ok ? 'success' : 'error');
    onAnswer(ok);
  };
  return (
    <div>
      <Markdown>{step.md}</Markdown>
      <Reorder.Group axis="y" values={items} onReorder={(v) => !result && setItems(v)} className={s.order}>
        {items.map((it, i) => (
          <Reorder.Item key={it.id} value={it} className={[s.orderItem, result === true && s.orderOk, result === false && it.l !== step.lines[i] && s.orderBad].filter(Boolean).join(' ')} dragListener={!result}>
            <span className={s.grip} aria-hidden="true">
              ⋮⋮
            </span>
            <code>{highlightShell(it.l)}</code>
            {!result && (
              <span className={s.moveBtns}>
                <button
                  aria-label="Move up"
                  onClick={() => i > 0 && setItems((x) => {
                    const y = [...x];
                    [y[i - 1], y[i]] = [y[i], y[i - 1]];
                    return y;
                  })}
                >
                  ↑
                </button>
                <button
                  aria-label="Move down"
                  onClick={() => i < items.length - 1 && setItems((x) => {
                    const y = [...x];
                    [y[i + 1], y[i]] = [y[i], y[i + 1]];
                    return y;
                  })}
                >
                  ↓
                </button>
              </span>
            )}
          </Reorder.Item>
        ))}
      </Reorder.Group>
      {result !== true && (
        <Button size="small" onClick={check} className={s.checkBtn}>
          Check order
        </Button>
      )}
      {result !== null && <div className={result ? s.explainOk : s.explainTry}>{result ? <Markdown>{step.explain}</Markdown> : <p>Not yet — the lines in red are out of place. Drag or use the arrows.</p>}</div>}
    </div>
  );
}

export function WidgetStep({ step, onComplete }: { step: Extract<Step, { kind: 'widget' }>; onComplete: () => void }) {
  return (
    <div>
      {step.md && <Markdown>{step.md}</Markdown>}
      <Widget kind={step.widget} props={step.props} onComplete={onComplete} />
    </div>
  );
}
