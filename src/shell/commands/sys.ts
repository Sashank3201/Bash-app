// System-ish commands backed by the simulated machine: date sleep id whoami uname ps who last crontab env which ...

import { InBuf, StringWriter } from '../io';
import { FsError } from '../vfs';
import { COMMANDS, readText, register, splitLines, type CmdCtx } from './registry';
import { defaultDate, parseDate, strftime } from './time';
import { BUILTINS } from '../builtins';

/** Read an optional simulation data file (e.g. /var/lib/sim/ps.txt). */
function simFile(c: CmdCtx, path: string): string | null {
  return c.vfs.tryRead(path);
}

// ------------------------------------------------------------------ date / sleep

register('date', async (c) => {
  let fmt: string | null = null;
  let when = c.vfs.now();
  const args = [...c.args];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('+')) fmt = a.slice(1);
    else if (a === '-d' || a === '--date') {
      const v = args[++i] ?? '';
      const t = parseDate(v, c.vfs.now());
      if (t === null) {
        c.err(`invalid date ‘${v}’`);
        return 1;
      }
      when = t;
    } else if (a.startsWith('--date=')) {
      const v = a.slice(7);
      const t = parseDate(v, c.vfs.now());
      if (t === null) {
        c.err(`invalid date ‘${v}’`);
        return 1;
      }
      when = t;
    } else if (a === '-u' || a === '--utc') {
      /* already UTC */
    } else if (a === '-I' || a === '--iso-8601') fmt = '%Y-%m-%d';
    else if (a === '-Iseconds') fmt = '%Y-%m-%dT%H:%M:%S+00:00';
    else if (a === '-R' || a === '--rfc-email') fmt = '%a, %d %b %Y %H:%M:%S +0000';
    else if (a === '-s' || a === '--set') {
      c.err('cannot set date: Operation not permitted');
      return 1;
    } else {
      c.err(`invalid date ‘${a}’`);
      return 1;
    }
  }
  c.stdout.write((fmt !== null ? strftime(when, fmt) : defaultDate(when)) + '\n');
  return 0;
});

register('sleep', async (c) => {
  if (!c.args.length) {
    c.err('missing operand');
    return 1;
  }
  let ms = 0;
  for (const a of c.args) {
    const m = /^(\d*\.?\d+)([smhd]?)$/.exec(a);
    if (!m) {
      c.err(`invalid time interval ‘${a}’`);
      return 1;
    }
    const mult = m[2] === 'm' ? 60 : m[2] === 'h' ? 3600 : m[2] === 'd' ? 86400 : 1;
    ms += Number(m[1]) * mult * 1000;
  }
  if (c.sh.fastSleep) return 0;
  await c.sh.sleep(Math.min(ms, 120000));
  return 0;
});

// ------------------------------------------------------------------ identity

function groupsOf(c: CmdCtx, user: string, gid: number): { gid: number; name: string }[] {
  const out = [{ gid, name: c.vfs.groupName(gid) }];
  for (const line of splitLines(c.vfs.tryRead('/etc/group') ?? '')) {
    const f = line.split(':');
    if (f.length >= 4 && f[3].split(',').includes(user) && Number(f[2]) !== gid) out.push({ gid: Number(f[2]), name: f[0] });
  }
  return out;
}

register('id', async (c) => {
  const flags = c.args.filter((a) => a.startsWith('-')).join('');
  const who = c.args.find((a) => !a.startsWith('-'));
  let uid = c.cred.uid;
  let gid = c.cred.gid;
  let name = c.vfs.userName(uid);
  if (who) {
    const u = c.vfs.userByName(who);
    if (!u) {
      c.err(`‘${who}’: no such user`);
      return 1;
    }
    uid = u.uid;
    gid = u.gid;
    name = u.name;
  }
  const groups = groupsOf(c, name, gid);
  if (flags.includes('u')) c.stdout.write((flags.includes('n') ? name : String(uid)) + '\n');
  else if (flags.includes('g') && !flags.includes('G')) c.stdout.write((flags.includes('n') ? c.vfs.groupName(gid) : String(gid)) + '\n');
  else if (flags.includes('G')) c.stdout.write(groups.map((g) => (flags.includes('n') ? g.name : g.gid)).join(' ') + '\n');
  else c.stdout.write(`uid=${uid}(${name}) gid=${gid}(${c.vfs.groupName(gid)}) groups=${groups.map((g) => `${g.gid}(${g.name})`).join(',')}\n`);
  return 0;
});

