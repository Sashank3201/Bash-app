// Terminal + the sheets it can open (editor, manual, explain) + stats tracking.

import { useEffect, useState, type ReactNode } from 'react';
import { lookupRef } from '../content/reference';
import { Button, Sheet } from '../design/ui';
import { ScriptEditor } from '../editor/ScriptEditor';
import { FsError } from '../shell/vfs';
import { useApp } from '../store/app';
import { RefPage } from '../screens/reference/RefPage';
import { explain } from './explain';
import type { TerminalSession } from './session';
import { Terminal, useSession } from './Terminal';
import s from './TerminalPanel.module.css';

/** Count commands/scripts/sudo/pipes for badges. */
export function useSessionStats(session: TerminalSession) {
  useEffect(() => {
    session.onStats = (rec, prog) => {
      const st = useApp.getState();
      st.touch();
      st.bump('commands');
      if (/(^|[\s;&|])(bash|sh)\s+\S+\.sh\b|(^|[\s;&|])\.\/\S+/.test(rec.src)) st.bump('scripts');
      if (/(^|[\s;&|])sudo\s/.test(rec.src)) st.bump('sudo');
      if (/(^|[\s;&|])man\s/.test(rec.src)) st.bump('manPages');
      let longest = 0;
      const visit = (n: unknown) => {
        if (!n || typeof n !== 'object') return;
        const o = n as { type?: string; cmds?: unknown[] };
        if (o.type === 'pipeline' && Array.isArray(o.cmds)) longest = Math.max(longest, o.cmds.length);
        for (const v of Object.values(o)) {
          if (Array.isArray(v)) v.forEach(visit);
          else if (v && typeof v === 'object') visit(v);
        }
      };
      visit(prog);
      if (longest) st.maxStat('longestPipe', longest);
    };
    return () => {
      session.onStats = undefined;
    };
  }, [session]);
}

export function FileEditor({ session, path, onDone }: { session: TerminalSession; path: string; onDone: () => void }) {
  const vfs = session.vfs;
  const [text, setText] = useState(() => vfs.tryRead(path) ?? '');
  const [saved, setSaved] = useState(() => vfs.tryRead(path) ?? '');
  const [error, setError] = useState<string | null>(null);
  const save = () => {
    try {
      vfs.writeFile(path, text, { cred: session.shell.cred });
      setSaved(text);
      setError(null);
      return true;
    } catch (e) {
      setError(e instanceof FsError ? `Can’t save: ${e.message}` : String(e));
      return false;
    }
  };
  const home = session.shell.getScalar('HOME') ?? '';
  const shown = path.startsWith(home + '/') ? '~' + path.slice(home.length) : path;
  const dirty = text !== saved;
  return (
    <div className={s.editor}>
      <div className={s.editorBar}>
        <code className={s.file}>
          {shown}
          {dirty && <span className={s.dirty}> ●</span>}
        </code>
        {error && <span className={s.error}>{error}</span>}
      </div>
      <div className={s.editorBody}>
        <ScriptEditor value={text} onChange={setText} autoFocus />
      </div>
      <div className={s.editorActions}>
        <Button variant="secondary" size="small" onClick={onDone}>
          {dirty ? 'Discard' : 'Close'}
        </Button>
        <Button
          size="small"
          icon="save"
          onClick={() => {
            if (save()) onDone();
          }}
        >
          Save & close
        </Button>
      </div>
    </div>
  );
}

export function ExplainView({ src }: { src: string }) {
  const r = explain(src);
  return (
    <div className={s.explain}>
      <pre className={s.explainSrc}>
        <code>{src}</code>
      </pre>
      {r.error ? (
        <p className={s.explainErr}>Bash can’t parse this one: {r.error}</p>
      ) : (
        <ol className={s.parts}>
          {r.parts.map((p, i) => (
            <li key={i} className={s.part}>
              <code className={[s.token, s['k_' + p.kind]].join(' ')}>{p.text}</code>
              <span className={s.kind}>{p.kind}</span>
              <p>{p.explain}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function TerminalPanel({ session, title, flat, autoFocus, toolbar, keys, className }: { session: TerminalSession; title?: string; flat?: boolean; autoFocus?: boolean; toolbar?: ReactNode; keys?: boolean; className?: string }) {
  useSession(session);
  useSessionStats(session);
  const [explainSrc, setExplainSrc] = useState<string | null>(null);
  const [manualStack, setManualStack] = useState<string[]>([]);
  const editing = session.editing;
  const manual = session.manual;
  useEffect(() => {
    if (manual) setManualStack([manual]);
  }, [manual]);
  const topic = manualStack[manualStack.length - 1];
  const entry = topic ? lookupRef(topic) : undefined;
  const closeManual = () => {
    session.manual = null;
    setManualStack([]);
    session.notify();
  };
  return (
    <>
      <Terminal session={session} title={title} flat={flat} autoFocus={autoFocus} toolbar={toolbar} keys={keys} onExplain={setExplainSrc} className={className} />
      <Sheet open={!!editing} onClose={() => editing?.done()} title="Editor" full label="Script editor">
        {editing && <FileEditor key={editing.path} session={session} path={editing.path} onDone={() => editing.done()} />}
      </Sheet>
      <Sheet open={!!manual && !!entry} onClose={closeManual} title={`man ${topic ?? ''}`}>
        {entry && <RefPage entry={entry} onOpen={(n) => lookupRef(n) && setManualStack((st) => [...st, n])} />}
      </Sheet>
      <Sheet open={!!explainSrc} onClose={() => setExplainSrc(null)} title="Explain this command">
        {explainSrc && <ExplainView src={explainSrc} />}
      </Sheet>
    </>
  );
}
