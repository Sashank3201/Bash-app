// The Real Linux Lab: an Ubuntu i386 kernel + real bash, booted by the v86 emulator in the browser.
// Image: scripts/linux-image/build.sh → public/linux/. No network inside the VM.
import '@xterm/xterm/css/xterm.css';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal as XTerm } from '@xterm/xterm';
import { useEffect, useRef, useState } from 'react';
import { V86 } from 'v86';
import wasmUrl from 'v86/build/v86.wasm?url';
import { Button } from '../../design/ui';
import s from './RealLinux.module.css';

type Phase = 'checking' | 'intro' | 'loading' | 'booting' | 'ready' | 'error' | 'unavailable';

interface Manifest {
  files: { name: string; size: number; sha256: string }[];
  total: number;
}

interface Machine {
  emulator: V86 | null;
  term: XTerm;
  fit: FitAddon;
  host: HTMLDivElement;
  ready: boolean;
  manifest: Manifest;
}

const BASE = import.meta.env.BASE_URL + 'linux/';

// One machine per page load, so switching between Simulator and Real Linux keeps it running.
let machine: Machine | null = null;
const listeners = new Set<(p: Phase, progress: number) => void>();
function emit(p: Phase, progress = 0) {
  for (const l of listeners) l(p, progress);
}

const KEYS: { label: string; send: string; wide?: boolean }[] = [
  { label: 'Tab', send: '\t', wide: true },
  { label: '↑', send: '\x1b[A' },
  { label: '↓', send: '\x1b[B' },
  { label: '←', send: '\x1b[D' },
  { label: '→', send: '\x1b[C' },
  { label: '^C', send: '\x03', wide: true },
  { label: '^D', send: '\x04', wide: true },
  { label: 'Esc', send: '\x1b', wide: true },
  ...['|', '>', '$', '"', "'", '-', '/', '~', '*', '&', ';', '<', '{', '}', '[', ']', '(', ')', '=', '#', '\\', '`', '!', '_'].map((c) => ({ label: c, send: c })),
];

