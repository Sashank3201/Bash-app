import { motion } from 'framer-motion';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ARENA } from '../../content/arena';
import { CASES } from '../../content/cases';
import { getMission } from '../../content/missions';
import { CHAPTERS, ROMAN } from '../../content/story';
import { SYLLABUS } from '../../content/syllabus';
import { Icon } from '../../design/Icon';
import { Page, PageHeader } from '../../design/Page';
import { Chip, Empty, Segmented } from '../../design/ui';
import { currentDay, isUnlocked, missionProgress } from '../../engine/course';
import { useApp } from '../../store/app';
import s from './PathScreen.module.css';

type Tab = 'missions' | 'cases' | 'arena';

export default function PathScreen() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'missions';
  return (
    <Page>
      <PageHeader kicker="Your syllabus" title="The Path">
        Three chapters, twenty-one missions, seven case files and a capstone.
      </PageHeader>
      <div className={s.tabs}>
        <Segmented<Tab>
          id="path-tab"
          value={tab}
          onChange={(t) => setParams(t === 'missions' ? {} : { tab: t }, { replace: true })}
          options={[
            { value: 'missions', label: 'Missions' },
            { value: 'cases', label: 'Cases' },
            { value: 'arena', label: 'Arena' },
          ]}
        />
      </div>
      {tab === 'missions' && <Missions />}
      {tab === 'cases' && <Cases />}
      {tab === 'arena' && <Arena />}
    </Page>
  );
}

function Missions() {
  const navigate = useNavigate();
  const missions = useApp((st) => st.missions);
  const pushToast = useApp((st) => st.pushToast);
  const cur = currentDay(missions);
  return (
    <div className={s.chapters}>
      {CHAPTERS.map((ch) => {
        const days = SYLLABUS.filter((d) => d.week === ch.week);
        const done = days.filter((d) => missions[d.day]?.done).length;
        return (
          <section key={ch.week} className={s.chapter}>
            <header className={s.chHead}>
              <span className={s.chNum}>{ch.numeral}</span>
              <div className={s.chText}>
                <div className="kicker">
                  Chapter {ch.numeral} · {ch.rank}
                </div>
                <h2 className={s.chTitle}>{ch.title}</h2>
                <p className={s.chBlurb}>{ch.blurb}</p>
              </div>
              <span className={s.chCount}>
                {done}/{days.length}
              </span>
            </header>
            <ol className={s.toc}>
              {days.map((d, i) => {
                const unlocked = isUnlocked(d.day, missions);
                const rec = missions[d.day];
                const m = getMission(d.day);
                const total = m ? m.lesson.length + m.drills.length : 0;
                const prog = missionProgress(rec, total);
                const isCur = d.day === cur;
                return (
                  <motion.li key={d.day} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.025 }}>
                    <button
                      className={[s.entry, isCur && s.entryCur, !unlocked && s.entryLocked, rec?.done && s.entryDone].filter(Boolean).join(' ')}
                      onClick={() => {
                        if (unlocked) navigate(`/mission/${d.day}`);
                        else pushToast({ kind: 'info', title: `Day ${d.day} is locked`, body: `Finish Day ${d.day - 1} first.` });
                      }}
                    >
                      <span className={s.num}>{String(d.day).padStart(2, '0')}</span>
                      <span className={s.entryText}>
                        <span className={s.entryTitle}>
                          {d.title}
                          {d.caseId && <span className={s.caseMark}>case</span>}
                        </span>
                        <span className={s.entryTopic}>{d.topic}</span>
                        {isCur && prog > 0 && !rec?.done && (
                          <span className={s.mini}>
                            <i style={{ width: `${Math.round(prog * 100)}%` }} />
                          </span>
                        )}
                      </span>
                      <span className={s.leader} aria-hidden="true" />
                      <span className={s.state}>
                        {rec?.done ? (
                          <span className={s.done}>
                            <Icon name="check" size={16} />
                          </span>
                        ) : !unlocked ? (
                          <Icon name="lock" size={17} />
                        ) : isCur ? (
                          <span className={s.go}>{prog > 0 ? 'Resume' : 'Start'}</span>
                        ) : (
                          <Icon name="chevronRight" size={18} />
                        )}
                      </span>
                    </button>
                  </motion.li>
                );
              })}
            </ol>
          </section>
        );
      })}
      <p className={s.footnote}>Chapter {ROMAN[3]} ends with the capstone, “Incident 0x21”. Finish it to make Lead Analyst.</p>
    </div>
  );
}

