// Lesson prose: markdown with highlighted shell blocks. ```run blocks get a "Run" button.

import { type ReactNode, useState } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Icon } from './Icon';
import s from './Markdown.module.css';

const KW = /^(if|then|else|elif|fi|for|while|until|do|done|case|esac|in|function|return|local|export|declare|readonly|break|continue|exit|set|shift|trap|source|time)$/;

/** Tiny, dependable bash highlighter for read-only snippets. */
export function highlightShell(code: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(#[^\n]*)|("(?:\\.|[^"\\])*"|'[^']*')|(\$\{[^}]*\}|\$\(\(|\$\(|\$[A-Za-z_][A-Za-z0-9_]*|\$[0-9@#?*$!-])|(\|\||&&|;;|[|<>&;]|>>|2>&1|2>)|(\b[A-Za-z_][\w-]*\b)|(\s-{1,2}[A-Za-z][\w-]*)|(\b\d+\b)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  let atCmd = true;
  while ((m = re.exec(code))) {
    // comments only count at a word boundary
    if (m[1] && m.index > 0 && !/\s/.test(code[m.index - 1])) {
      continue;
    }
    if (m.index > last) {
      const gap = code.slice(last, m.index);
      out.push(gap);
      if (/\n/.test(gap)) atCmd = true;
    }
    last = re.lastIndex;
    const k = i++;
    if (m[1]) out.push(<span key={k} className={s.tComment}>{m[1]}</span>);
    else if (m[2]) {
      out.push(<span key={k} className={s.tString}>{m[2]}</span>);
      atCmd = false;
    } else if (m[3]) {
      out.push(<span key={k} className={s.tVar}>{m[3]}</span>);
      atCmd = false;
    } else if (m[4]) {
      out.push(<span key={k} className={s.tOp}>{m[4]}</span>);
      atCmd = /^(\|\||&&|;;|[|;&])$/.test(m[4]);
    } else if (m[5]) {
      if (KW.test(m[5])) {
        out.push(<span key={k} className={s.tKw}>{m[5]}</span>);
        atCmd = /^(then|else|do|in)$/.test(m[5]) ? true : atCmd;
      } else if (atCmd) {
        out.push(<span key={k} className={s.tCmd}>{m[5]}</span>);
        atCmd = false;
      } else out.push(m[5]);
    } else if (m[6]) out.push(<span key={k} className={s.tFlag}>{m[6]}</span>);
    else if (m[7]) out.push(<span key={k} className={s.tNum}>{m[7]}</span>);
  }
  if (last < code.length) out.push(code.slice(last));
  return out;
}

function CodeBlock({ code, lang, onRun }: { code: string; lang: string; onRun?: (code: string) => void }) {
  const [copied, setCopied] = useState(false);
  const runnable = lang === 'run' && !!onRun;
  const isOutput = lang === 'output' || lang === 'text';
  return (
    <div className={[s.block, isOutput && s.output].filter(Boolean).join(' ')}>
      {isOutput && <span className={s.blockLabel}>output</span>}
      <pre>
        <code>{isOutput ? code : highlightShell(code)}</code>
      </pre>
      {!isOutput && (
        <div className={s.blockActions}>
          <button
            className={s.blockBtn}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(code);
                setCopied(true);
                setTimeout(() => setCopied(false), 1200);
              } catch {}
            }}
            aria-label="Copy code"
          >
            <Icon name={copied ? 'check' : 'copy'} size={15} />
          </button>
          {runnable && (
            <button className={[s.blockBtn, s.runBtn].join(' ')} onClick={() => onRun!(code)}>
              <Icon name="play" size={13} /> Run
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function Markdown({ children, onRun, className, dropcap }: { children: string; onRun?: (code: string) => void; className?: string; dropcap?: boolean }) {
  const components: Components = {
    pre: ({ children: c }) => <>{c}</>,
    code: ({ className: cn, children: c }) => {
      const text = String(c ?? '');
      const lang = /language-(\w+)/.exec(cn ?? '')?.[1];
      if (!lang && !text.includes('\n')) return <code>{c}</code>;
      return <CodeBlock code={text.replace(/\n$/, '')} lang={lang ?? 'bash'} onRun={onRun} />;
    },
    a: ({ href, children: c }) => (
      <a href={href} target={href?.startsWith('http') ? '_blank' : undefined} rel="noreferrer">
        {c}
      </a>
    ),
    table: ({ children: c }) => (
      <div className={s.tableWrap}>
        <table>{c}</table>
      </div>
    ),
  };
  return (
    <div className={['prose', s.md, dropcap && s.dropcap, className].filter(Boolean).join(' ')}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
