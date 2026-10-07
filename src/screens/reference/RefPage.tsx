import { highlightShell } from '../../design/Markdown';
import type { RefEntry } from '../../content/types';
import s from './RefPage.module.css';

export function RefPage({ entry, onRun, onOpen }: { entry: RefEntry; onRun?: (code: string) => void; onOpen?: (name: string) => void }) {
  return (
    <article className={s.page}>
      <div className="kicker">{entry.kind === 'builtin' ? 'Shell builtin' : entry.kind === 'concept' ? 'Shell syntax' : 'Command'}</div>
      <h2 className={s.name}>{entry.name}</h2>
      <p className={s.summary}>{entry.summary}</p>
      <div className={s.usage}>
        <span className={s.label}>Usage</span>
        <code>{entry.usage}</code>
      </div>
      {entry.options.length > 0 && (
        <section className={s.section}>
          <h3 className={s.h}>Options</h3>
          <dl className={s.opts}>
            {entry.options.map(([k, v]) => (
              <div key={k} className={s.opt}>
                <dt>
                  <code>{k}</code>
                </dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      {entry.examples.length > 0 && (
        <section className={s.section}>
          <h3 className={s.h}>Examples</h3>
          <ul className={s.examples}>
            {entry.examples.map(([code, what]) => (
              <li key={code}>
                <button className={s.example} onClick={onRun ? () => onRun(code) : undefined} disabled={!onRun} title={onRun ? 'Run in the terminal' : undefined}>
                  <code>{highlightShell(code)}</code>
                  {onRun && <span className={s.run}>Run ▸</span>}
                </button>
                <span className={s.what}>{what}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {entry.security && (
        <aside className={s.security}>
          <span className={s.label}>In security work</span>
          <p>{entry.security}</p>
        </aside>
      )}
      {entry.related && entry.related.length > 0 && (
        <section className={s.section}>
          <h3 className={s.h}>See also</h3>
          <div className={s.related}>
            {entry.related.map((r) => (
              <button key={r} className={s.rel} onClick={() => onOpen?.(r)}>
                {r}
              </button>
            ))}
          </div>
        </section>
      )}
    </article>
  );
}
