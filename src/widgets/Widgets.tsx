// Interactive explainers embedded in lessons.

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { buildFixture } from '../content';
import { runIn } from '../engine/grader';
import { modeString } from '../shell/vfs';
import { parse } from '../shell/parser';
import { Shell } from '../shell/shell';
import { VFS } from '../shell/vfs';
import { InBuf } from '../shell/io';
import { posixRegex } from '../shell/pattern';
import type { WidgetKind } from '../content/types';
import s from './widgets.module.css';

export interface WidgetProps {
  props?: Record<string, unknown>;
  onComplete?: () => void;
}

// ------------------------------------------------------------------ prompt anatomy

const PROMPT_PARTS = [
  { key: 'user', text: 'analyst', cls: s.pUser, title: 'analyst — who you are', body: 'The user you’re logged in as. Commands run with this user’s permissions.' },
  { key: 'at', text: '@', cls: s.pPunct, title: '@ — “at”', body: 'Just a separator: user at machine.' },
  { key: 'host', text: 'halden-ws01', cls: s.pHost, title: 'halden-ws01 — which machine', body: 'The computer you’re typing on. When you manage ten servers in ten tabs, this is how you avoid running a command on the wrong one.' },
  { key: 'colon', text: ':', cls: s.pPunct, title: ': — separator', body: 'Separates the machine from the current folder.' },
  { key: 'path', text: '~', cls: s.pPath, title: '~ — where you are', body: 'Your current directory. `~` is short for your home folder, /home/analyst. It changes as you move around.' },
  { key: 'sigil', text: '$', cls: s.pSigil, title: '$ — what kind of user', body: '`$` means a normal user. If you ever see `#`, you are root — the all-powerful administrator — so slow down.' },
];