register('whoami', async (c) => {
  c.stdout.write(c.vfs.userName(c.cred.uid) + '\n');
  return 0;
});

register('groups', async (c) => {
  const user = c.args[0] ?? c.vfs.userName(c.cred.uid);
  const u = c.vfs.userByName(user);
  const gs = groupsOf(c, user, u?.gid ?? c.cred.gid).map((g) => g.name);
  c.stdout.write((c.args[0] ? `${user} : ` : '') + gs.join(' ') + '\n');
  return 0;
});

register('hostname', async (c) => {
  if (c.args.includes('-I') || c.args.includes('-i')) {
    c.stdout.write((simFile(c, '/var/lib/sim/ip.txt') ?? '10.20.0.15').trim() + ' \n');
    return 0;
  }
  c.stdout.write(c.sh.hostname + '\n');
  return 0;
});

register('uname', async (c) => {
  const f = c.args.join('');
  const parts = {
    s: 'Linux',
    n: c.sh.hostname,
    r: '6.8.0-45-generic',
    v: '#45-Ubuntu SMP PREEMPT_DYNAMIC Fri Aug 30 12:02:04 UTC 2024',
    m: 'x86_64',
    o: 'GNU/Linux',
  };
  let out: string[];
  if (f.includes('a')) out = [parts.s, parts.n, parts.r, parts.v, parts.m, parts.m, parts.m, parts.o];
  else {
    out = [];
    for (const k of ['s', 'n', 'r', 'v', 'm', 'o'] as const) if (f.includes(k)) out.push(parts[k]);
    if (!out.length) out = [parts.s];
  }
  c.stdout.write(out.join(' ') + '\n');
  return 0;
});

register('uptime', async (c) => {
  if (c.args.includes('-p')) {
    c.stdout.write('up 1 week, 5 days, 3 hours, 4 minutes\n');
    return 0;
  }
  c.stdout.write(` ${strftime(c.vfs.now(), '%H:%M:%S')} up 12 days,  3:04,  1 user,  load average: 0.08, 0.03, 0.01\n`);
  return 0;
});

register('nproc', async (c) => {
  c.stdout.write('2\n');
  return 0;
});
register('arch', async (c) => {
  c.stdout.write('x86_64\n');
  return 0;
});

register('free', async (c) => {
  const h = c.args.some((a) => a.includes('h'));
  c.stdout.write(
    h
      ? '               total        used        free      shared  buff/cache   available\nMem:           3.8Gi       1.1Gi       1.6Gi        12Mi       1.3Gi       2.5Gi\nSwap:          2.0Gi          0B       2.0Gi\n'
      : '               total        used        free      shared  buff/cache   available\nMem:         3986460     1153024     1679212       12288     1358408     2602356\nSwap:        2097148           0     2097148\n',
  );
  return 0;
});

// ------------------------------------------------------------------ processes & sessions

const DEFAULT_PS = `USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND
root           1  0.0  0.3 167744 13112 ?        Ss   Mar02   0:09 /sbin/init
root         412  0.0  0.2  15432  9020 ?        Ss   Mar02   0:00 /usr/sbin/sshd -D
root         418  0.0  0.1   9496  3012 ?        Ss   Mar02   0:00 /usr/sbin/cron -f
syslog       425  0.0  0.1 222400  5300 ?        Ssl  Mar02   0:02 /usr/sbin/rsyslogd -n
www-data     610  0.0  0.4 205616 17100 ?        S    Mar02   0:04 /usr/sbin/apache2 -k start
analyst     4242  0.0  0.1  10012  5100 pts/0    Ss   09:00   0:00 -bash
`;

function psTable(c: CmdCtx): string {
  return simFile(c, '/var/lib/sim/ps.txt') ?? DEFAULT_PS;
}

register('ps', async (c) => {
  const table = psTable(c);
  const lines = splitLines(table);
  const full = c.args.some((a) => /a|e|x|-ef/.test(a));
  if (!full) {
    c.stdout.write('    PID TTY          TIME CMD\n   4242 pts/0    00:00:00 bash\n   4301 pts/0    00:00:00 ps\n');
    return 0;
  }
  if (c.args.includes('-ef')) {
    let out = 'UID          PID    PPID  C STIME TTY          TIME CMD\n';
    for (const l of lines.slice(1)) {
      const f = l.trim().split(/\s+/);
      if (f.length < 11) continue;
      out += `${f[0].padEnd(8)} ${f[1].padStart(7)}       1  0 ${f[8].padEnd(5)} ${f[6].padEnd(8)} 00:00:00 ${f.slice(10).join(' ')}\n`;
    }
    c.stdout.write(out);
    return 0;
  }
  c.stdout.write(table.endsWith('\n') ? table : table + '\n');
  return 0;
});

