import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { buildFixture } from '../../content';
import { getCase } from '../../content/cases';
import { lookupRef } from '../../content/reference';
import { Icon } from '../../design/Icon';
import { highlightShell, Markdown } from '../../design/Markdown';
import { Button, haptic, IconButton, Segmented } from '../../design/ui';
import { ScriptEditor } from '../../editor/ScriptEditor';
import { expandHome, gradeCase, type CaseTestResult } from '../../engine/grader';
import { xpAfterHints } from '../../engine/progress';
import { useApp } from '../../store/app';
import { TerminalSession } from '../../terminal/session';
import { TerminalPanel } from '../../terminal/TerminalPanel';
import type { CaseFile } from '../../content/types';
import s from './CaseView.module.css';

export default function CaseView() {
  const { id } = useParams();
  const cs = getCase(id ?? '');
  if (!cs) {
    return (
      <div className={s.missing}>
        <h1 className="title">Case not found</h1>
        <Link to="/path?tab=cases">Back to case files</Link>
      </div>
    );
  }
  return <CaseInner key={cs.id} cs={cs} />;
}

type Tab = 'brief' | 'script' | 'terminal' | 'review';

function CaseInner({ cs }: { cs: CaseFile }) {
  const navigate = useNavigate();
  const key = 'case:' + cs.id;
  const draft = useApp((st) => st.drafts[key]) ?? cs.starter;
  const setDraft = useApp((st) => st.setDraft);
  const rec = useApp((st) => st.challenges[key]);
  const solveChallenge = useApp((st) => st.solveChallenge);
  const takeHint = useApp((st) => st.takeHint);
  const attempt = useApp((st) => st.attempt);
  const [tab, setTab] = useState<Tab>('brief');
  const [results, setResults] = useState<CaseTestResult[] | null>(null);
  const [running, setRunning] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const [showSolution, setShowSolution] = useState(false);
  const scriptAbs = expandHome(cs.scriptPath);
  const hints = rec?.hints ?? 0;
  const solved = !!rec?.solved;

  const session = useMemo(() => {
    const vfs = buildFixture(cs.fixture);
    const dir = scriptAbs.slice(0, scriptAbs.lastIndexOf('/'));
    if (!vfs.exists(dir)) vfs.mkdir(dir, { parents: true, cred: { uid: 1000, gid: 1000 } });
    vfs.writeFile(scriptAbs, useApp.getState().drafts[key] ?? cs.starter, { cred: { uid: 1000, gid: 1000 } });
    vfs.lookup(scriptAbs).mode = 0o755;
    return new TerminalSession({ vfs, banner: `Case ${cs.number} · ${cs.title}\nYour script: ${cs.scriptPath}  —  run it with: bash ${cs.scriptPath} ${cs.usage.replace(/^\S+\s*/, '')}\n`, hasManual: (t) => !!lookupRef(t) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cs]);

  // editor → VFS
  useEffect(() => {
    try {
      session.vfs.writeFile(scriptAbs, draft, { cred: { uid: 1000, gid: 1000 } });
    } catch {}
  }, [draft, session, scriptAbs]);

  // VFS (nano in terminal) → editor
  useEffect(() => {
    session.onCommand = () => {
      const cur = session.vfs.tryRead(scriptAbs);
      if (cur !== null && cur !== useApp.getState().drafts[key]) setDraft(key, cur);
    };
    return () => {
      session.onCommand = undefined;
    };
  }, [session, scriptAbs, key, setDraft]);

  const runTests = async () => {
    setRunning(true);
    setTab('review');
    attempt(key);
    try {
      const r = await gradeCase(cs, draft);
      setResults(r);
      const ok = r.every((x) => x.ok);
      haptic(ok ? 'stamp' : 'error');
      if (ok && !solved) solveChallenge(key, 'case', xpAfterHints(cs.xp, hints, showSolution && !solved), hints, showSolution);
      setOpen(ok ? null : r.findIndex((x) => !x.ok));
    } finally {
      setRunning(false);
    }
  };

  const passCount = results?.filter((r) => r.ok).length ?? 0;

  const brief = (
    <div className={s.brief}>
      <div className={s.fileHead}>
        <span className={s.caseNo}>CASE {String(cs.number).padStart(2, '0')}</span>
        <span className={s.diff}>
          {[1, 2, 3, 4, 5].map((i) => (
            <i key={i} className={i <= cs.difficulty ? s.on : ''} />
          ))}
        </span>
      </div>
      <h1 className={s.title}>{cs.title}</h1>
      {solved && <div className={s.solvedStamp}>Solved</div>}
      <Markdown dropcap>{cs.brief}</Markdown>
      <h2 className={s.h}>Requirements</h2>
      <ul className={s.reqs}>
        {cs.requirements.map((r) => (
          <li key={r}>
            <Markdown>{r}</Markdown>
          </li>
        ))}
      </ul>
      <h2 className={s.h}>Usage</h2>
      <pre className={s.code}>
        <code>{highlightShell(cs.usage)}</code>
      </pre>
      {cs.sampleOutput && (
        <>
          <h2 className={s.h}>Expected output (example)</h2>
          <pre className={s.sample}>{cs.sampleOutput}</pre>
        </>
      )}
      <h2 className={s.h}>Hints</h2>
      {hints > 0 && (
        <ol className={s.hints}>
          {cs.hints.slice(0, hints).map((h, i) => (
            <li key={i}>
              <Markdown>{h}</Markdown>
            </li>
          ))}
        </ol>
      )}
      {hints < cs.hints.length ? (
        <Button variant="ghost" size="small" icon="hint" onClick={() => takeHint(key)}>
          Reveal a hint ({cs.hints.length - hints} left · costs XP)
        </Button>
      ) : (
        <p className={s.muted}>No more hints. You’ve got this.</p>
      )}
    </div>
  );

  const editor = (
    <div className={s.editorWrap}>
      <div className={s.editorBar}>
        <code>{cs.scriptPath}</code>
        <button
          className={s.linkBtn}
          onClick={() => {
            if (window.confirm('Reset the script to the starter template?')) setDraft(key, cs.starter);
          }}
        >
          Reset
        </button>
      </div>
      <div className={s.editorBody}>
        <ScriptEditor value={draft} onChange={(v) => setDraft(key, v)} />
      </div>
    </div>
  );

  const terminal = <TerminalPanel session={session} className={s.term} title={`case ${cs.number} — bash`} />;

  const review = (
    <div className={s.review}>
      <div className={s.reviewHead}>
        <div>
          <div className="kicker">Case review</div>
          <h2 className={s.reviewTitle}>{results ? (passCount === results.length ? 'All tests passed' : `${passCount} of ${results.length} tests passed`) : 'Run the tests when you’re ready'}</h2>
        </div>
        <Button onClick={runTests} disabled={running} icon="play">
          {running ? 'Testing…' : results ? 'Run again' : 'Run tests'}
        </Button>
      </div>
      <p className={s.muted}>Your script runs against fresh copies of the evidence, including inputs you haven’t seen, and its output is compared with Mara’s reference script.</p>
      {results && (
        <ul className={s.tests}>
          {results.map((r, i) => (
            <li key={i} className={r.ok ? s.pass : s.fail}>
              <button className={s.testHead} onClick={() => setOpen(open === i ? null : i)}>
                <span className={s.testIcon}>{r.ok ? <Icon name="check" size={14} /> : <Icon name="close" size={14} />}</span>
                <span className={s.testName}>{r.name}</span>
                <code className={s.testArgs}>{r.args.join(' ')}</code>
                <Icon name={open === i ? 'chevronDown' : 'chevronRight'} size={16} />
              </button>
              <AnimatePresence initial={false}>
                {open === i && (
                  <motion.div className={s.testBody} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
                    {r.message && <p className={s.testMsg}>{r.message}</p>}
                    <div className={s.diffCols}>
                      <div>
                        <span>Expected</span>
                        <pre>{r.expected || '(no output)'}</pre>
                      </div>
                      <div>
                        <span>Your script</span>
                        <pre>{r.actual || '(no output)'}</pre>
                      </div>
                    </div>
                    {r.stderr && (
                      <div className={s.stderr}>
                        <span>Errors</span>
                        <pre>{r.stderr}</pre>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </li>
          ))}
        </ul>
      )}
      {solved && (
        <motion.div className={s.closed} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}>
          <motion.div className={s.bigStamp} initial={{ scale: 2, rotate: -20, opacity: 0 }} animate={{ scale: 1, rotate: -8, opacity: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 18 }}>
            Case closed
          </motion.div>
          <p>+{rec?.xp ?? cs.xp} XP. Here’s how Mara wrote it — compare it with yours.</p>
        </motion.div>
      )}
      {(solved || showSolution) && (
        <div className={s.solution}>
          <h2 className={s.h}>Reference solution</h2>
          <pre className={s.code}>
            <code>{highlightShell(cs.solution)}</code>
          </pre>
          <Markdown>{cs.walkthrough}</Markdown>
        </div>
      )}
      {!solved && !showSolution && (rec?.attempts ?? 0) >= 3 && hints >= cs.hints.length && (
        <Button variant="ghost" size="small" icon="eye" onClick={() => setShowSolution(true)}>
          Stuck? Show the reference solution (reduces XP)
        </Button>
      )}
    </div>
  );

  return (
    <div className={s.page}>
      <header className={s.top}>
        <IconButton icon="close" label="Back" onClick={() => navigate('/path?tab=cases')} />
        <div className={s.topTitle}>
          <span>Case {cs.number}</span> · {cs.title}
        </div>
        <Button size="small" onClick={runTests} disabled={running} icon="play" className={s.topRun}>
          Test
        </Button>
      </header>
      <div className={s.tabs}>
        <Segmented<Tab>
          id="case-tab"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'brief', label: 'Brief' },
            { value: 'script', label: 'Script' },
            { value: 'terminal', label: 'Terminal' },
            { value: 'review', label: results ? `Tests ${passCount}/${results.length}` : 'Tests' },
          ]}
        />
      </div>
      <div className={s.mobile}>
        <div hidden={tab !== 'brief'} className={s.scroll}>
          {brief}
        </div>
        <div hidden={tab !== 'script'} className={s.fill}>
          {editor}
        </div>
        <div hidden={tab !== 'terminal'} className={s.fill}>
          {tab === 'terminal' && terminal}
        </div>
        <div hidden={tab !== 'review'} className={s.scroll}>
          {review}
        </div>
      </div>
      <div className={s.desktop}>
        <div className={s.left}>
          {brief}
          <div className={s.sep} />
          {review}
        </div>
        <div className={s.right}>
          <div className={s.rightTop}>{editor}</div>
          <div className={s.rightBottom}>{tab !== 'terminal' && terminal}</div>
        </div>
      </div>
    </div>
  );
}

