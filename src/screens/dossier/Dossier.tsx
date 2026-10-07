import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CASES } from '../../content/cases';
import { Page } from '../../design/Page';
import { Button, ProgressRule, Seal, Segmented, Sheet } from '../../design/ui';
import { BADGES } from '../../engine/badges';
import { RANKS, rankFor, streakInfo } from '../../engine/progress';
import { useApp, type ThemePref } from '../../store/app';
import s from './Dossier.module.css';

export default function Dossier() {
  const navigate = useNavigate();
  const st = useApp();
  const { rank, next, progress } = rankFor(st.xp);
  const streak = streakInfo(st.activity);
  const missionsDone = Object.values(st.missions).filter((m) => m.done).length;
  const casesDone = Object.entries(st.challenges).filter(([k, c]) => k.startsWith('case:') && c.solved).length;
  const [badge, setBadge] = useState<string | null>(null);
  const [backup, setBackup] = useState<'export' | 'import' | null>(null);
  const selected = BADGES.find((b) => b.id === badge);
  const since = st.profile.startedAt ? new Date(st.profile.startedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : '—';

  return (
    <Page>
      <div className={s.idcard}>
        <div className={s.idTop}>
          <span>Halden Security</span>
          <span>Personnel file</span>
        </div>
        <div className={s.idBody}>
          <div className={s.avatar} aria-hidden="true">
            {(st.profile.name || 'A').slice(0, 1).toUpperCase()}
          </div>
          <div className={s.idText}>
            <div className={s.idName}>{st.profile.name || 'Analyst'}</div>
            <div className={s.idRank}>{rank.title}</div>
            <div className={s.idSince}>On the desk since {since}</div>
          </div>
        </div>
        <ProgressRule value={progress} tone="red" />
        <div className={s.idXp}>
          <span>{st.xp.toLocaleString()} XP</span>
          <span>{next ? `${(next.min - st.xp).toLocaleString()} to ${next.title}` : 'Top rank'}</span>
        </div>
      </div>

      <div className={s.stats}>
        <div>
          <b>{missionsDone}</b>
          <span>missions</span>
        </div>
        <div>
          <b>
            {casesDone}/{CASES.length || 8}
          </b>
          <span>cases</span>
        </div>
        <div>
          <b>{streak.best}</b>
          <span>best streak</span>
        </div>
        <div>
          <b>{st.stats.commands}</b>
          <span>commands</span>
        </div>
      </div>

      <section className={s.section}>
        <h2 className={s.h}>Career ladder</h2>
        <ol className={s.ladder}>
          {RANKS.map((r) => {
            const reached = st.xp >= r.min;
            const isCur = r.id === rank.id;
            return (
              <li key={r.id} className={[reached && s.reached, isCur && s.cur].filter(Boolean).join(' ')}>
                <span className={s.rung} />
                <div>
                  <b>{r.title}</b>
                  <span>{r.blurb}</span>
                </div>
                <span className={s.xpReq}>{r.min.toLocaleString()} XP</span>
              </li>
            );
          })}
        </ol>
      </section>

      <section className={s.section}>
        <h2 className={s.h}>
          Seals <span className={s.hCount}>{Object.keys(st.badges).length}/{BADGES.length}</span>
        </h2>
        <div className={s.seals}>
          {BADGES.map((b) => (
            <button key={b.id} className={s.sealBtn} onClick={() => setBadge(b.id)} aria-label={b.title}>
              <Seal glyph={b.glyph} size={64} earned={!!st.badges[b.id]} />
              <span>{b.title}</span>
            </button>
          ))}
        </div>
      </section>

      <section className={s.section}>
        <h2 className={s.h}>Settings</h2>
        <div className={s.settings}>
          <div className={s.setting}>
            <span>Appearance</span>
            <div className={s.seg}>
              <Segmented<ThemePref>
                id="theme"
                value={st.settings.theme}
                onChange={(t) => st.setSettings({ theme: t })}
                options={[
                  { value: 'light', label: 'Paper' },
                  { value: 'dark', label: 'Night' },
                  { value: 'system', label: 'Auto' },
                ]}
              />
            </div>
          </div>
          <div className={s.setting}>
            <span>Text size</span>
            <div className={s.seg}>
              <Segmented<string>
                id="font"
                value={String(st.settings.fontScale)}
                onChange={(v) => st.setSettings({ fontScale: Number(v) })}
                options={[
                  { value: '0.92', label: 'A−' },
                  { value: '1', label: 'A' },
                  { value: '1.1', label: 'A+' },
                ]}
              />
            </div>
          </div>
          <Toggle label="Vibration feedback" sub="Android phones" on={st.settings.haptics} set={(v) => st.setSettings({ haptics: v })} />
          <Toggle label="Typewriter briefings" sub="Mara’s letters type themselves out" on={st.settings.typewriter} set={(v) => st.setSettings({ typewriter: v })} />
        </div>
      </section>

      <section className={s.section}>
        <h2 className={s.h}>Your data</h2>
        <p className={s.p}>Progress is saved on this device only. Export a backup to move it to another phone or a PC, or to keep it safe.</p>
        <div className={s.dataRow}>
          <Button variant="secondary" icon="download" onClick={() => setBackup('export')}>
            Export backup
          </Button>
          <Button variant="secondary" icon="upload" onClick={() => setBackup('import')}>
            Import
          </Button>
        </div>
        <div className={s.dataRow}>
          <Button variant="ghost" icon="print" onClick={() => navigate('/certificate')}>
            Certificate
          </Button>
          <Button
            variant="ghost"
            icon="reset"
            onClick={() => {
              if (window.confirm('Erase ALL progress on this device? Export a backup first if you might want it back.')) {
                st.reset();
                navigate('/welcome');
              }
            }}
          >
            Reset progress
          </Button>
        </div>
      </section>

      <p className={s.colophon}>
        Ink &amp; Shell · set in Newsreader, IBM Plex Sans &amp; Plex Mono.
        <br />
        Halden Security is fictional. Everything you do here stays on your device.
      </p>

      <Sheet open={!!selected} onClose={() => setBadge(null)} title={selected?.title}>
        {selected && (
          <div className={s.badgeSheet}>
            <Seal glyph={selected.glyph} size={120} earned={!!st.badges[selected.id]} />
            <p>{selected.blurb}</p>
            <span>{st.badges[selected.id] ? `Earned ${new Date(st.badges[selected.id]).toLocaleDateString()}` : 'Not earned yet'}</span>
          </div>
        )}
      </Sheet>
      <Sheet open={!!backup} onClose={() => setBackup(null)} title={backup === 'export' ? 'Export backup' : 'Import backup'}>
        {backup === 'export' ? <ExportPanel /> : backup === 'import' ? <ImportPanel onDone={() => setBackup(null)} /> : null}
      </Sheet>
    </Page>
  );
}

function Toggle({ label, sub, on, set }: { label: string; sub?: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <button className={s.setting} onClick={() => set(!on)} role="switch" aria-checked={on}>
      <span>
        {label}
        {sub && <small>{sub}</small>}
      </span>
      <span className={[s.switch, on && s.switchOn].filter(Boolean).join(' ')}>
        <i />
      </span>
    </button>
  );
}

function ExportPanel() {
  const exportCode = useApp((st) => st.exportCode);
  const exportJson = useApp((st) => st.exportJson);
  const [code] = useState(() => exportCode());
  const [copied, setCopied] = useState(false);
  return (
    <div className={s.panel}>
      <p className={s.p}>Save the file somewhere safe, or copy the backup code and paste it into the app on your other device.</p>
      <Button
        block
        icon="download"
        onClick={() => {
          const blob = new Blob([exportJson()], { type: 'application/json' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `ink-and-shell-backup-${new Date().toISOString().slice(0, 10)}.json`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        }}
      >
        Download backup file
      </Button>
      <div className={s.codeBox}>
        <code>{code}</code>
      </div>
      <Button
        block
        variant="secondary"
        icon={copied ? 'check' : 'copy'}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(code);
            setCopied(true);
          } catch {}
        }}
      >
        {copied ? 'Copied' : 'Copy backup code'}
      </Button>
    </div>
  );
}

function ImportPanel({ onDone }: { onDone: () => void }) {
  const importData = useApp((st) => st.importData);
  const [text, setText] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const run = (t: string) => {
    if (!window.confirm('Replace the progress on this device with the backup?')) return;
    const r = importData(t);
    if (r.ok) {
      setMsg('Backup restored.');
      setTimeout(onDone, 700);
    } else setMsg(r.error ?? 'Import failed.');
  };
  return (
    <div className={s.panel}>
      <p className={s.p}>Paste a backup code, or choose a backup file. This replaces the progress on this device.</p>
      <textarea className={s.textarea} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste your backup code here" spellCheck={false} />
      <Button block disabled={!text.trim()} onClick={() => run(text)}>
        Restore from code
      </Button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) run(await f.text());
        }}
      />
      <Button block variant="secondary" icon="upload" onClick={() => fileRef.current?.click()}>
        Choose backup file
      </Button>
      {msg && <p className={s.msg}>{msg}</p>}
    </div>
  );
}