register(['kill', 'pkill'], async (c) => {
  const pids = c.args.filter((a) => !a.startsWith('-'));
  if (!pids.length) {
    c.stderr.write('kill: usage: kill [-s sigspec | -n signum | -sigspec] pid | jobspec ...\n');
    return 2;
  }
  const path = '/var/lib/sim/ps.txt';
  let table = psTable(c);
  let status = 0;
  for (const p of pids) {
    const lines = splitLines(table);
    const idx = lines.findIndex((l, i) => i > 0 && (c.name === 'pkill' ? l.includes(p) : l.trim().split(/\s+/)[1] === p));
    if (idx < 0) {
      c.stderr.write(c.name === 'pkill' ? '' : `bash: kill: (${p}) - No such process\n`);
      status = 1;
      continue;
    }
    const owner = lines[idx].trim().split(/\s+/)[0];
    if (c.cred.uid !== 0 && owner !== c.vfs.userName(c.cred.uid)) {
      c.stderr.write(`bash: kill: (${p}) - Operation not permitted\n`);
      status = 1;
      continue;
    }
    lines.splice(idx, 1);
    table = lines.join('\n') + '\n';
  }
  try {
    if (c.vfs.exists('/var/lib/sim')) c.vfs.writeFile(path, table);
  } catch {}
  return status;
});

const DEFAULT_WHO = 'analyst  pts/0        2026-03-14 09:00 (10.20.0.5)\n';

register('who', async (c) => {
  if (c.args.includes('am') || c.args.includes('-m')) {
    c.stdout.write(splitLines(simFile(c, '/var/lib/sim/who.txt') ?? DEFAULT_WHO)[0] + '\n');
    return 0;
  }
  c.stdout.write(simFile(c, '/var/lib/sim/who.txt') ?? DEFAULT_WHO);
  return 0;
});

register('w', async (c) => {
  c.stdout.write(
    ` ${strftime(c.vfs.now(), '%H:%M:%S')} up 12 days,  3:04,  1 user,  load average: 0.08, 0.03, 0.01\nUSER     TTY      FROM             LOGIN@   IDLE   JCPU   PCPU WHAT\n` +
      splitLines(simFile(c, '/var/lib/sim/who.txt') ?? DEFAULT_WHO)
        .map((l) => {
          const f = l.split(/\s+/);
          return `${f[0].padEnd(8)} ${f[1].padEnd(8)} ${(f[4] ?? '').replace(/[()]/g, '').padEnd(16)} ${f[3]}    0.00s  0.02s  0.00s w`;
        })
        .join('\n') +
      '\n',
  );
  return 0;
});

register(['last', 'lastb'], async (c) => {
  const file = c.name === 'last' ? '/var/lib/sim/last.txt' : '/var/lib/sim/lastb.txt';
  const t = simFile(c, file);
  if (t === null) {
    if (c.name === 'lastb' && c.cred.uid !== 0) {
      c.stderr.write('lastb: /var/log/btmp: Permission denied\n');
      return 1;
    }
    c.stdout.write(`analyst  pts/0        10.20.0.5        Sat Mar 14 09:00   still logged in\n\nwtmp begins Mon Mar  2 08:12:44 2026\n`);
    return 0;
  }
  const n = c.args.find((a) => /^-\d+$/.test(a) || /^\d+$/.test(a));
  const lines = splitLines(t);
  const count = n ? Math.abs(Number(n)) : Infinity;
  c.stdout.write(lines.slice(0, count).join('\n') + '\n');
  return 0;
});

// ------------------------------------------------------------------ cron