function Difficulty({ n }: { n: number }) {
  return (
    <span className={s.diff} aria-label={`Difficulty ${n} of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <i key={i} className={i <= n ? s.diffOn : ''} />
      ))}
    </span>
  );
}

function Cases() {
  const navigate = useNavigate();
  const missions = useApp((st) => st.missions);
  const challenges = useApp((st) => st.challenges);
  if (!CASES.length) return <Empty>Case files arrive with the missions.</Empty>;
  return (
    <div className={s.cases}>
      {CASES.map((c) => {
        const unlocked = isUnlocked(c.day, missions) && (missions[c.day]?.done || Object.keys(missions[c.day]?.steps ?? {}).length > 0);
        const solved = challenges['case:' + c.id]?.solved;
        return (
          <button key={c.id} className={[s.folder, !unlocked && s.folderLocked].filter(Boolean).join(' ')} onClick={() => unlocked && navigate(`/case/${c.id}`)} disabled={!unlocked}>
            <span className={s.folderTab}>CASE {String(c.number).padStart(2, '0')}</span>
            <span className={s.folderBody}>
              <span className={s.folderTitle}>{c.title}</span>
              <span className={s.folderMeta}>
                <Difficulty n={c.difficulty} /> · Day {c.day} · ~{c.minutes} min · {c.xp} XP
              </span>
            </span>
            {solved ? <span className={s.solved}>Solved</span> : !unlocked ? <Icon name="lock" size={18} /> : <Icon name="chevronRight" size={18} />}
          </button>
        );
      })}
    </div>
  );
}

function Arena() {
  const navigate = useNavigate();
  const missions = useApp((st) => st.missions);
  const challenges = useApp((st) => st.challenges);
  const doneDays = Object.entries(missions).filter(([, m]) => m.done).map(([d]) => Number(d));
  const maxDay = doneDays.length ? Math.max(...doneDays) : 0;
  if (!ARENA.length) return <Empty>Arena challenges unlock as you finish missions.</Empty>;
  const topics = [...new Set(ARENA.map((c) => c.topic))];
  const solvedCount = ARENA.filter((c) => challenges['arena:' + c.id]?.solved).length;
  return (
    <div>
      <p className={s.arenaIntro}>
        Extra practice, no story. {solvedCount}/{ARENA.length} solved. New challenges unlock as you finish missions.
      </p>
      {topics.map((t) => (
        <section key={t} className={s.arenaTopic}>
          <h3 className={s.arenaHead}>{t}</h3>
          <div className={s.arenaList}>
            {ARENA.filter((c) => c.topic === t).map((c) => {
              const unlocked = c.unlockDay <= maxDay;
              const solved = challenges['arena:' + c.id]?.solved;
              return (
                <button key={c.id} className={[s.chal, !unlocked && s.chalLocked].filter(Boolean).join(' ')} disabled={!unlocked} onClick={() => navigate(`/arena/${c.id}`)}>
                  <span className={s.chalTitle}>{c.title}</span>
                  <Chip tone={c.difficulty === 'easy' ? 'green' : c.difficulty === 'medium' ? 'amber' : 'red'}>{c.difficulty}</Chip>
                  <span className={s.chalState}>{solved ? <Icon name="check" size={16} /> : !unlocked ? <span className={s.unlockAt}>Day {c.unlockDay}</span> : `${c.xp} XP`}</span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
