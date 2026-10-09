# Ink & Shell

Learn Bash scripting for defensive security in 21 days, on your phone.

**Open it:** https://sashank3201.github.io/Bash-app/

You play a new intern analyst at Halden Security. Mara Okafor, a senior analyst, sends you one mission a day. You learn the commands, use them on realistic logs from a server that was broken into, and finish by writing the script that triages a compromised machine.

## Put it on your phone

1. Open the link above in Chrome (Android) or Safari (iPhone).
2. Android: menu **⋮ → Add to Home screen**. iPhone: **Share → Add to Home Screen**.
3. Open it from the icon. After the first visit it works offline.

Your progress lives on the device. To move it to another phone or a PC, use **Dossier → Export backup** (a file or a copy-paste code), then **Import** on the other device.

## What's inside

| | |
|---|---|
| **21 missions** | 30–45 minutes each, in three chapters: foundations (files, grep, pipes, permissions, first script), logic (arguments, `if`, loops, `awk`/`sed`, functions, regex) and security scripting (arrays, encoding and hashing, timelines, `find` audits, robust scripts, integrity checks) |
| **8 case files** | Graded projects. Your script runs against hidden test servers: a host snapshot, a log sweep, a brute-force detector, a log decoder, an incident timeline, an audit bot, an integrity watcher, and the capstone incident triage |
| **Arena** | Extra challenges by topic and difficulty, unlocked as you go |
| **Review** | Spaced-repetition flashcards for every command and idea |
| **Lab** | A free terminal with your own home folder, plus **Real Linux**: real bash in a small Linux VM that runs in the browser, with the course files preloaded |
| **Reference** | A plain-English manual for every command the course uses (`man <command>` in any terminal) |

You earn XP and analyst ranks (Intern → Junior → Analyst → Senior → Lead), keep a daily streak and collect badges. Closing the capstone promotes you to Lead Analyst and unlocks a printable certificate.

Everything is defensive: reading logs, spotting attacks, auditing permissions, checking file integrity, writing incident reports. Attackers' commands only ever appear as evidence you decode and report, never as something you run. All names, domains (`.example`) and IP addresses (documentation and reserved ranges) are fictional.

## When you have a PC

Everything you learn works in a real terminal. On Windows install WSL (`wsl --install`), on a Mac open Terminal, and on Android you can already use [Termux](https://termux.dev).

To run the app itself locally (Node 20+):

```bash
npm install
npm run dev          # http://localhost:5173/Bash-app/
npm test             # unit, differential (simulator vs real bash) and content tests
npm run e2e          # browser tests at phone and desktop sizes
```

The Real Linux image is built separately on Linux (needs `curl`, `dpkg-deb`, `xz` and Python 3; it downloads about 20 MB of pinned Ubuntu packages):

```bash
scripts/linux-image/build.sh    # writes public/linux/
```

## How it's built

- **React + TypeScript + Vite**, a PWA hosted on GitHub Pages (`.github/workflows/deploy.yml` tests, builds the Linux image and deploys on every push to the default branch).
- **`src/shell/`**: a Bash interpreter written for the app (parser, expansions, builtins, about 100 commands, an in-memory filesystem). Differential tests in `tests/diff/` run the same snippets through `/bin/bash` and require identical output.
- **`src/content/`**: missions, cases, arena, flashcards and the reference. Every task's solution is checked against its own grader in `tests/content/`. See [docs/CONTENT_GUIDE.md](docs/CONTENT_GUIDE.md) before writing content.
- **`src/engine/`** grading, XP, ranks, streaks, badges and SM-2 scheduling; **`src/store/`** saved progress.
- **`scripts/linux-image/`**: an Ubuntu 18.04 i386 kernel and an initramfs with real bash and GNU tools, every package pinned by SHA-256, booted in the browser by [v86](https://github.com/copy/v86).