register('crontab', async (c) => {
  let user = c.vfs.userName(c.cred.uid);
  const args = [...c.args];
  const ui = args.indexOf('-u');
  if (ui >= 0) {
    if (c.cred.uid !== 0 && args[ui + 1] !== user) {
      c.stderr.write('must be privileged to use -u\n');
      return 1;
    }
    user = args[ui + 1];
    args.splice(ui, 2);
  }
  const path = `/var/spool/cron/crontabs/${user}`;
  if (args.includes('-l')) {
    const t = c.vfs.tryRead(path);
    if (t === null) {
      c.stderr.write(`no crontab for ${user}\n`);
      return 1;
    }
    c.stdout.write(t);
    return 0;
  }
  if (args.includes('-r')) {
    try {
      c.vfs.remove(path);
    } catch {
      c.stderr.write(`no crontab for ${user}\n`);
      return 1;
    }
    return 0;
  }
  if (args.includes('-e')) {
    if (!c.vfs.exists('/var/spool/cron/crontabs')) c.vfs.mkdir('/var/spool/cron/crontabs', { parents: true });
    if (!c.vfs.exists(path)) c.vfs.writeFile(path, '# m h  dom mon dow   command\n', { mode: 0o600, cred: { uid: c.vfs.userByName(user)?.uid ?? c.cred.uid, gid: c.cred.gid } });
    if (c.sh.host.openEditor) {
      await c.sh.host.openEditor(path);
      c.stderr.write('crontab: installing new crontab\n');
      return 0;
    }
    c.stderr.write('crontab: no editor available here\n');
    return 1;
  }
  const file = args.find((a) => !a.startsWith('-'));
  if (file) {
    const t = await readText(c, file);
    if (t === null) return 1;
    if (!c.vfs.exists('/var/spool/cron/crontabs')) c.vfs.mkdir('/var/spool/cron/crontabs', { parents: true });
    c.vfs.writeFile(path, t, { mode: 0o600 });
    return 0;
  }
  c.stderr.write('usage: crontab [-u user] [-l | -r | -e] [file]\n');
  return 1;
});

// ------------------------------------------------------------------ environment & lookup

register(['env', 'printenv'], async (c) => {
  const args = [...c.args];
  if (c.name === 'printenv' && args.length) {
    const env = c.sh.exportedEnv();
    let st = 0;
    for (const a of args) {
      if (env[a] !== undefined) c.stdout.write(env[a] + '\n');
      else st = 1;
    }
    return st;
  }
  let clear = false;
  const assigns: [string, string][] = [];
  while (args.length) {
    if (args[0] === '-i' || args[0] === '-') {
      clear = true;
      args.shift();
    } else if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(args[0])) {
      const a = args.shift()!;
      const i = a.indexOf('=');
      assigns.push([a.slice(0, i), a.slice(i + 1)]);
    } else break;
  }
  if (!args.length) {
    const env = clear ? {} : c.sh.exportedEnv();
    for (const [k, v] of assigns) (env as Record<string, string>)[k] = v;
    c.stdout.write(Object.entries(env).map(([k, v]) => `${k}=${v}\n`).join(''));
    return 0;
  }
  const sub = c.sh.subshell();
  if (clear) for (const [k, v] of sub.vars) if (v.exported) sub.vars.delete(k);
  for (const [k, v] of assigns) sub.vars.set(k, { kind: 'scalar', value: v, exported: true });
  sub.funcs = new Map();
  return sub.invoke(args, { stdin: c.stdin, stdout: c.stdout, stderr: c.stderr });
});

register('which', async (c) => {
  let st = 0;
  const all = c.args.includes('-a');
  for (const n of c.args.filter((a) => !a.startsWith('-'))) {
    if (n.includes('/')) {
      if (c.vfs.tryLookup(c.abs(n))) c.stdout.write(n + '\n');
      else st = 1;
      continue;
    }
    const found: string[] = [];
    const p = c.sh.findInPath(n);
    if (p) found.push(p);
    if (COMMANDS[n] || ['bash', 'sh', 'sudo', 'su', 'kill', 'test', '[', 'echo', 'printf', 'pwd', 'true', 'false', 'time'].includes(n)) {
      const dir = ['sudo'].includes(n) ? '/usr/bin' : ['bash', 'sh'].includes(n) ? '/usr/bin' : '/usr/bin';
      found.push(`${dir}/${n}`);
    }
    if (!found.length) st = 1;
    else c.stdout.write((all ? found : found.slice(0, 1)).join('\n') + '\n');
  }
  return st;
});

register('getent', async (c) => {
  const [db, ...keys] = c.args;
  const file = db === 'passwd' ? '/etc/passwd' : db === 'group' ? '/etc/group' : db === 'hosts' ? '/etc/hosts' : null;
  if (!file) {
    c.stderr.write(`Unknown database: ${db ?? ''}\n`);
    return 1;
  }
  const lines = splitLines(c.vfs.tryRead(file) ?? '');
  if (!keys.length) {
    c.stdout.write(lines.map((l) => l + '\n').join(''));
    return 0;
  }
  let st = 0;
  for (const k of keys) {
    const l = lines.find((x) => (db === 'hosts' ? x.split(/\s+/).includes(k) : x.split(':')[0] === k || x.split(':')[2] === k));
    if (l) c.stdout.write(l + '\n');
    else st = 2;
  }
  return st;
});