function cssVar(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

async function loadManifest(): Promise<Manifest | null> {
  try {
    const r = await fetch(BASE + 'manifest.json', { cache: 'no-cache' });
    if (!r.ok) return null;
    return (await r.json()) as Manifest;
  } catch {
    return null;
  }
}

function createTerminal(manifest: Manifest) {
  const host = document.createElement('div');
  host.className = s.xterm;
  const term = new XTerm({
    fontFamily: "'IBM Plex Mono', ui-monospace, Menlo, Consolas, monospace",
    fontSize: window.matchMedia('(min-width: 900px)').matches ? 14 : 13,
    cursorBlink: true,
    convertEol: false,
    scrollback: 3000,
    theme: {
      background: cssVar('--term-bg', '#16130f'),
      foreground: cssVar('--term-fg', '#ede6d8'),
      cursor: cssVar('--term-accent', '#f0a23b'),
      selectionBackground: '#4a4136',
      black: '#3a342c',
      red: '#ef6a61',
      green: '#8fc9a4',
      yellow: '#f0c674',
      blue: '#8fb3d9',
      magenta: '#d9a7d3',
      cyan: '#7fc8c4',
      white: '#d8d0c0',
      brightBlack: '#776f63',
      brightRed: '#ff8a80',
      brightGreen: '#a8e0b9',
      brightYellow: '#ffd98a',
      brightBlue: '#a9c9ee',
      brightMagenta: '#ebbfe6',
      brightCyan: '#9fe0dc',
      brightWhite: '#f7f1e6',
    },
  });
  const fit = new FitAddon();
  term.loadAddon(fit);
  term.open(host);
  machine = { emulator: null, term, fit, host, ready: false, manifest };
  emit('loading', 0);
}

/** Boot once the terminal is on screen and fitted, so the VM's tty gets the real size. */
function boot(m: Machine) {
  if (m.emulator) return;
  const { term, manifest } = m;
  const size = (name: string) => manifest.files.find((f) => f.name === name);
  const url = (name: string) => `${BASE}${name}?v=${size(name)?.sha256 ?? ''}`;
  const cols = Math.max(40, term.cols);
  const rows = Math.max(12, term.rows);

  const emulator = new V86({
    wasm_path: wasmUrl,
    memory_size: 128 * 1024 * 1024,
    vga_memory_size: 2 * 1024 * 1024,
    bios: { url: url('bios.bin') },
    bzimage: { url: url('vmlinuz'), size: size('vmlinuz')?.size },
    initrd: { url: url('initrd.img'), size: size('initrd.img')?.size },
    cmdline: `console=ttyS0 quiet loglevel=3 tsc=reliable mitigations=off random.trust_cpu=on lab.cols=${cols} lab.rows=${rows}`,
    autostart: true,
    disable_keyboard: true,
    disable_mouse: true,
    disable_speaker: true,
  });

  m.emulator = emulator;

  const loaded: Record<string, number> = {};
  emulator.add_listener('download-progress', (e) => {
    loaded[e.file_name] = e.loaded;
    const done = Object.values(loaded).reduce((a, b) => a + b, 0);
    emit('loading', Math.min(1, done / Math.max(1, manifest.total)));
  });
  emulator.add_listener('emulator-started', () => emit('booting'));

  // Batch serial output into one write per frame; xterm decodes the UTF-8 bytes itself.
  let pending: number[] = [];
  let tail = '';
  emulator.add_listener('serial0-output-byte', (b) => {
    if (!pending.length) {
      requestAnimationFrame(() => {
        const chunk = new Uint8Array(pending);
        pending = [];
        term.write(chunk);
        if (!m.ready) {
          tail = (tail + String.fromCharCode(...chunk)).slice(-200);
          if (tail.includes('@halden-lab')) {
            m.ready = true;
            emit('ready');
          }
        }
      });
    }
    pending.push(b);
  });
  term.onData((data) => emulator.serial0_send(data));
}

async function powerOff() {
  const m = machine;
  machine = null;
  if (!m) return;
  try {
    await m.emulator?.destroy();
  } catch {
    /* already stopped */
  }
  m.term.dispose();
  m.host.remove();
}

export default function RealLinux() {
  const [phase, setPhase] = useState<Phase>(machine ? (machine.ready ? 'ready' : 'booting') : 'checking');
  const [progress, setProgress] = useState(0);
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const slot = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const l = (p: Phase, pr: number) => {
      setPhase(p);
      setProgress(pr);
    };
    listeners.add(l);
    if (!machine) {
      if (typeof WebAssembly !== 'object') setPhase('unavailable');
      else
        loadManifest().then((mf) => {
          setManifest(mf);
          if (!machine) setPhase(mf ? 'intro' : 'unavailable');
        });
    }
    return () => {
      listeners.delete(l);
    };
  }, []);

  // Mount the (long-lived) terminal into this view, and keep it sized to the slot.
  useEffect(() => {
    const m = machine;
    const el = slot.current;
    if (!m || !el || phase === 'intro' || phase === 'checking' || phase === 'unavailable') return;
    el.appendChild(m.host);
    const refit = () => {
      try {
        m.fit.fit();
      } catch {
        /* not visible yet */
      }
    };
    refit();
    boot(m);
    const ro = new ResizeObserver(refit);
    ro.observe(el);
    return () => {
      ro.disconnect();
      if (m.host.parentElement === el) el.removeChild(m.host);
    };
  }, [phase]);

  const powerOn = () => {
    if (!manifest) return;
    try {
      setError(null);
      createTerminal(manifest);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('error');
    }
  };

  const send = (data: string) => {
    machine?.emulator?.serial0_send(data);
    machine?.term.focus();
  };

  if (phase === 'unavailable' || phase === 'error') return <Fallback error={error} />;

  if (phase === 'checking' || phase === 'intro') {
    const mb = manifest ? (manifest.total / 1e6).toFixed(0) : '13';
    return (
      <div className={s.card}>
        <div className="kicker">Real Linux</div>
        <h2 className={s.cardTitle}>A real machine, in your browser</h2>
        <p>
          This boots an actual Linux kernel with <strong>real bash 4.4 and the GNU tools</strong>, inside an emulator on your device. Same practice files as the simulator. No
          network, nothing leaves this page.
        </p>
        <ul className={s.facts}>
          <li>
            <strong>{mb} MB</strong> download the first time, then it’s saved for offline use.
          </li>
          <li>Boots in about 10–20 seconds. Works best on Wi-Fi and a recent phone.</li>
          <li>Nothing is saved when you power off. Use the Simulator Lab for files you want to keep.</li>
        </ul>
        <Button icon="play" onClick={powerOn} disabled={!manifest}>
          Power on
        </Button>
      </div>
    );
  }

  return (
    <div className={s.wrap}>
      <div className={s.bar}>
        <span className={s.dot} data-on={phase === 'ready'} />
        <span className={s.status}>{phase === 'ready' ? 'halden-lab · Linux 4.15 · bash 4.4' : phase === 'loading' ? `Downloading Linux… ${Math.round(progress * 100)}%` : 'Booting the kernel…'}</span>
        <button
          className={s.power}
          onClick={async () => {
            if (!window.confirm('Power off the machine? Anything you created in it will be lost.')) return;
            await powerOff();
            setPhase('intro');
          }}
        >
          Power off
        </button>
      </div>
      {phase === 'loading' && (
        <div className={s.progress}>
          <span style={{ transform: `scaleX(${progress})` }} />
        </div>
      )}
      <div className={s.screen} ref={slot} onClick={() => machine?.term.focus()} />
      <div className={s.keys} role="toolbar" aria-label="Terminal keys">
        {KEYS.map((k, i) => (
          <button key={i} className={k.wide ? s.keyWide : s.key} onMouseDown={(e) => e.preventDefault()} onClick={() => send(k.send)}>
            {k.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Fallback({ error }: { error: string | null }) {
  return (
    <div className={s.card}>
      <div className="kicker">Real Linux</div>
      <h2 className={s.cardTitle}>Real Linux isn’t available here</h2>
      {error ? <p className={s.err}>The emulator couldn’t start: {error}</p> : <p>This device or browser can’t run the in-browser Linux machine.</p>}
      <p>You can still practise on real bash with a free terminal app:</p>
      <ul className={s.facts}>
        <li>
          <strong>Android — Termux</strong> (install it from F-Droid), then run:
          <pre className={s.code}>pkg update && pkg install bash coreutils grep sed gawk findutils nano</pre>
        </li>
        <li>
          <strong>iPhone / iPad — iSH Shell</strong> (App Store), then run:
          <pre className={s.code}>apk add bash coreutils grep sed gawk findutils nano</pre>
        </li>
      </ul>
      <p className={s.muted}>Everything in this course works in both. The Simulator Lab is always available too.</p>
    </div>
  );
}
