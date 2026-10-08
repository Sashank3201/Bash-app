import { defineFixture } from '../fixtures';
import { home, homeDir, put } from '../fixtures/base';
import { appLog, STORY_END } from '../fixtures/gen';
import type { Mission } from '../types';
import { ATTACK_LOG } from './day14';

/** Raj's draft, saved by Mara for review. Works on a good night; lies on a bad one. */
const FRAGILE = `#!/bin/bash
# errors.sh DIR - count the ERROR lines in a folder of logs
# Raj's draft. Saved as fragile.sh for review.
dir=$1
tmp=/tmp/errors.tmp
cd $dir
grep ERROR *.log > $tmp
echo "Report for $dir"
echo "Errors: $(wc -l < $tmp)"
`;

/** Strict mode on, and one honest grep that kills it. */
const COUNT = `#!/bin/bash
# count.sh - ERROR lines per log, strict mode on
set -euo pipefail
for f in "$HOME"/logs/*.log; do
  n=$(grep -c ERROR "$f")
  echo "\${f##*/}: $n"
done
`;

/** The reviewed tool: options, validation, logging, colour only on a terminal. */
const SCAN = `#!/bin/bash
# scan.sh - flag IPs with too many failed SSH logins
set -euo pipefail

usage() {
  echo "Usage: scan.sh [-t THRESHOLD] [-v] [-h] LOGFILE"
  echo "  -t N   alert at N or more failed logins (default 10)"
  echo "  -v     verbose: progress messages on stderr"
  echo "  -h     show this help"
}
log() { printf '[%s] %s: %s\\n' "$(date +%T)" "$1" "$2" >&2; }
die() { log ERROR "$1"; exit "\${2:-1}"; }

threshold=10
verbose=0
while getopts "t:vh" opt; do
  case $opt in
    t) threshold=$OPTARG ;;
    v) verbose=1 ;;
    h) usage; exit 0 ;;
    *) usage >&2; exit 2 ;;
  esac
done
shift $((OPTIND - 1))

if [ $# -ne 1 ]; then
  usage >&2
  exit 2
fi
logfile=$1
[[ $threshold =~ ^[0-9]+$ ]] || die "threshold must be a whole number: $threshold" 2
[ -r "$logfile" ] || die "cannot read $logfile"

if [ -t 1 ]; then
  red=$(tput setaf 1)
  reset=$(tput sgr0)
else
  red=""
  reset=""
fi

if [ "$verbose" -eq 1 ]; then log INFO "scanning $logfile, threshold $threshold"; fi
n=0
while read -r count ip; do
  if [ "$count" -ge "$threshold" ]; then
    echo "\${red}ALERT\${reset} $ip $count"
    n=$((n + 1))
  fi
done < <(grep "Failed password" "$logfile" | awk '{print $(NF-3)}' | sort | uniq -c | sort -rn)
if [ "$verbose" -eq 1 ]; then log INFO "done: $n suspicious IPs"; fi
echo "Suspicious IPs: $n"
`;

defineFixture('day19', (vfs) => {
  const pulled = Date.UTC(2026, 2, 14, 9, 0, 0);
  put(vfs, '/var/log/auth.log', ATTACK_LOG, { mode: 0o640, uid: 104, gid: 4, mtime: STORY_END });
  home(vfs, 'logs/db01.log', appLog({ seed: 191, lines: 25, errors: 4, warnings: 2, service: 'postgres' }), 0o644, pulled);
  home(vfs, 'logs/mail01.log', appLog({ seed: 192, lines: 15, warnings: 1, service: 'postfix' }), 0o644, pulled);
  home(vfs, 'logs/web01.log', appLog({ seed: 193, lines: 40, errors: 3, warnings: 4, service: 'portal' }), 0o644, pulled);
  home(vfs, 'ops logs/web02.log', appLog({ seed: 194, lines: 20, errors: 2, warnings: 1, service: 'portal' }), 0o644, pulled);
  home(vfs, 'incoming/README.txt', 'Ops drops each night\'s logs here at 02:00. Empty until then.\n', 0o644, pulled);
  home(vfs, 'tools/fragile.sh', FRAGILE, 0o755, Date.UTC(2026, 2, 13, 17, 40, 0));
  home(vfs, 'tools/count.sh', COUNT, 0o755, pulled);
  home(vfs, 'tools/scan.sh', SCAN, 0o755, pulled);
  homeDir(vfs, 'lab');
});

export const day19: Mission = {
  day: 19,
  week: 3,
  title: 'Built to Last',
  topic: 'Strict mode, traps, logging & getopts',
  minutes: 45,
  fixture: 'day19',
  briefing: 'This mission is being written.',
  objectives: [],
  lesson: [],
  drills: [],
  debrief: { summary: [], cards: [] },
  cards: [],
};