export function PromptAnatomy({ onComplete }: WidgetProps) {
  const [active, setActive] = useState<string | null>(null);
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const keyParts = ['user', 'host', 'path', 'sigil'];
  useEffect(() => {
    if (keyParts.every((k) => seen.has(k))) onComplete?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seen]);
  const part = PROMPT_PARTS.find((p) => p.key === active);
  return (
    <div className={s.widget}>
      <div className={s.promptLine}>
        {PROMPT_PARTS.map((p) => (
          <button
            key={p.key}
            className={[s.part, p.cls, active === p.key && s.partActive, seen.has(p.key) && s.partSeen].filter(Boolean).join(' ')}
            onClick={() => {
              setActive(p.key);
              setSeen((x) => new Set(x).add(p.key));
            }}
          >
            {p.text}
          </button>
        ))}
        <span className={s.pPunct}>&nbsp;</span>
      </div>
      <div className={s.explain} aria-live="polite">
        <AnimatePresence mode="wait">
          {part ? (
            <motion.div key={part.key} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }}>
              <div className={s.explainTitle}>{part.title}</div>
              <div className={s.explainBody}>{part.body.replace(/`/g, '')}</div>
            </motion.div>
          ) : (
            <motion.div key="none" className={s.explainBody} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              Tap a coloured part of the prompt.
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div className={s.progressDots} aria-label={`${keyParts.filter((k) => seen.has(k)).length} of 4 explored`}>
        {keyParts.map((k) => (
          <span key={k} className={seen.has(k) ? s.on : ''} />
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ permission bits

const WHO = [
  { key: 'u', label: 'Owner', sub: 'user' },
  { key: 'g', label: 'Group', sub: 'group' },
  { key: 'o', label: 'Others', sub: 'everyone else' },
];
const BITS = [
  { key: 'r', val: 4, verb: 'read' },
  { key: 'w', val: 2, verb: 'write' },
  { key: 'x', val: 1, verb: 'execute' },
];

export function PermissionBits({ props, onComplete }: WidgetProps) {
  const [mode, setMode] = useState<number>(typeof props?.start === 'number' ? (props.start as number) : 0o640);
  const [touched, setTouched] = useState(0);
  useEffect(() => {
    if (touched >= 3) onComplete?.();
  }, [touched, onComplete]);
  const toggle = (shift: number, val: number) => {
    setMode((m) => m ^ (val << shift));
    setTouched((t) => t + 1);
  };
  const octal = (mode & 0o777).toString(8).padStart(3, '0');
  const str = modeString({ type: 'file', mode, uid: 0, gid: 0, mtime: 0 });
  const sym = WHO.map((w, i) => {
    const bits = (mode >> ((2 - i) * 3)) & 7;
    return `${w.key}=${BITS.filter((b) => bits & b.val).map((b) => b.key).join('')}`;
  }).join(',');
  const describe = (i: number) => {
    const bits = (mode >> ((2 - i) * 3)) & 7;
    const verbs = BITS.filter((b) => bits & b.val).map((b) => b.verb);
    return verbs.length ? verbs.join(' & ') : 'nothing';
  };
  return (
    <div className={s.widget}>
      <div className={s.permGrid}>
        <span />
        {BITS.map((b) => (
          <span key={b.key} className={s.permHead}>
            {b.key} · {b.val}
          </span>
        ))}
        {WHO.map((w, i) => (
          <PermRow key={w.key} label={w.label} sub={w.sub} shift={(2 - i) * 3} mode={mode} toggle={toggle} />
        ))}
      </div>
      <div className={s.permOut}>
        <div className={s.permCell}>
          <b>{str}</b>
          <span>ls -l</span>
        </div>
        <div className={s.permCell}>
          <b>{octal}</b>
          <span>octal</span>
        </div>
        <div className={s.permCell}>
          <b style={{ fontSize: '0.78rem' }}>{sym}</b>
          <span>symbolic</span>
        </div>
      </div>
      <p className={s.sentence}>
        The owner can <b>{describe(0)}</b>; the group can <b>{describe(1)}</b>; everyone else can <b>{describe(2)}</b>.
        <br />
        <code>chmod {octal} file</code>
      </p>
      <div className={s.presets}>
        {[0o644, 0o600, 0o755, 0o700, 0o777].map((p) => (
          <button
            key={p}
            className={s.preset}
            onClick={() => {
              setMode(p);
              setTouched((t) => t + 1);
            }}
          >
            {p.toString(8)}
          </button>
        ))}
      </div>
    </div>
  );
}

function PermRow({ label, sub, shift, mode, toggle }: { label: string; sub: string; shift: number; mode: number; toggle: (shift: number, val: number) => void }) {
  return (
    <>
      <span className={s.permWho}>
        {label}
        <small>{sub}</small>
      </span>
      {BITS.map((b) => {
        const on = (mode >> shift) & b.val;
        return (
          <button key={b.key} className={[s.bit, on && s.bitOn].filter(Boolean).join(' ')} onClick={() => toggle(shift, b.val)} aria-pressed={!!on} aria-label={`${label} ${b.verb}`}>
            {on ? b.key : '-'}
          </button>
        );
      })}
    </>
  );
}

// ------------------------------------------------------------------ pipeline visualiser

export function PipeVisualizer({ props, onComplete }: WidgetProps) {
  const pipeline = (props?.pipeline as string) ?? "grep 'Failed password' /var/log/auth.log | awk '{print $(NF-3)}' | sort | uniq -c | sort -rn | head -5";
  const fixture = (props?.fixture as string) ?? 'base';
  const stagesSrc = useMemo(() => splitPipeline(pipeline), [pipeline]);
  const [outputs, setOutputs] = useState<string[] | null>(null);
  const [active, setActive] = useState(0);
  const [seen, setSeen] = useState<Set<number>>(new Set([0]));
  useEffect(() => {
    let alive = true;
    (async () => {
      const vfs = buildFixture(fixture);
      const outs: string[] = [];
      for (let i = 0; i < stagesSrc.length; i++) {
        const r = await runIn(vfs.clone(), stagesSrc.slice(0, i + 1).join(' | '), { user: 'root', cwd: '/home/analyst' });
        outs.push(r.stdout);
      }
      if (alive) setOutputs(outs);
    })();
    return () => {
      alive = false;
    };
  }, [stagesSrc, fixture]);
  useEffect(() => {
    if (seen.size >= stagesSrc.length) onComplete?.();
  }, [seen, stagesSrc.length, onComplete]);
  const lines = (t: string) => (t ? t.replace(/\n$/, '').split('\n').length : 0);
  const out = outputs?.[active] ?? '';
  const shown = out.split('\n').slice(0, 40).join('\n') + (lines(out) > 40 ? `\n… ${lines(out) - 40} more lines` : '');
  return (
    <div className={s.widget}>
      <div className={s.stages}>
        {stagesSrc.map((st, i) => (
          <div key={i} style={{ display: 'contents' }}>
            {i > 0 && <span className={s.pipe}>|</span>}
            <button
              className={[s.stage, active === i && s.stageActive].filter(Boolean).join(' ')}
              onClick={() => {
                setActive(i);
                setSeen((x) => new Set(x).add(i));
              }}
            >
              <span className={s.stageNum}>{i + 1}</span>
              <code>{st}</code>
              <span className={s.stageCount}>{outputs ? `${lines(outputs[i])} lines` : '…'}</span>
            </button>
          </div>
        ))}
      </div>
      <div className={s.stageLabel}>Output after step {active + 1}</div>
      <div className={s.stageOut}>{outputs ? shown || '(no output)' : 'Running…'}</div>
      <div className={s.caption}>Tap each step to watch the data change as it flows down the pipe.</div>
    </div>
  );
}

function splitPipeline(src: string): string[] {
  const parts: string[] = [];
  let cur = '';
  let q: string | null = null;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === q) q = null;
      cur += c;
      continue;
    }
    if (c === "'" || c === '"') {
      q = c;
      cur += c;
      continue;
    }
    if (c === '|' && src[i + 1] !== '|' && src[i - 1] !== '|') {
      parts.push(cur.trim());
      cur = '';
      continue;
    }
    cur += c;
  }
  parts.push(cur.trim());
  return parts;
}

// ------------------------------------------------------------------ expansion stepper

export function ExpansionStepper({ props, onComplete }: WidgetProps) {
  const [line, setLine] = useState((props?.line as string) ?? 'echo "$name has" $files');
  const setup = (props?.setup as string) ?? 'name="Mara Okafor"; files="a.log b.log"';
  const [result, setResult] = useState<{ words: { raw: string; expanded: string; fields: string[] }[]; error?: string } | null>(null);
  const [changed, setChanged] = useState(false);
  useEffect(() => {
    if (changed) onComplete?.();
  }, [changed, onComplete]);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const vfs = new VFS();
        vfs.mkdir('/home/analyst/logs', { parents: true });
        for (const f of ['a.log', 'b.log', 'notes.txt']) vfs.writeFile('/home/analyst/logs/' + f, '');
        const sh = new Shell({ vfs, cwd: '/home/analyst/logs', fastSleep: true });
        await sh.run(setup, { stdin: InBuf.empty(), stdout: { write() {} }, stderr: { write() {} } });
        const prog = parse(line);
        const first = prog.items[0]?.node;
        if (!first || first.type !== 'simple') throw new Error('Type a single simple command');
        const words = [];
        for (const w of first.words) {
          words.push({ raw: w.raw, expanded: await sh.expandString(w), fields: await sh.expandFields(w) });
        }
        if (alive) setResult({ words });
      } catch (e) {
        if (alive) setResult({ words: [], error: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      alive = false;
    };
  }, [line, setup]);
  const finalArgs = result?.words.flatMap((w) => w.fields) ?? [];
  return (
    <div className={s.widget}>
      <div className={s.stageLabel} style={{ marginTop: 0 }}>
        Setup: <code>{setup}</code>
      </div>
      <input
        className={s.field}
        style={{ marginTop: 10 }}
        value={line}
        onChange={(e) => {
          setLine(e.target.value);
          setChanged(true);
        }}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        aria-label="Command line to expand"
      />
      {result?.error ? (
        <div className={s.errorText}>{result.error}</div>
      ) : (
        <>
          <div className={s.stageLabel}>1 · Words as you typed them</div>
          <div className={s.list}>
            {result?.words.map((w, i) => (
              <span key={i} className={s.arg} style={{ background: 'var(--paper-2)', color: 'var(--ink)' }}>
                {w.raw}
              </span>
            ))}
          </div>
          <div className={s.stageLabel}>2 · After $variables and $(commands) expand</div>
          <div className={s.list}>
            {result?.words.map((w, i) => (
              <span key={i} className={s.arg} style={{ background: 'var(--paper-2)', color: 'var(--ink)' }}>
                {w.expanded || '∅'}
              </span>
            ))}
          </div>
          <div className={s.stageLabel}>3 · Final arguments after splitting & globbing</div>
          <div className={s.list}>
            {finalArgs.map((a, i) => (
              <span key={i} className={s.arg}>
                <span className={s.argNum}>${i}</span>
                {a}
              </span>
            ))}
          </div>
          <div className={s.caption}>Try removing or adding quotes and watch the final arguments change. Unquoted variables split on spaces; quotes keep them whole.</div>
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ regex playground

const SAMPLE_TEXT = `From: "IT Support" <support@halden-secure.co>
Reset your password at http://login.halden-secure.co/verify?id=4421
Backup link: https://203.0.113.50/reset.php
Questions? Mail helpdesk@halden.example or call ext. 4410.
Server 10.20.0.21 and db 10.20.0.22 are internal.`;

const PRESETS = [
  { label: 'IPv4', re: '([0-9]{1,3}\\.){3}[0-9]{1,3}' },
  { label: 'email', re: '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}' },
  { label: 'URL', re: 'https?://[^ ]+' },
  { label: 'digits', re: '[0-9]+' },
  { label: 'line start', re: '^[A-Z][a-z]+' },
];

export function RegexPlayground({ props, onComplete }: WidgetProps) {
  const [re, setRe] = useState((props?.regex as string) ?? '[0-9]+');
  const [text, setText] = useState((props?.text as string) ?? SAMPLE_TEXT);
  const [tries, setTries] = useState(0);
  useEffect(() => {
    if (tries >= 2) onComplete?.();
  }, [tries, onComplete]);
  let error: string | null = null;
  let rx: RegExp | null = null;
  try {
    rx = re ? posixRegex(re, { extended: true, global: true }) : null;
  } catch (e) {
    error = e instanceof Error ? e.message.replace(/^Invalid regular expression: /, '') : String(e);
  }
  const marked: (string | ReactElement)[] = [];
  const matches: string[] = [];
  if (rx) {
    text.split('\n').forEach((line, li) => {
      if (li) marked.push('\n');
      let last = 0;
      const r = new RegExp(rx!.source, 'g' + (rx!.ignoreCase ? 'i' : ''));
      let m: RegExpExecArray | null;
      while ((m = r.exec(line))) {
        if (m[0] === '') {
          r.lastIndex++;
          continue;
        }
        marked.push(line.slice(last, m.index));
        marked.push(
          <mark key={`${li}-${m.index}`} className={s.mark}>
            {m[0]}
          </mark>,
        );
        matches.push(m[0]);
        last = m.index + m[0].length;
      }
      marked.push(line.slice(last));
    });
  } else marked.push(text);
  return (
    <div className={s.widget}>
      <input
        className={s.field}
        value={re}
        onChange={(e) => {
          setRe(e.target.value);
          setTries((t) => t + 1);
        }}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        aria-label="Regular expression (ERE)"
      />
      <div className={s.presets}>
        {PRESETS.map((p) => (
          <button
            key={p.label}
            className={s.preset}
            onClick={() => {
              setRe(p.re);
              setTries((t) => t + 1);
            }}
          >
            {p.label}
          </button>
        ))}
      </div>
      {error && <div className={s.errorText}>{error}</div>}
      <div className={s.matchText}>{marked}</div>
      <div className={s.stageLabel}>
        grep -oE '{re}' → {matches.length} match{matches.length === 1 ? '' : 'es'}
      </div>
      <details style={{ marginTop: 8 }}>
        <summary className={s.caption} style={{ cursor: 'pointer' }}>
          Edit the sample text
        </summary>
        <textarea className={s.textarea} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
      </details>
    </div>
  );
}

// ------------------------------------------------------------------ path explorer

interface TreeNode {
  name: string;
  path: string;
  children: TreeNode[];
}

const TREE_DIRS = ['/', '/etc', '/etc/ssh', '/home', '/home/analyst', '/home/analyst/cases', '/home/analyst/cases/2026', '/home/mara', '/tmp', '/var', '/var/log', '/var/log/apache2'];

function buildTree(): TreeNode {
  const nodes = new Map<string, TreeNode>();
  for (const p of TREE_DIRS) nodes.set(p, { name: p === '/' ? '/' : p.slice(p.lastIndexOf('/') + 1), path: p, children: [] });
  for (const p of TREE_DIRS) {
    if (p === '/') continue;
    const parent = p.slice(0, p.lastIndexOf('/')) || '/';
    nodes.get(parent)?.children.push(nodes.get(p)!);
  }
  return nodes.get('/')!;
}

function relPath(from: string, to: string): string {
  if (from === to) return '.';
  const a = from.split('/').filter(Boolean);
  const b = to.split('/').filter(Boolean);
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  const up = a.slice(i).map(() => '..');
  return [...up, ...b.slice(i)].join('/') || '.';
}

export function PathExplorer({ onComplete }: WidgetProps) {
  const tree = useMemo(buildTree, []);
  const [cwd, setCwd] = useState('/home/analyst');
  const [prev, setPrev] = useState('/home/analyst');
  const [moves, setMoves] = useState(0);
  useEffect(() => {
    if (moves >= 3) onComplete?.();
  }, [moves, onComplete]);
  const go = (p: string) => {
    if (p === cwd) return;
    setPrev(cwd);
    setCwd(p);
    setMoves((m) => m + 1);
  };
  const render = (n: TreeNode, prefix: string, last: boolean, root = false): ReactElement => (
    <div key={n.path}>
      {!root && <span>{prefix + (last ? '└── ' : '├── ')}</span>}
      <button className={[s.node, n.path === cwd && s.nodeHere].filter(Boolean).join(' ')} onClick={() => go(n.path)}>
        {n.name}
        {n.path === '/home/analyst' ? ' (~)' : ''}
      </button>
      {n.children.map((c, i) => render(c, root ? '' : prefix + (last ? '    ' : '│   '), i === n.children.length - 1))}
    </div>
  );
  const home = '/home/analyst';
  const tildePath = cwd === home ? '~' : cwd.startsWith(home + '/') ? '~' + cwd.slice(home.length) : cwd;
  return (
    <div className={s.widget}>
      <div className={s.treeWrap}>
        <div className={s.tree}>{render(tree, '', true, true)}</div>
      </div>
      <div className={s.cmdPreview}>
        <div className={s.cmdRow}>
          <span>Absolute</span>
          <code>cd {cwd}</code>
        </div>
        <div className={s.cmdRow}>
          <span>Relative</span>
          <code>cd {relPath(prev, cwd)}</code>
        </div>
        <div className={s.cmdRow}>
          <span>Prompt</span>
          <code>analyst@halden-ws01:{tildePath}$</code>
        </div>
      </div>
      <div className={s.caption}>Tap folders to move. “Relative” is how to get there from where you were ({prev === home ? '~' : prev}).</div>
    </div>
  );
}

// ------------------------------------------------------------------ registry

export function Widget({ kind, props, onComplete }: { kind: WidgetKind } & WidgetProps) {
  switch (kind) {
    case 'anatomy':
      return <PromptAnatomy props={props} onComplete={onComplete} />;
    case 'permissions':
      return <PermissionBits props={props} onComplete={onComplete} />;
    case 'pipeline':
      return <PipeVisualizer props={props} onComplete={onComplete} />;
    case 'expansion':
      return <ExpansionStepper props={props} onComplete={onComplete} />;
    case 'regex':
      return <RegexPlayground props={props} onComplete={onComplete} />;
    case 'paths':
      return <PathExplorer props={props} onComplete={onComplete} />;
  }
}

