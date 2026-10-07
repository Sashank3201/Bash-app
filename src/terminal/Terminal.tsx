import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { applyCR, parseAnsi } from './ansi';
import { complete, suggest } from './complete';
import type { Entry, TerminalSession } from './session';
import s from './Terminal.module.css';

export function useSession(session: TerminalSession) {
  return useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
}

function Ansi({ text }: { text: string }) {
  const spans = parseAnsi(applyCR(text));
  return (
    <>
      {spans.map((sp, i) =>
        sp.fg || sp.bg || sp.bold || sp.dim || sp.italic || sp.underline ? (
          <span
            key={i}
            style={{
              color: sp.fg,
              background: sp.bg,
              fontWeight: sp.bold ? 650 : undefined,
              opacity: sp.dim ? 0.65 : undefined,
              fontStyle: sp.italic ? 'italic' : undefined,
              textDecoration: sp.underline ? 'underline' : undefined,
            }}
          >
            {sp.text}
          </span>
        ) : (
          <span key={i}>{sp.text}</span>
        ),
      )}
    </>
  );
}

/** Inline `code` in coach text. */
function CoachText({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`)/g);
  return <>{parts.map((p, i) => (p.startsWith('`') && p.endsWith('`') ? <code key={i}>{p.slice(1, -1)}</code> : <span key={i}>{p}</span>))}</>;
}

function Prompt({ text }: { text: string }) {
  const m = /^([^@]+@[^:]+):(.*)([$#]) $/.exec(text);
  if (!m) return <span className={s.pSigil}>{text}</span>;
  return (
    <>
      <span className={s.pUser}>{m[1]}</span>
      <span className={s.pSigil}>:</span>
      <span className={s.pPath}>{m[2]}</span>
      <span className={s.pSigil}>{m[3]} </span>
    </>
  );
}

const EntryView = memo(function EntryView({ e, onExplain }: { e: Entry; onExplain?: (src: string) => void }) {
  switch (e.kind) {
    case 'cmd':
      return (
        <div
          className={[s.cmd, onExplain && e.prompt ? s.cmdTap : ''].join(' ')}
          onClick={onExplain && e.prompt && e.text.trim() ? () => onExplain(e.text) : undefined}
          title={onExplain && e.prompt ? 'Tap to explain this command' : undefined}
        >
          <Prompt text={e.prompt ?? ''} />
          <span className={s.cmdText}>{e.text}</span>
        </div>
      );
    case 'out':
      return (
        <div className={s.out}>
          <Ansi text={e.text} />
        </div>
      );
    case 'err':
      return (
        <div className={s.err}>
          <Ansi text={e.text} />
        </div>
      );
    case 'coach':
      return (
        <div className={s.coach} role="note">
          <span className={s.coachLabel}>Mara’s tip</span>
          <CoachText text={e.text} />
        </div>
      );
    case 'banner':
      return <div className={s.banner}>{e.text}</div>;
    default:
      return <div className={s.note}>{e.text}</div>;
  }
});

const KEYS: { label: string; send: string; wide?: boolean; title?: string }[] = [
  { label: 'Tab', send: 'TAB', wide: true },
  { label: '↑', send: 'UP', title: 'Previous command' },
  { label: '↓', send: 'DOWN', title: 'Next command' },
  { label: '←', send: 'LEFT' },
  { label: '→', send: 'RIGHT' },
  { label: '^C', send: 'CTRLC', wide: true, title: 'Ctrl-C: stop / cancel' },
  { label: '^D', send: 'CTRLD', wide: true, title: 'Ctrl-D: end of input' },
  { label: '|', send: '|' },
  { label: '>', send: '>' },
  { label: '$', send: '$' },
  { label: '"', send: '"' },
  { label: "'", send: "'" },
  { label: '-', send: '-' },
  { label: '/', send: '/' },
  { label: '~', send: '~' },
  { label: '*', send: '*' },
  { label: '&', send: '&' },
  { label: ';', send: ';' },
  { label: '<', send: '<' },
  { label: '{', send: '{' },
  { label: '}', send: '}' },
  { label: '[', send: '[' },
  { label: ']', send: ']' },
  { label: '(', send: '(' },
  { label: ')', send: ')' },
  { label: '=', send: '=' },
  { label: '#', send: '#' },
  { label: '\\', send: '\\' },
  { label: '`', send: '`' },
  { label: '!', send: '!' },
  { label: '_', send: '_' },
];

export interface TerminalProps {
  session: TerminalSession;
  title?: string;
  flat?: boolean;
  autoFocus?: boolean;
  /** Show the touch key bar (defaults to coarse pointers). */
  keys?: boolean;
  onExplain?: (src: string) => void;
  toolbar?: ReactNode;
  className?: string;
}

export function Terminal({ session, title, flat, autoFocus, keys, onExplain, toolbar, className }: TerminalProps) {
  useSession(session);
  const [value, setValue] = useState('');
  const [chips, setChips] = useState<string[]>([]);
  const histIdx = useRef<number | null>(null);
  const draft = useRef('');
  const inputRef = useRef<HTMLInputElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const [coarse] = useState(() => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches);
  const showKeys = keys ?? coarse;

  // measure columns for `ls` layout
  useLayoutEffect(() => {
    const el = screenRef.current;
    if (!el) return;
    const measure = () => {
      const probe = document.createElement('span');
      probe.textContent = 'MMMMMMMMMM';
      probe.style.visibility = 'hidden';
      probe.style.position = 'absolute';
      el.appendChild(probe);
      const w = probe.getBoundingClientRect().width / 10 || 8;
      el.removeChild(probe);
      session.cols = Math.max(20, Math.floor((el.clientWidth - 28) / w));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [session]);

  // keep scrolled to bottom when new output arrives
  useLayoutEffect(() => {
    const el = screenRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  });

  useEffect(() => {
    if (autoFocus && !coarse) inputRef.current?.focus({ preventScroll: true });
  }, [autoFocus, coarse]);

  const onScroll = () => {
    const el = screenRef.current;
    if (!el) return;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  };

  const focus = () => {
    const sel = window.getSelection();
    if (sel && sel.toString().length > 0) return;
    inputRef.current?.focus({ preventScroll: true });
  };

  const submit = useCallback(async () => {
    const v = value;
    setValue('');
    setChips([]);
    histIdx.current = null;
    stick.current = true;
    await session.submit(v);
  }, [value, session]);

  const doTab = () => {
    const el = inputRef.current;
    const cursor = el?.selectionStart ?? value.length;
    const c = complete(session.shell, value, cursor);
    if (!c) {
      setChips([]);
      return;
    }
    const next = value.slice(0, c.start) + c.replacement + value.slice(c.end);
    setValue(next);
    setChips(c.candidates.length > 1 ? c.candidates.slice(0, 30) : []);
    requestAnimationFrame(() => {
      const pos = c.start + c.replacement.length;
      el?.setSelectionRange(pos, pos);
    });
  };

  const historyMove = (dir: -1 | 1) => {
    const h = session.history;
    if (!h.length) return;
    if (histIdx.current === null) {
      if (dir === 1) return;
      draft.current = value;
      histIdx.current = h.length - 1;
    } else {
      histIdx.current += dir;
    }
    if (histIdx.current >= h.length) {
      histIdx.current = null;
      setValue(draft.current);
      return;
    }
    histIdx.current = Math.max(0, histIdx.current);
    setValue(h[histIdx.current].replace(/\n/g, '; '));
  };

  const insert = (text: string) => {
    const el = inputRef.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const next = value.slice(0, start) + text + value.slice(end);
    setValue(next);
    requestAnimationFrame(() => {
      el?.setSelectionRange(start + text.length, start + text.length);
    });
  };

  const moveCursor = (d: number) => {
    const el = inputRef.current;
    if (!el) return;
    const pos = Math.max(0, Math.min(value.length, (el.selectionStart ?? value.length) + d));
    el.setSelectionRange(pos, pos);
  };

  const onKey = (send: string) => {
    switch (send) {
      case 'TAB':
        doTab();
        break;
      case 'UP':
        historyMove(-1);
        break;
      case 'DOWN':
        historyMove(1);
        break;
      case 'LEFT':
        moveCursor(-1);
        break;
      case 'RIGHT':
        moveCursor(1);
        break;
      case 'CTRLC':
        if (session.mode === 'busy' || session.mode === 'stdin') session.interrupt();
        else {
          if (value || session.mode === 'cont') session.push('cmd', value + '^C', session.mode === 'cont' ? '> ' : session.promptText());
          setValue('');
          session.interrupt();
        }
        break;
      case 'CTRLD':
        session.eof();
        break;
      default:
        insert(send);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void submit();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      doTab();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      historyMove(-1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      historyMove(1);
    } else if (e.ctrlKey && (e.key === 'c' || e.key === 'C') && !window.getSelection()?.toString()) {
      e.preventDefault();
      onKey('CTRLC');
    } else if (e.ctrlKey && (e.key === 'd' || e.key === 'D')) {
      e.preventDefault();
      onKey('CTRLD');
    } else if (e.ctrlKey && (e.key === 'l' || e.key === 'L')) {
      e.preventDefault();
      session.clear();
    } else if (e.ctrlKey && (e.key === 'u' || e.key === 'U')) {
      e.preventDefault();
      setValue('');
    }
  };

  const mode = session.mode;
  const live = mode === 'prompt' || mode === 'cont' ? suggest(session.shell, value, value.length) : [];
  const shownChips = chips.length ? chips : live;
  const promptText = mode === 'cont' ? '> ' : mode === 'stdin' ? '' : session.promptText();

  return (
    <div className={[s.term, flat && s.flat, className].filter(Boolean).join(' ')} data-testid="terminal">
      <div className={s.bar}>
        <div className={s.dots} aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div className={s.barTitle}>{title ?? `${session.promptParts().user}@${session.shell.hostname} — bash`}</div>
        {toolbar}
        {mode === 'busy' || mode === 'stdin' ? (
          <button className={[s.barBtn, s.stop].join(' ')} onClick={() => session.interrupt()}>
            ■ Stop
          </button>
        ) : (
          <button className={s.barBtn} onClick={() => session.clear()} title="Clear screen (Ctrl-L)">
            Clear
          </button>
        )}
      </div>
      <div className={s.screen} ref={screenRef} onScroll={onScroll} onClick={focus} role="log" aria-live="polite">
        {session.entries.map((e) => (
          <EntryView key={e.id} e={e} onExplain={onExplain} />
        ))}
        {mode === 'busy' ? (
          <div className={s.busy}>
            <span className={s.spinner} /> running… <span style={{ opacity: 0.6 }}>(Stop or ^C to interrupt)</span>
          </div>
        ) : (
          <label className={s.inputRow}>
            <Prompt text={promptText} />
            <input
              ref={inputRef}
              className={s.input}
              value={value}
              onChange={(e) => {
                setValue(e.target.value.replace(/[“”„]/g, '"').replace(/[‘’‚]/g, "'"));
                setChips([]);
                histIdx.current = null;
              }}
              onKeyDown={onKeyDown}
              onFocus={() => {
                stick.current = true;
                const el = screenRef.current;
                if (el) el.scrollTop = el.scrollHeight;
              }}
              autoCapitalize="off"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="send"
              inputMode="text"
              aria-label={mode === 'stdin' ? 'Program input' : 'Command'}
              data-testid="terminal-input"
            />
          </label>
        )}
      </div>
      {(showKeys || shownChips.length > 0) && (
        <div className={s.tray}>
          {shownChips.length > 0 && (
            <div className={s.suggest}>
              {shownChips.map((c) => (
                <button
                  key={c}
                  className={s.sugg}
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => {
                    const el = inputRef.current;
                    const cursor = el?.selectionStart ?? value.length;
                    let start = cursor;
                    while (start > 0 && !/[\s|;&<>(]/.test(value[start - 1])) start--;
                    const next = value.slice(0, start) + c + (c.endsWith('/') ? '' : ' ') + value.slice(cursor);
                    setValue(next);
                    setChips([]);
                    inputRef.current?.focus({ preventScroll: true });
                  }}
                >
                  {c}
                </button>
              ))}
            </div>
          )}
          {showKeys && (
            <div className={s.keys} role="toolbar" aria-label="Terminal keys">
              {KEYS.map((k, i) => (
                <span key={k.label} style={{ display: 'contents' }}>
                  {i === 7 && <span className={s.keySep} />}
                  <button
                    className={k.wide ? s.keyWide : s.key}
                    title={k.title}
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onKey(k.send);
                      if (!['CTRLC', 'CTRLD'].includes(k.send)) inputRef.current?.focus({ preventScroll: true });
                    }}
                  >
                    {k.label}
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
