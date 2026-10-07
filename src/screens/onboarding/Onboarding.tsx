import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon, type IconName } from '../../design/Icon';
import { Button, Segmented } from '../../design/ui';
import { useApp, type ThemePref } from '../../store/app';
import { Wordmark } from '../shell/AppShell';
import s from './Onboarding.module.css';

interface BIPEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}

let deferred: BIPEvent | null = null;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BIPEvent;
  });
}

export function useInstall() {
  const [canInstall, setCanInstall] = useState(!!deferred);
  useEffect(() => {
    const on = (e: Event) => {
      e.preventDefault();
      deferred = e as BIPEvent;
      setCanInstall(true);
    };
    window.addEventListener('beforeinstallprompt', on);
    return () => window.removeEventListener('beforeinstallprompt', on);
  }, []);
  const install = async () => {
    if (!deferred) return false;
    await deferred.prompt();
    const r = await deferred.userChoice;
    deferred = null;
    setCanInstall(false);
    return r.outcome === 'accepted';
  };
  const standalone = typeof window !== 'undefined' && (window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
  return { canInstall, install, standalone };
}

function platform(): 'android' | 'ios' | 'desktop' {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}

const FEATURES: { icon: IconName; title: string; body: string }[] = [
  { icon: 'path', title: '21 missions', body: 'A story-driven course: 30–45 minutes a day, each one a short lesson, hands-on tasks in a real terminal, and drills.' },
  { icon: 'case', title: '7 case files + a capstone', body: 'Graded projects from a system snapshot to a full incident triage. Your scripts are tested like a reviewer would.' },
  { icon: 'review', title: 'Review, Arena & Lab', body: 'Flashcards that come back just before you forget, extra challenges, and a sandbox — plus a real Linux machine.' },
];

export default function Onboarding() {
  const navigate = useNavigate();
  const profile = useApp((st) => st.profile);
  const setProfile = useApp((st) => st.setProfile);
  const theme = useApp((st) => st.settings.theme);
  const setSettings = useApp((st) => st.setSettings);
  const [step, setStep] = useState(0);
  const [name, setName] = useState(profile.name);
  const { canInstall, install, standalone } = useInstall();
  const plat = typeof navigator !== 'undefined' ? platform() : 'desktop';

  const finish = () => {
    setProfile({ name: name.trim() || 'Analyst', onboarded: true, startedAt: profile.startedAt ?? Date.now() });
    useApp.getState().touch();
    navigate('/mission/1');
  };

  return (
    <div className={s.wrap}>
      <AnimatePresence mode="wait">
        {step === 0 && (
          <motion.section key="0" className={s.cover} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: -12 }}>
            <div className={s.masthead}>
              <span>Halden Security</span>
              <span>Analyst Training Programme</span>
            </div>
            <div className="rule-double" />
            <motion.div className={s.hero} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, type: 'spring', stiffness: 160, damping: 22 }}>
              <div className={s.bigMark}>
                <Wordmark />
              </div>
              <p className={s.lede}>Learn Bash the way security analysts actually use it — in twenty-one days, on the phone in your hand.</p>
            </motion.div>
            <motion.div className={s.letter} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
              <div className={s.letterHead}>Offer of internship</div>
              <p>
                We’d like you to join our Detection &amp; Response desk as an intern analyst. You’ll start with the basics of the shell and finish by triaging a real incident with scripts you wrote yourself.
              </p>
              <label className={s.nameLabel} htmlFor="name">
                Your name, for your case files
              </label>
              <input
                id="name"
                className={s.name}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your first name"
                autoComplete="given-name"
                maxLength={40}
                onKeyDown={(e) => e.key === 'Enter' && name.trim() && setStep(1)}
              />
              <Button block onClick={() => setStep(1)} disabled={!name.trim()} iconRight="arrowRight">
                Accept the offer
              </Button>
            </motion.div>
          </motion.section>
        )}

        {step === 1 && (
          <motion.section key="1" className={s.panel} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}>
            <div className="kicker">How it works</div>
            <h1 className={s.h1}>Welcome aboard, {name.trim() || 'Analyst'}.</h1>
            <p className={s.p}>Everything happens inside the app — no laptop needed. The terminal here runs real Bash syntax on a simulated Linux workstation.</p>
            <div className={s.features}>
              {FEATURES.map((f, i) => (
                <motion.div key={f.title} className={s.feature} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 * i }}>
                  <span className={s.featureIcon}>
                    <Icon name={f.icon} />
                  </span>
                  <div>
                    <div className={s.featureTitle}>{f.title}</div>
                    <p>{f.body}</p>
                  </div>
                </motion.div>
              ))}
            </div>
            <div className={s.themeRow}>
              <span>Appearance</span>
              <div style={{ width: 240 }}>
                <Segmented<ThemePref>
                  id="ob-theme"
                  value={theme}
                  onChange={(t) => setSettings({ theme: t })}
                  options={[
                    { value: 'light', label: 'Paper' },
                    { value: 'dark', label: 'Night' },
                    { value: 'system', label: 'Auto' },
                  ]}
                />
              </div>
            </div>
            <div className={s.nav}>
              <Button variant="ghost" icon="arrowLeft" onClick={() => setStep(0)}>
                Back
              </Button>
              <Button onClick={() => setStep(2)} iconRight="arrowRight">
                Next
              </Button>
            </div>
          </motion.section>
        )}

        {step === 2 && (
          <motion.section key="2" className={s.panel} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}>
            <div className="kicker">One last thing</div>
            <h1 className={s.h1}>{standalone ? 'You’re all set.' : 'Put it on your home screen.'}</h1>
            {standalone ? (
              <p className={s.p}>You’re running Ink &amp; Shell as an app. It works offline, and your progress is saved on this device.</p>
            ) : (
              <>
                <p className={s.p}>Installed, Ink &amp; Shell opens full-screen like a normal app and works offline. Your progress stays on this device — you can export a backup any time from your Dossier.</p>
                {canInstall ? (
                  <Button block variant="accent" icon="download" onClick={install}>
                    Install the app
                  </Button>
                ) : (
                  <ol className={s.steps}>
                    {plat === 'ios' ? (
                      <>
                        <li>Open this page in <b>Safari</b>.</li>
                        <li>Tap the <b>Share</b> button (the square with an arrow).</li>
                        <li>Choose <b>Add to Home Screen</b>, then <b>Add</b>.</li>
                      </>
                    ) : plat === 'android' ? (
                      <>
                        <li>Open this page in <b>Chrome</b>.</li>
                        <li>Tap the <b>⋮</b> menu in the top-right corner.</li>
                        <li>Choose <b>Install app</b> (or <b>Add to Home screen</b>).</li>
                      </>
                    ) : (
                      <>
                        <li>In Chrome or Edge, click the <b>install</b> icon at the right end of the address bar.</li>
                        <li>Or open the browser menu and choose <b>Install Ink &amp; Shell</b>.</li>
                      </>
                    )}
                  </ol>
                )}
              </>
            )}
            <div className={s.nav}>
              <Button variant="ghost" icon="arrowLeft" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button onClick={finish} iconRight="arrowRight">
                Start Day 1
              </Button>
            </div>
          </motion.section>
        )}
      </AnimatePresence>
      <div className={s.dots} aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span key={i} className={i === step ? s.dotOn : ''} />
        ))}
      </div>
    </div>
  );
}
