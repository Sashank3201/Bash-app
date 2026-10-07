import { AnimatePresence, motion, useMotionValue, useTransform } from 'framer-motion';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FLASHCARDS, getCard } from '../../content/flashcards';
import { Markdown } from '../../design/Markdown';
import { Page, PageHeader } from '../../design/Page';
import { Button, haptic, Segmented } from '../../design/ui';
import { dayKey, isDue, type Grade } from '../../engine/progress';
import { useApp } from '../../store/app';
import s from './Review.module.css';

type Mode = 'due' | 'all';

export default function Review() {
  const navigate = useNavigate();
  const cards = useApp((st) => st.cards);
  const reviewCard = useApp((st) => st.reviewCard);
  const [mode, setMode] = useState<Mode>('due');
  const today = dayKey();
  const unlocked = Object.keys(cards).filter((id) => getCard(id));
  const queueInit = useMemo(() => {
    const ids = mode === 'due' ? unlocked.filter((id) => isDue(cards[id], today)) : [...unlocked].sort(() => Math.random() - 0.5);
    return ids;
    // the queue is fixed for a session
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);
  const [queue, setQueue] = useState<string[]>(queueInit);
  const [flipped, setFlipped] = useState(false);
  const [doneCount, setDoneCount] = useState(0);
  const [key, setKey] = useState(mode);
  if (key !== mode) {
    setKey(mode);
    setQueue(queueInit);
    setFlipped(false);
    setDoneCount(0);
  }
  const current = queue[0] ? getCard(queue[0]) : undefined;
  const nextDue = unlocked.map((id) => cards[id].due).filter((d) => d > today).sort()[0];

  const grade = (g: Grade) => {
    if (!current) return;
    haptic(g === 'again' ? 'error' : 'tap');
    if (mode === 'due') reviewCard(current.id, g);
    setFlipped(false);
    setDoneCount((n) => n + 1);
    setQueue((q) => {
      const rest = q.slice(1);
      return g === 'again' ? [...rest, q[0]] : rest;
    });
  };

  return (
    <Page>
      <PageHeader kicker="Spaced repetition" title="Review">
        Cards come back just before you’d forget them. A few minutes a day keeps every command fresh.
      </PageHeader>
      <div className={s.modeRow}>
        <Segmented<Mode>
          id="review-mode"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'due', label: 'Due today' },
            { value: 'all', label: 'Practise all' },
          ]}
        />
        <span className={s.count}>
          {unlocked.length} of {FLASHCARDS.length} cards unlocked
        </span>
      </div>

      {!unlocked.length ? (
        <div className={s.empty}>
          <h2>No cards yet</h2>
          <p>Finish your first mission to unlock its review cards.</p>
          <Button onClick={() => navigate('/mission/1')} iconRight="arrowRight">
            Go to Day 1
          </Button>
        </div>
      ) : !current ? (
        <div className={s.empty}>
          <motion.div className={s.doneMark} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 18 }}>
            ✓
          </motion.div>
          <h2>{doneCount ? 'Session complete' : 'All caught up'}</h2>
          <p>{nextDue ? `Next cards are due ${new Date(nextDue + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })}.` : 'Nothing scheduled — practise all cards any time.'}</p>
          {mode === 'due' && (
            <Button variant="secondary" onClick={() => setMode('all')}>
              Practise all cards
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className={s.progress}>
            <span>
              {doneCount} reviewed · {queue.length} left
            </span>
            <span className={s.tag}>{current.tag}</span>
          </div>
          <AnimatePresence mode="popLayout" initial={false}>
            <SwipeCard key={current.id + doneCount} flipped={flipped} onFlip={() => setFlipped((f) => !f)} onSwipe={(dir) => grade(dir === 'right' ? 'good' : 'again')} front={current.front} back={current.back} day={current.day} />
          </AnimatePresence>
          {flipped ? (
            <div className={s.grades}>
              <button className={[s.grade, s.again].join(' ')} onClick={() => grade('again')}>
                Again
                <small>soon</small>
              </button>
              <button className={s.grade} onClick={() => grade('hard')}>
                Hard
                <small>tomorrow</small>
              </button>
              <button className={[s.grade, s.good].join(' ')} onClick={() => grade('good')}>
                Good
                <small>later</small>
              </button>
              <button className={s.grade} onClick={() => grade('easy')}>
                Easy
                <small>much later</small>
              </button>
            </div>
          ) : (
            <Button block variant="secondary" onClick={() => setFlipped(true)} className={s.reveal}>
              Show answer
            </Button>
          )}
          <p className={s.hintLine}>Tap the card to flip · swipe right if you knew it, left if you didn’t</p>
        </>
      )}
    </Page>
  );
}

function SwipeCard({ front, back, day, flipped, onFlip, onSwipe }: { front: string; back: string; day: number; flipped: boolean; onFlip: () => void; onSwipe: (d: 'left' | 'right') => void }) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-10, 10]);
  const goodOpacity = useTransform(x, [20, 120], [0, 1]);
  const againOpacity = useTransform(x, [-120, -20], [1, 0]);
  return (
    <motion.div
      className={s.cardWrap}
      style={{ x, rotate }}
      drag={flipped ? 'x' : false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.9}
      onDragEnd={(_e, info) => {
        if (info.offset.x > 110) onSwipe('right');
        else if (info.offset.x < -110) onSwipe('left');
      }}
      initial={{ opacity: 0, y: 24, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: x.get() >= 0 ? 260 : -260, transition: { duration: 0.22 } }}
    >
      <motion.div className={s.card} animate={{ rotateY: flipped ? 180 : 0 }} transition={{ type: 'spring', stiffness: 260, damping: 26 }} onClick={onFlip}>
        <div className={s.face}>
          <span className={s.faceLabel}>Day {day} · Question</span>
          <Markdown className={s.front}>{front}</Markdown>
          <span className={s.flipHint}>tap to reveal</span>
        </div>
        <div className={[s.face, s.back].join(' ')}>
          <span className={s.faceLabel}>Answer</span>
          <Markdown className={s.backText}>{back}</Markdown>
        </div>
      </motion.div>
      <motion.span className={[s.swipeTag, s.swipeGood].join(' ')} style={{ opacity: goodOpacity }}>
        Knew it
      </motion.span>
      <motion.span className={[s.swipeTag, s.swipeAgain].join(' ')} style={{ opacity: againOpacity }}>
        Again
      </motion.span>
    </motion.div>
  );
}
