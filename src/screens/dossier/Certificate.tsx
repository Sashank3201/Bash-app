import { useNavigate } from 'react-router-dom';
import { Button, IconButton, Seal } from '../../design/ui';
import { rankFor } from '../../engine/progress';
import { useApp } from '../../store/app';
import { Wordmark } from '../shell/AppShell';
import s from './Certificate.module.css';

export default function Certificate() {
  const navigate = useNavigate();
  const name = useApp((st) => st.profile.name);
  const missions = useApp((st) => st.missions);
  const xp = useApp((st) => st.xp);
  const done = Object.values(missions).filter((m) => m.done).length;
  const complete = !!missions[21]?.done;
  const finishedAt = missions[21]?.doneAt;
  return (
    <div className={s.wrap}>
      <div className={s.bar}>
        <IconButton icon="arrowLeft" label="Back" onClick={() => navigate(-1)} />
        {complete && (
          <Button variant="secondary" size="small" icon="print" onClick={() => window.print()}>
            Print / save PDF
          </Button>
        )}
      </div>
      <div className={[s.cert, !complete && s.locked].filter(Boolean).join(' ')}>
        <div className={s.border}>
          <div className={s.top}>
            <Wordmark />
            <span>Halden Security · Analyst Training Programme</span>
          </div>
          <div className={s.this}>This certifies that</div>
          <div className={s.name}>{name || 'Analyst'}</div>
          <div className={s.body}>
            has completed all twenty-one missions of the Bash for Security Analysts programme — from first login to the triage of Incident&nbsp;0x21 — and is hereby recognised as a
          </div>
          <div className={s.rank}>{complete ? 'Lead Analyst' : rankFor(xp).rank.title}</div>
          <div className={s.foot}>
            <div>
              <div className={s.sig}>Mara Okafor</div>
              <div className={s.sigLine}>Senior Analyst, Detection &amp; Response</div>
            </div>
            <Seal glyph="L" size={96} earned={complete} />
            <div>
              <div className={s.sig}>{finishedAt ? new Date(finishedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}</div>
              <div className={s.sigLine}>Date · {xp.toLocaleString()} XP</div>
            </div>
          </div>
        </div>
        {!complete && (
          <div className={s.overlay}>
            <b>Not yet earned</b>
            <span>{done}/21 missions complete. Finish the capstone to sign this certificate.</span>
          </div>
        )}
      </div>
    </div>
  );
}
