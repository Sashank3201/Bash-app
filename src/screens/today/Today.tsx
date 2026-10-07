import { motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { getCase } from '../../content/cases';
import { getMission } from '../../content/missions';
import { CHAPTERS, ROMAN } from '../../content/story';
import { SYLLABUS } from '../../content/syllabus';
import { TIPS } from '../../content/tips';
import { Icon } from '../../design/Icon';
import { Markdown } from '../../design/Markdown';
import { Page } from '../../design/Page';
import { Button, Card, ProgressRule } from '../../design/ui';
import { currentDay, missionProgress } from '../../engine/course';
import { addDays, dayKey, rankFor, streakInfo } from '../../engine/progress';
import { useApp } from '../../store/app';
import { useDueCount } from '../review/useDue';
import s from './Today.module.css';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Working late';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function Today() {
  const navigate = useNavigate();
  const name = useApp((st) => st.profile.name);
  const missions = useApp((st) => st.missions);
  const challenges = useApp((st) => st.challenges);
  const xp = useApp((st) => st.xp);
  const activity = useApp((st) => st.activity);
  const due = useDueCount();
  const day = currentDay(missions);
  const finished = day > SYLLABUS.length;
  const syl = SYLLABUS.find((d) => d.day === day);
  const mission = syl ? getMission(syl.day) : undefined;
  const rec = missions[day];
  const total = mission ? mission.lesson.length + mission.drills.length : 0;
  const progress = missionProgress(rec, total);
  const started = !!rec && (progress > 0 || rec.phase !== 'briefing');
  const { rank, next, progress: rankProg } = rankFor(xp);
  const streak = streakInfo(activity);
  const today = dayKey();
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const tip = TIPS[(new Date().getDate() + (name.length || 0)) % TIPS.length];
  const chapter = syl ? CHAPTERS[syl.week - 1] : CHAPTERS[2];
  const openCase = SYLLABUS.filter((d) => d.caseId && missions[d.day]?.done)
    .map((d) => getCase(d.caseId!))
    .find((c) => c && !challenges['case:' + c.id]?.solved);
  const dateLine = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <Page>
      <div className={s.masthead}>
        <span>{dateLine}</span>
        <span>{finished ? 'Programme complete' : `Day ${day} of 21`}</span>
      </div>
      <div className="rule-double" />
      <h1 className={s.paper}>The Daily Brief</h1>
      <p className={s.greet}>
        {greeting()}, <em>{name || 'Analyst'}</em>.
      </p>

      {finished ? (
        <Card className={s.hero}>
          <div className="kicker">All 21 missions complete</div>
          <h2 className={s.heroTitle}>You made Lead Analyst.</h2>
          <p className={s.heroTopic}>Keep your skills sharp in the Arena and the Lab — or print your certificate.</p>
          <div className={s.heroActions}>
            <Button onClick={() => navigate('/certificate')} iconRight="arrowRight">
              Certificate
            </Button>
            <Button variant="secondary" onClick={() => navigate('/path?tab=arena')}>
              Arena
            </Button>
          </div>
        </Card>
      ) : (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <Card className={s.hero} onClick={() => navigate(`/mission/${day}`)} role="link" tabIndex={0}>
            <div className={s.heroTop}>
              <span className="kicker">
                Today’s mission · Chapter {chapter.numeral}
              </span>
              <span className={s.dayNum}>{ROMAN[day]}</span>
            </div>
            <h2 className={s.heroTitle}>{syl?.title}</h2>
            <p className={s.heroTopic}>{syl?.topic}</p>
            {mission && (
              <div className={s.meta}>
                <span>
                  <Icon name="today" size={15} /> ~{mission.minutes} min
                </span>
                <span>
                  <Icon name="target" size={15} /> {total} steps
                </span>
                {syl?.caseId && (
                  <span>
                    <Icon name="case" size={15} /> case file
                  </span>
                )}
              </div>
            )}
            {started && <ProgressRule value={progress} tone="red" className={s.heroProgress} />}
            <Button block iconRight="arrowRight" className={s.heroBtn}>
              {started ? `Continue · ${Math.round(progress * 100)}%` : 'Start today’s mission'}
            </Button>
          </Card>
        </motion.div>
      )}

      <div className={s.tiles}>
        <Card className={s.tile}>
          <span className={s.tileIcon} data-on={streak.activeToday || undefined}>
            <Icon name="flame" size={20} />
          </span>
          <b>{streak.current}</b>
          <span>day streak</span>
        </Card>
        <Card className={s.tile} onClick={() => navigate('/dossier')} role="link" tabIndex={0}>
          <span className={s.tileIcon}>
            <Icon name="trophy" size={20} />
          </span>
          <b className={s.rankName}>{rank.title}</b>
          <ProgressRule value={rankProg} className={s.tileRule} />
          <span>{next ? `${(next.min - xp).toLocaleString()} XP to ${next.title}` : `${xp.toLocaleString()} XP`}</span>
        </Card>
        <Card className={s.tile} onClick={() => navigate('/review')} role="link" tabIndex={0}>
          <span className={s.tileIcon} data-on={due > 0 || undefined}>
            <Icon name="review" size={20} />
          </span>
          <b>{due}</b>
          <span>{due === 1 ? 'card to review' : 'cards to review'}</span>
        </Card>
      </div>

      <div className={s.week} aria-label="This week">
        {week.map((k) => {
          const d = new Date(k + 'T12:00:00');
          return (
            <div key={k} className={[s.wd, activity.includes(k) && s.wdOn, k === today && s.wdToday].filter(Boolean).join(' ')}>
              <span>{d.toLocaleDateString(undefined, { weekday: 'narrow' })}</span>
              <i />
            </div>
          );
        })}
      </div>

      {openCase && (
        <Card className={s.caseCard} onClick={() => navigate(`/case/${openCase.id}`)} role="link" tabIndex={0}>
          <div className={s.caseTab}>CASE {String(openCase.number).padStart(2, '0')}</div>
          <div>
            <div className="kicker">Open case file</div>
            <div className={s.caseTitle}>{openCase.title}</div>
          </div>
          <Icon name="arrowRight" />
        </Card>
      )}

      <aside className={s.note}>
        <div className="kicker">From Mara’s desk</div>
        <Markdown>{tip}</Markdown>
      </aside>

      <div className={s.links}>
        <Link to="/lab" className={s.link}>
          <Icon name="lab" size={20} />
          <span>
            <b>Lab</b>
            <small>Free practice terminal</small>
          </span>
        </Link>
        <Link to="/path?tab=arena" className={s.link}>
          <Icon name="target" size={20} />
          <span>
            <b>Arena</b>
            <small>Extra challenges</small>
          </span>
        </Link>
        <Link to="/reference" className={s.link}>
          <Icon name="book" size={20} />
          <span>
            <b>Reference</b>
            <small>Every command, explained</small>
          </span>
        </Link>
      </div>
    </Page>
  );
}
