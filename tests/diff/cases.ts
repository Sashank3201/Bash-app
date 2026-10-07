// Differential test cases: each snippet runs in real bash and in the simulator; stdout + exit status must match.

export interface DiffCase {
  name: string;
  src: string;
  files?: Record<string, string>;
  stdin?: string;
  args?: string[];
}

const AUTH = `Mar 14 09:01:12 web01 sshd[1201]: Failed password for root from 203.0.113.7 port 50122 ssh2
Mar 14 09:01:15 web01 sshd[1201]: Failed password for root from 203.0.113.7 port 50124 ssh2
Mar 14 09:02:01 web01 sshd[1210]: Accepted password for analyst from 10.20.0.5 port 51000 ssh2
Mar 14 09:03:44 web01 sshd[1222]: Failed password for invalid user admin from 198.51.100.23 port 40210 ssh2
Mar 14 09:03:47 web01 sshd[1222]: Failed password for invalid user admin from 198.51.100.23 port 40212 ssh2
Mar 14 09:03:50 web01 sshd[1222]: Failed password for invalid user test from 198.51.100.23 port 40214 ssh2
Mar 14 09:05:02 web01 sudo:  analyst : TTY=pts/0 ; PWD=/home/analyst ; USER=root ; COMMAND=/usr/bin/apt update
Mar 14 09:06:30 web01 sshd[1240]: Failed password for root from 203.0.113.7 port 50300 ssh2
`;

const ACCESS = `10.0.0.5 - - [14/Mar/2026:09:00:01 +0000] "GET /index.html HTTP/1.1" 200 5120 "-" "Mozilla/5.0"
10.0.0.9 - - [14/Mar/2026:09:00:03 +0000] "GET /admin HTTP/1.1" 404 210 "-" "curl/8.0"
10.0.0.9 - - [14/Mar/2026:09:00:04 +0000] "GET /wp-login.php HTTP/1.1" 404 210 "-" "curl/8.0"
10.0.0.5 - - [14/Mar/2026:09:00:09 +0000] "GET /about.html HTTP/1.1" 200 2048 "-" "Mozilla/5.0"
10.0.0.7 - - [14/Mar/2026:09:01:00 +0000] "POST /login HTTP/1.1" 302 0 "-" "Mozilla/5.0"
10.0.0.9 - - [14/Mar/2026:09:01:02 +0000] "GET /.env HTTP/1.1" 404 210 "-" "curl/8.0"
`;