// ------------------------------------------------------------------ terminal & editors

register(['clear', 'reset'], async (c) => {
  if (c.sh.host.clear) c.sh.host.clear();
  else c.stdout.write('\x1b[H\x1b[2J');
  return 0;
});

register(['nano', 'vim', 'vi', 'edit', 'pico', 'code', 'emacs'], async (c) => {
  const file = c.args.find((a) => !a.startsWith('-') && !a.startsWith('+'));
  if (!file) {
    c.stderr.write(`${c.name}: give a file name, e.g. ${c.name} script.sh\n`);
    return 1;
  }
  if (!c.sh.host.openEditor) {
    c.stderr.write(`${c.name}: the editor is only available in the app's terminal\n`);
    return 1;
  }
  const abs = c.abs(file);
  const n = c.vfs.tryLookup(abs);
  if (n && n.type === 'dir') {
    c.err(`${file} is a directory`);
    return 1;
  }
  if (n && !c.vfs.can(n, c.cred, 'r')) {
    c.err(`${file}: Permission denied`);
    return 1;
  }
  await c.sh.host.openEditor(abs);
  return 0;
});

register('man', async (c) => {
  const topic = c.args.filter((a) => !a.startsWith('-')).pop();
  if (!topic) {
    c.stderr.write('What manual page do you want?\nFor example, try \'man ls\'.\n');
    return 1;
  }
  if (c.sh.host.openManual?.(topic)) return 0;
  c.stderr.write(`No manual entry for ${topic}\n`);
  return 16;
});

register('tput', async (c) => {
  const [cap, arg] = c.args;
  const colors: Record<string, string> = { setaf: '3', setab: '4' };
  switch (cap) {
    case 'setaf':
    case 'setab': {
      const n = Number(arg ?? 0);
      c.stdout.write(n < 8 ? `\x1b[${colors[cap]}${n}m` : `\x1b[${cap === 'setaf' ? 38 : 48};5;${n}m`);
      return 0;
    }
    case 'sgr0':
      c.stdout.write('\x1b(B\x1b[m');
      return 0;
    case 'bold':
      c.stdout.write('\x1b[1m');
      return 0;
    case 'dim':
      c.stdout.write('\x1b[2m');
      return 0;
    case 'smul':
      c.stdout.write('\x1b[4m');
      return 0;
    case 'rev':
      c.stdout.write('\x1b[7m');
      return 0;
    case 'cols':
      c.stdout.write(String(c.sh.host.cols?.() ?? 80) + '\n');
      return 0;
    case 'lines':
      c.stdout.write('24\n');
      return 0;
    case 'colors':
      c.stdout.write('256\n');
      return 0;
    case 'clear':
      c.stdout.write('\x1b[H\x1b[2J');
      return 0;
  }
  c.stderr.write(`tput: unknown terminfo capability '${cap ?? ''}'\n`);
  return 4;
});

// ------------------------------------------------------------------ networking (local view only)

const DEFAULT_LISTEN = `Netid State  Recv-Q Send-Q Local Address:Port  Peer Address:Port Process
tcp   LISTEN 0      128          0.0.0.0:22         0.0.0.0:*
tcp   LISTEN 0      511          0.0.0.0:80         0.0.0.0:*
tcp   LISTEN 0      4096   127.0.0.53%lo:53         0.0.0.0:*
`;

register(['ss', 'netstat'], async (c) => {
  c.stdout.write(simFile(c, '/var/lib/sim/listening.txt') ?? DEFAULT_LISTEN);
  return 0;
});

// ------------------------------------------------------------------ bc

