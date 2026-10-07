import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { lookupRef, REFERENCE } from '../../content/reference';
import { Icon } from '../../design/Icon';
import { Page, PageHeader } from '../../design/Page';
import { Empty, IconButton } from '../../design/ui';
import { RefPage } from './RefPage';
import s from './Reference.module.css';

const GROUPS: { title: string; names: string[] }[] = [
  { title: 'Moving around & files', names: ['pwd', 'cd', 'ls', 'tree', 'cat', 'less', 'head', 'tail', 'touch', 'mkdir', 'rmdir', 'rm', 'cp', 'mv', 'ln', 'find', 'stat', 'file', 'basename', 'dirname', 'realpath', 'du'] },
  { title: 'Working with text', names: ['echo', 'printf', 'grep', 'wc', 'sort', 'uniq', 'cut', 'tr', 'sed', 'awk', 'tee', 'xargs', 'diff', 'comm', 'paste', 'rev', 'tac', 'nl', 'column', 'seq', 'expr', 'bc'] },
  { title: 'Integrity & encoding', names: ['sha256sum', 'md5sum', 'sha1sum', 'base64', 'xxd', 'hexdump', 'strings'] },
  { title: 'Users & permissions', names: ['chmod', 'chown', 'id', 'whoami', 'groups', 'sudo', 'getent'] },
  { title: 'The system', names: ['date', 'sleep', 'ps', 'kill', 'who', 'last', 'crontab', 'env', 'uname', 'hostname', 'uptime', 'ss', 'nano', 'clear', 'man'] },
  { title: 'Shell scripting', names: ['bash', 'test', '[[', 'read', 'export', 'local', 'declare', 'set', 'trap', 'getopts', 'shift', 'source', 'exit', 'mapfile', 'alias', 'type', 'which', 'history'] },
];

export default function Reference() {
  const { name } = useParams();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const entry = name ? lookupRef(decodeURIComponent(name)) : undefined;
  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return null;
    return REFERENCE.filter((r) => r.name.includes(t) || r.summary.toLowerCase().includes(t) || r.options.some(([k, v]) => k.toLowerCase().includes(t) || v.toLowerCase().includes(t)));
  }, [q]);

  if (name) {
    return (
      <Page>
        <div className={s.back}>
          <IconButton icon="arrowLeft" label="Back to reference" onClick={() => navigate('/reference')} />
          <span className="kicker">Reference</span>
        </div>
        {entry ? <RefPage entry={entry} onOpen={(n) => navigate(`/reference/${encodeURIComponent(n)}`)} /> : <Empty>No page for “{name}”.</Empty>}
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader kicker="The analyst’s manual" title="Reference">
        Every command in the course, in plain English. Also available in any terminal with <code>man</code>.
      </PageHeader>
      <label className={s.search}>
        <Icon name="search" size={18} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search commands, options, ideas…" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
      </label>
      {results ? (
        results.length ? (
          <List names={results.map((r) => r.name)} />
        ) : (
          <Empty>Nothing matches “{q}”.</Empty>
        )
      ) : (
        GROUPS.map((g) => (
          <section key={g.title} className={s.group}>
            <h2 className={s.groupTitle}>{g.title}</h2>
            <List names={g.names} />
          </section>
        ))
      )}
    </Page>
  );
}

function List({ names }: { names: string[] }) {
  const navigate = useNavigate();
  return (
    <ul className={s.list}>
      {names.map((n) => {
        const r = lookupRef(n);
        if (!r) return null;
        return (
          <li key={n}>
            <button className={s.item} onClick={() => navigate(`/reference/${encodeURIComponent(r.name)}`)}>
              <code className={s.name}>{r.name}</code>
              <span className={s.sum}>{r.summary}</span>
              <Icon name="chevronRight" size={16} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