export const CASES: DiffCase[] = [
  // ---- basics
  { name: 'echo', src: 'echo hello world; echo -n no-newline; echo; echo -e "a\\tb\\nc"' },
  { name: 'quoting', src: `x="a  b"; echo $x; echo "$x"; echo '$x'; echo "it's"; echo \\$HOME_NOT` },
  { name: 'variables', src: 'name=Mara; greeting="Hi, $name"; echo "$greeting"; echo "${name}s"; unset name; echo "[${name}]"' },
  { name: 'param ops', src: `f=/var/log/auth.log.1; echo "\${f##*/}" "\${f%.*}" "\${f#*/}" "\${f%%.*}"; s=hello; echo "\${#s}" "\${s^^}" "\${s:1:3}" "\${s: -2}" "\${s/l/L}" "\${s//l/L}"` },
  { name: 'defaults', src: 'echo "${a:-default}" "${b-unset}"; c=""; echo "[${c:-empty}]" "[${c-x}]"; : "${d:=assigned}"; echo "$d"; echo "${d:+alt}"' },
  { name: 'arith', src: 'echo $((3 + 4 * 2)) $((10 / 3)) $((10 % 3)) $((2 ** 10)) $((-7 / 2)) $(( (1+2) << 2 )); x=5; ((x++)); ((x+=10)); echo $x; echo $((x > 3 ? 1 : 0))' },
  { name: 'arith vars', src: 'a=3; b=a+1; echo $((b * 2)); let c=4*5 d=c+1; echo $c $d; echo $(( 0x1f + 010 + 2#101 ))' },
  { name: 'command substitution', src: 'n=$(echo hi | tr a-z A-Z); echo "got $n"; echo "lines: $(printf "a\\nb\\n" | wc -l)"; echo `echo backtick`' },
  { name: 'exit status', src: 'true; echo $?; false; echo $?; ls /nonexistent 2>/dev/null; echo $?; nosuchcmd 2>/dev/null; echo $?' },
  { name: 'and or', src: 'true && echo yes; false && echo no; false || echo fallback; true || echo never; echo end' },
  { name: 'brace expansion', src: 'echo {a,b,c}.txt; echo file{1..5}; echo {05..10..2}; echo {z..v}; echo pre{x,y{1,2}}post' },
  { name: 'globbing', src: 'touch a.log b.log c.txt .hidden.log; echo *.log; echo *.txt; echo ?.log; echo [ab].log; echo *.nomatch; echo .*.log', files: {} },
  { name: 'word splitting', src: 'list="one two   three"; for w in $list; do echo "[$w]"; done; IFS=, ; csv="a,b,,c"; for x in $csv; do echo "<$x>"; done' },
  { name: 'arrays', src: 'arr=(alpha beta "gamma delta"); echo ${#arr[@]}; echo "${arr[1]}"; for x in "${arr[@]}"; do echo "- $x"; done; arr+=(epsilon); echo "${arr[@]:1:2}"; echo "${!arr[@]}"' },
  { name: 'assoc arrays', src: 'declare -A c; c[10.0.0.1]=3; c[10.0.0.2]=5; ((c[10.0.0.1]++)); for k in "${!c[@]}"; do echo "$k ${c[$k]}"; done | sort' },
  { name: 'if elif else', src: 'for n in 3 15 42; do if [ $n -lt 10 ]; then echo "$n small"; elif [ $n -lt 20 ]; then echo "$n medium"; else echo "$n large"; fi; done' },
  { name: 'test operators', src: 'touch f; mkdir d; [ -f f ] && echo file; [ -d d ] && echo dir; [ -e nope ] || echo missing; [ -z "" ] && echo empty; [ "a" = "a" ] && echo eq; [ "a" != "b" ] && echo ne; [ 5 -ge 5 ] && echo ge; [ ! -f d ] && echo notfile' },
  { name: 'double bracket', src: 'x=report.log; [[ $x == *.log ]] && echo log; [[ $x =~ ^rep(ort)\\.(.*)$ ]] && echo "${BASH_REMATCH[1]} ${BASH_REMATCH[2]}"; [[ -n $x && $x != *.txt ]] && echo ok; [[ abc < abd ]] && echo lt' },
  { name: 'case', src: 'for f in a.log b.txt c.sh d; do case $f in *.log) echo "$f: log";; *.txt|*.md) echo "$f: text";; *.sh) echo "$f: script";; *) echo "$f: other";; esac; done' },
  { name: 'while read', src: 'printf "alice 30\\nbob 25\\ncarol 41\\n" > people.txt; while read -r name age; do echo "$name is $age"; done < people.txt' },
  { name: 'while counter', src: 'i=0; while [ $i -lt 5 ]; do i=$((i+1)); [ $i -eq 2 ] && continue; [ $i -eq 4 ] && break; echo $i; done; echo done' },
  { name: 'until', src: 'n=3; until [ $n -eq 0 ]; do echo $n; n=$((n-1)); done' },
  { name: 'c-style for', src: 'for ((i=0; i<10; i+=3)); do echo -n "$i "; done; echo' },
  { name: 'nested loops break 2', src: 'for i in 1 2 3; do for j in a b c; do [ "$j" = b ] && [ $i -eq 2 ] && break 2; echo $i$j; done; done' },
  { name: 'functions', src: 'greet() { local who=${1:-world}; echo "hello, $who"; return 3; }; greet; greet Mara; echo "rc=$?"; x=outer; f() { local x=inner; echo $x; }; f; echo $x' },
  { name: 'function args', src: 'show() { echo "count=$# first=$1 all=$*"; shift; echo "after shift: $@"; }; show a b c' },
  { name: 'recursion', src: 'fact() { if [ $1 -le 1 ]; then echo 1; else echo $(( $1 * $(fact $(( $1 - 1 ))) )); fi; }; fact 6' },
  { name: 'heredoc', src: 'name=Mara; cat <<EOF\nHello $name\nToday: $((2+2))\nEOF\ncat <<\'RAW\'\n$name stays\nRAW\ncat <<-TABS\n\tindented\nTABS' },
  { name: 'here string', src: 'read -r a b <<< "first second third"; echo "$a|$b"; wc -w <<< "one two three"' },
  { name: 'redirections', src: 'echo one > out.txt; echo two >> out.txt; cat out.txt; ls nope 2> err.txt; wc -l < err.txt; { echo x; echo y; } > grp.txt; cat grp.txt; echo both &> all.txt; cat all.txt' },
  { name: 'stderr to stdout', src: 'ls nonexistent 2>&1 | wc -l; (echo out; echo err >&2) 2>&1 | sort' },
  { name: 'subshell isolation', src: 'x=1; (x=2; echo "in: $x"); echo "out: $x"; echo hi | read v; echo "[$v]"' },
  { name: 'set -e', src: 'set -e; echo before; false || echo handled; if false; then :; fi; echo still; false; echo never' },
  { name: 'pipefail', src: 'false | true; echo $?; set -o pipefail; false | true; echo $?' },
  { name: 'trap exit', src: 'trap "echo cleanup" EXIT; echo working; exit 3' },
  { name: 'printf', src: `printf "%s=%d\\n" a 1 b 2; printf "%5s|%-5s|\\n" ab cd; printf "%05.2f %x %o %c\\n" 3.14159 255 8 hello; printf "%%done\\n"; printf "%s\\n" "multi word"` },
  { name: 'printf -v and reuse', src: 'printf -v out "%03d" 7; echo $out; printf "[%s]" a b c; echo' },
  { name: 'getopts', src: 'parse() { local OPTIND=1 opt; while getopts "vt:o:" opt; do case $opt in v) echo verbose;; t) echo "threshold $OPTARG";; o) echo "out $OPTARG";; esac; done; shift $((OPTIND-1)); echo "rest: $*"; }; parse -v -t 5 -oreport.txt file1 file2' },
  { name: 'read IFS', src: 'IFS=: read -r user pass uid gid rest <<< "root:x:0:0:root:/root:/bin/bash"; echo "$user $uid $rest"' },
  { name: 'mapfile', src: 'printf "a\\nb\\nc\\n" > l.txt; mapfile -t lines < l.txt; echo ${#lines[@]} ${lines[2]}' },
  { name: 'string compare loop', src: 'for w in banana apple cherry; do echo $w; done | sort | head -2' },
  { name: 'positional', src: 'echo "$# $1 $2"; for a in "$@"; do echo "<$a>"; done; echo "${@:2}"', args: ['one', 'two words', 'three'] },
  { name: 'exit code of function', src: 'check() { [ "$1" -gt 10 ]; }; check 5 && echo big || echo small; check 50 && echo big || echo small' },
  { name: 'declare -i and -p', src: 'declare -i n=5; n+=3; echo $n; n="2*4"; echo $n; arr=(1 2); declare -p arr' },
  { name: 'local -a', src: 'f() { local -a items=(x y z); echo ${#items[@]}; }; f' },
  { name: 'eval and indirect', src: 'var=greeting; greeting=hi; echo ${!var}; eval "num=$((6*7))"; echo $num' },
  { name: 'source', src: 'echo \'LIB_VAR=loaded; libfn() { echo "lib says $1"; }\' > lib.sh; source ./lib.sh; echo $LIB_VAR; libfn hey' },

  // ---- coreutils
  { name: 'cat -n', src: 'printf "a\\n\\nb\\n" > f; cat -n f; cat -b f' },
  { name: 'head tail', src: 'seq 1 20 > n.txt; head -3 n.txt; tail -n 2 n.txt; tail -n +18 n.txt; head -n -17 n.txt; seq 5 | head -c 4; echo' },
  { name: 'wc', src: 'printf "one two\\nthree\\n" > w.txt; wc w.txt; wc -l w.txt; wc -w < w.txt; wc -c w.txt; cat w.txt | wc' },
  { name: 'sort variants', src: 'printf "10\\n9\\n100\\nb\\na\\nB\\n" > s.txt; sort s.txt; sort -n s.txt; sort -r s.txt; sort -u <<< $\'x\\nx\\ny\'' },
  { name: 'sort keys', src: 'printf "bob 25 b\\nalice 30 a\\ncarol 25 c\\n" > p.txt; sort -k2,2n -k1,1 p.txt; sort -t" " -k3 p.txt; sort -k2nr p.txt' },
  { name: 'uniq', src: 'printf "a\\na\\nb\\nc\\nc\\nc\\n" > u.txt; uniq u.txt; uniq -c u.txt; uniq -d u.txt; uniq -u u.txt' },
  { name: 'cut', src: 'echo "root:x:0:0:root:/root:/bin/bash" | cut -d: -f1,7; echo "abcdef" | cut -c2-4; echo "a,b,c,d" | cut -d, -f2-; printf "x\\ty\\n" | cut -f2' },
  { name: 'tr', src: 'echo "Hello World" | tr a-z A-Z; echo "Hello" | tr -d l; echo "aaabbb   ccc" | tr -s "ab "; echo "Uryyb" | tr "A-Za-z" "N-ZA-Mn-za-m"; echo "a1b2c3" | tr -cd "0-9"; echo; echo "x y" | tr "[:lower:]" "[:upper:]"' },
  { name: 'grep basics', src: 'grep "Failed" auth.log | wc -l; grep -c "invalid user" auth.log; grep -i "accepted" auth.log | cut -d" " -f9; grep -v sshd auth.log | wc -l', files: { 'auth.log': AUTH } },
  { name: 'grep -o -E', src: `grep -oE "([0-9]{1,3}\\.){3}[0-9]{1,3}" auth.log | sort | uniq -c | sort -rn`, files: { 'auth.log': AUTH } },
  { name: 'grep -n -w -x', src: 'printf "cat\\ncatalog\\nthe cat sat\\n" > g.txt; grep -n cat g.txt; grep -w cat g.txt; grep -x cat g.txt; grep -l cat g.txt; grep -q dog g.txt; echo $?' },
  { name: 'grep context', src: 'seq 1 10 > s.txt; grep -A1 -B1 5 s.txt; grep -C1 -e 2 -e 9 s.txt' },
  { name: 'grep multiple files', src: 'echo alpha > a.txt; echo beta > b.txt; grep -H a a.txt b.txt; grep a a.txt b.txt; grep -h a a.txt b.txt; mkdir sub; cp b.txt sub/; grep -r beta sub | sort' },
  { name: 'pipeline brute force', src: `grep "Failed password" auth.log | awk '{print $(NF-3)}' | sort | uniq -c | sort -rn`, files: { 'auth.log': AUTH } },

  // ---- awk
  { name: 'awk fields', src: `awk '{print $1, $NF}' access.log; awk -F'"' '{print $2}' access.log | head -2`, files: { 'access.log': ACCESS } },
  { name: 'awk patterns', src: `awk '$9 == 404 {print $1, $7}' access.log; awk '$9 ~ /^2/ {ok++} END {print "ok:", ok}' access.log`, files: { 'access.log': ACCESS } },
  { name: 'awk aggregate', src: `awk '{bytes[$1] += $10} END {for (ip in bytes) print ip, bytes[ip]}' access.log | sort`, files: { 'access.log': ACCESS } },
  { name: 'awk printf and NR', src: `awk 'NR==2 || NR==4 {printf "%-10s %5d\\n", $1, $10}' access.log; awk 'END {print NR}' access.log`, files: { 'access.log': ACCESS } },
  { name: 'awk BEGIN FS OFS', src: `awk 'BEGIN {FS=":"; OFS="|"} $3 >= 1000 {print $1, $3, $7}' passwd`, files: { passwd: 'root:x:0:0:root:/root:/bin/bash\ndaemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin\nanalyst:x:1000:1000:Analyst:/home/analyst:/bin/bash\nmara:x:1001:1001::/home/mara:/bin/bash\n' } },
  { name: 'awk string funcs', src: `echo "Hello,World,Foo" | awk -F, '{print length($0), toupper($2), substr($1,2,3), index($0,"World")}'; echo "a-b-c" | awk '{n=split($0, p, "-"); print n, p[3]; gsub(/-/, "+"); print}'; echo "foo123bar" | awk '{ if (match($0, /[0-9]+/)) print RSTART, RLENGTH }'` },
  { name: 'awk -v and math', src: `awk -v t=3 'BEGIN { x = 7; print x / 2, int(x/2), x % t, x ^ 2, (x > t ? "big" : "small") }'` },
  { name: 'awk uninit and concat', src: `printf "3\\n4\\n\\n5\\n" | awk '{ s += $1; c = c $1 } END { print s, c, (u == 0), (u == "") }'` },
  { name: 'awk next and range', src: `seq 1 10 | awk 'NR==3 {next} NR>=2 && NR<=5'; seq 1 10 | awk '/4/,/6/'` },
  { name: 'awk functions', src: `awk 'function sq(n) { return n*n } function fill(a, k) { a[k] = sq(k) } BEGIN { fill(arr, 3); fill(arr, 4); print arr[3] + arr[4] }'` },
  { name: 'awk while for', src: `awk 'BEGIN { i = 0; while (i < 3) { printf "%d ", i; i++ }; for (j = 3; j > 0; j--) printf "%d ", j; print "" }'` },
  { name: 'awk printf %s padding', src: `printf "a 1\\nbbb 22\\n" | awk '{ printf "[%5s][%-4s][%03d]\\n", $1, $1, $2 }'` },
  { name: 'awk delete in', src: `awk 'BEGIN { a["x"]=1; a["y"]=2; delete a["x"]; print ("x" in a), ("y" in a), length(a) }'` },

  // ---- sed
  { name: 'sed substitute', src: `echo "hello world" | sed 's/o/0/'; echo "hello world" | sed 's/o/0/g'; echo "aaa" | sed 's/a/b/2'; echo "John Smith" | sed -E 's/(\\w+) (\\w+)/\\2, \\1/'` },
  { name: 'sed print delete', src: 'seq 1 6 > s.txt; sed -n "2,4p" s.txt; sed "3d" s.txt | tr "\\n" " "; echo; sed -n "/5/p" s.txt; sed "$d" s.txt | tail -1; sed -n "$=" s.txt' },
  { name: 'sed addresses', src: 'printf "a\\nstart\\nb\\nend\\nc\\n" > f.txt; sed -n "/start/,/end/p" f.txt; sed "/start/,/end/d" f.txt; sed -n "/start/!p" f.txt' },
  { name: 'sed in-place', src: 'echo "PermitRootLogin yes" > sshd_config; sed -i "s/^PermitRootLogin yes/PermitRootLogin no/" sshd_config; cat sshd_config' },
  { name: 'sed misc', src: 'echo "abc" | sed "y/abc/xyz/"; printf "1\\n2\\n" | sed "a\\\\--"; echo hi | sed "s/.*/[&]/"; echo "a b" | sed -e "s/a/1/" -e "s/b/2/"; printf "l1\\nl2\\nl3\\n" | sed "1!G;h;$!d"' },

  // ---- misc tools
  { name: 'seq', src: 'seq 3; seq 2 5; seq 0 5 20; seq -s, 1 4; seq -w 8 11; seq 5 -2 1' },
  { name: 'basename dirname', src: 'basename /var/log/auth.log; basename /var/log/auth.log .log; dirname /var/log/auth.log; dirname file; basename /' },
  { name: 'tee', src: 'echo data | tee copy.txt | tr a-z A-Z; cat copy.txt; echo more | tee -a copy.txt > /dev/null; cat copy.txt' },
  { name: 'xargs', src: 'printf "a\\nb\\nc\\n" | xargs echo; printf "1 2 3 4\\n" | xargs -n 2 echo; printf "x\\ny\\n" | xargs -I {} echo "item {}"' },
  { name: 'base64', src: 'echo "attack at dawn" | base64; echo "YXR0YWNrIGF0IGRhd24K" | base64 -d; printf "hi" | base64' },
  { name: 'hashes', src: 'echo -n "password" | md5sum; echo -n "password" | sha256sum; echo hello > f.txt; sha1sum f.txt; sha256sum f.txt > sums; sha256sum -c sums' },
  { name: 'diff', src: 'printf "a\\nb\\nc\\n" > 1.txt; printf "a\\nB\\nc\\nd\\n" > 2.txt; diff 1.txt 2.txt; echo "rc=$?"; diff 1.txt 1.txt; echo "rc=$?"' },
  { name: 'comm paste rev', src: 'printf "a\\nb\\nc\\n" > x; printf "b\\nc\\nd\\n" > y; comm x y; comm -12 x y; paste x y; paste -sd, x; echo stressed | rev' },
  { name: 'nl column', src: 'printf "a\\n\\nb\\n" | nl; printf "x\\ny\\n" | nl -ba' },
  { name: 'expr', src: 'expr 3 + 4; expr 10 \\* 2; expr length "hello"; expr substr "abcdef" 2 3; expr 5 \\> 3; expr "abc123" : "[a-z]*"' },
  { name: 'find', src: 'mkdir -p logs/old; touch logs/a.log logs/b.txt logs/old/c.log; find logs -name "*.log" | sort; find logs -type d | sort; find . -name "*.txt"' },
  { name: 'find exec', src: 'mkdir -p d; echo 1 > d/x.log; echo 22 > d/y.log; find d -name "*.log" -exec wc -c {} \\; | sort' },
  { name: 'mkdir cp mv rm', src: 'mkdir -p a/b; echo hi > a/b/f; cp a/b/f g; mv g h; cp -r a c; ls c/b; rm h; ls; rm -r a c; ls' },
  { name: 'tac fold', src: 'printf "1\\n2\\n3\\n" | tac; echo abcdefghij | fold -w 3' },
  { name: 'date format', src: 'date -d "2026-03-14 09:12:00" +"%Y/%m/%d %H:%M %a %b %j"; date -d @0 +%F; date -d "2026-03-14" +%s' },
  { name: 'type and command', src: 'type cd; type -t ls; command -v echo; f() { :; }; type -t f' },
  { name: 'nounset', src: 'set -u; echo start; echo "$undefined_var"; echo after' },
  { name: 'unclosed quote error', src: 'echo "unclosed' },
  { name: 'syntax error late', src: 'echo first\nif true; then\necho second\nfi fi' },
  { name: 'read without newline', src: 'printf "a\\nb" | while read line; do echo "got $line"; done; printf "a\\nb" | while read line || [ -n "$line" ]; do echo "got $line"; done' },
  { name: 'case fallthrough', src: 'x=b; case $x in a) echo a;; b) echo b;& c) echo c;; d) echo d;; esac' },
  { name: 'arith errors', src: 'echo $(( 1 / 0 )); echo next; x=08; echo $(( x + 1 ))' },
  { name: 'test errors', src: 'x=; [ $x == foo ] && echo y; echo "rc=$?"; [ abc -eq 1 ]; echo "rc=$?"' },
  { name: 'ansi-c quotes', src: "echo $'tab\\there'; echo $'line1\\nline2'; s=$'a\\x41b'; echo \"$s\"" },
  { name: 'string length unicode', src: 's="héllo"; echo ${#s}; echo "$s" | wc -c' },
  { name: 'IFS default restore', src: 'old=$IFS; IFS=:; read -r a b <<< "x:y"; IFS=$old; echo "$a $b"; set -- p q r; IFS=-; echo "$*"; unset IFS; echo "$*"' },
  { name: 'here-doc in loop', src: 'for i in 1 2; do cat <<EOF\nitem $i\nEOF\ndone' },
  { name: 'command grouping exit', src: 'f() { echo in; return 2; echo never; }; f || echo "failed with $?"' },
  { name: 'quoted special chars', src: `echo "a\\"b" 'c"d' "e\\$f" "g\\\\h" 'i\\j'` },
];