register('bc', async (c) => {
  const file = c.args.find((a) => !a.startsWith('-'));
  const mathLib = c.args.includes('-l');
  const src = file ? await readText(c, file) : await c.stdin.readAll();
  if (src === null) return 1;
  let scale = mathLib ? 20 : 0;
  const vars = new Map<string, number>();
  let out = '';
  const fmt = (v: number) => {
    let s: string;
    if (scale === 0) s = String(Math.trunc(v));
    else {
      const f = Math.trunc(v * 10 ** scale) / 10 ** scale;
      s = f.toFixed(scale);
      if (/\.\d+$/.test(s) && Number.isInteger(v) && !/[./]/.test(lastExpr)) s = String(v);
    }
    if (s.startsWith('0.')) s = s.slice(1);
    else if (s.startsWith('-0.')) s = '-' + s.slice(2);
    return s;
  };
  let lastExpr = '';
  const evalExpr = (e: string): number => {
    let i = 0;
    const ws = () => {
      while (e[i] === ' ' || e[i] === '\t') i++;
    };
    const prim = (): number => {
      ws();
      if (e[i] === '(') {
        i++;
        const v = add();
        ws();
        i++;
        return v;
      }
      if (e[i] === '-') {
        i++;
        return -prim();
      }
      const m = /^(\d*\.?\d+|\d+\.)/.exec(e.slice(i));
      if (m) {
        i += m[0].length;
        return parseFloat(m[0]);
      }
      const n = /^[a-z_][a-z0-9_]*/.exec(e.slice(i));
      if (n) {
        i += n[0].length;
        ws();
        if (e[i] === '(') {
          i++;
          const arg = add();
          ws();
          i++;
          if (n[0] === 'sqrt') return Math.sqrt(arg);
          if (n[0] === 's') return Math.sin(arg);
          if (n[0] === 'c') return Math.cos(arg);
          if (n[0] === 'l') return Math.log(arg);
          if (n[0] === 'e') return Math.exp(arg);
          if (n[0] === 'length') return String(Math.trunc(Math.abs(arg))).length;
          return 0;
        }
        if (n[0] === 'scale') return scale;
        return vars.get(n[0]) ?? 0;
      }
      throw new Error('syntax error');
    };
    const pow = (): number => {
      const b = prim();
      ws();
      if (e[i] === '^') {
        i++;
        return b ** pow();
      }
      return b;
    };
    const mul = (): number => {
      let v = pow();
      for (;;) {
        ws();
        const op = e[i];
        if (op !== '*' && op !== '/' && op !== '%') return v;
        i++;
        const r = pow();
        if (op === '*') v = v * r;
        else if (op === '/') {
          if (r === 0) throw new Error('Divide by zero');
          v = scale === 0 ? Math.trunc(v / r) : Math.trunc((v / r) * 10 ** scale) / 10 ** scale;
        } else v = v % r;
      }
    };
    const add = (): number => {
      let v = mul();
      for (;;) {
        ws();
        const op = e[i];
        if (op !== '+' && op !== '-') return v;
        i++;
        const r = mul();
        v = op === '+' ? v + r : v - r;
      }
    };
    const v = add();
    ws();
    if (i < e.length) throw new Error('syntax error');
    return v;
  };
  for (const stmt of src.split(/[;\n]/)) {
    const s = stmt.trim();
    if (!s || s.startsWith('#') || s === 'quit') continue;
    try {
      const am = /^([a-z_][a-z0-9_]*)\s*=\s*(.+)$/.exec(s);
      if (am) {
        const v = evalExpr(am[2]);
        if (am[1] === 'scale') scale = Math.max(0, Math.trunc(v));
        else vars.set(am[1], v);
        continue;
      }
      lastExpr = s;
      out += fmt(evalExpr(s)) + '\n';
    } catch (e) {
      out += '';
      c.stderr.write(`(standard_in) 1: ${e instanceof Error ? e.message : e}\n`);
    }
  }
  c.stdout.write(out);
  return 0;
});

// `systemctl` — read-only view for auditing lessons
register('systemctl', async (c) => {
  const t = simFile(c, '/var/lib/sim/services.txt');
  const sub = c.args.find((a) => !a.startsWith('-')) ?? 'list-units';
  if (sub === 'list-units' || sub === 'list-unit-files') {
    c.stdout.write(t ?? '  UNIT                 LOAD   ACTIVE SUB     DESCRIPTION\n  cron.service         loaded active running Regular background program processing daemon\n  ssh.service          loaded active running OpenBSD Secure Shell server\n  apache2.service      loaded active running The Apache HTTP Server\n');
    return 0;
  }
  if (sub === 'status') {
    const name = c.args[c.args.indexOf('status') + 1] ?? '';
    c.stdout.write(`● ${name}.service\n     Loaded: loaded\n     Active: active (running)\n`);
    return 0;
  }
  c.stderr.write(`systemctl: '${sub}' is read-only in the simulator\n`);
  return 1;
});

export { InBuf, StringWriter, FsError, BUILTINS };
