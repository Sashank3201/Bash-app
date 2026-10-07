// Time helpers. The simulated machine runs in UTC so outputs are identical everywhere.

import { DAYS, MONTHS } from './registry';

const FULL_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const FULL_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const p2 = (n: number) => String(n).padStart(2, '0');

export function strftime(ms: number, fmt: string): string {
  const d = new Date(ms);
  const Y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  const H = d.getUTCHours();
  const M = d.getUTCMinutes();
  const S = d.getUTCSeconds();
  const wd = d.getUTCDay();
  const startOfYear = Date.UTC(Y, 0, 1);
  const yday = Math.floor((ms - startOfYear) / 86400000) + 1;
  let out = '';
  for (let i = 0; i < fmt.length; i++) {
    const c = fmt[i];
    if (c !== '%' || i === fmt.length - 1) {
      out += c;
      continue;
    }
    let f = fmt[++i];
    let padMode: '' | '-' | '_' | '0' = '';
    if (f === '-' || f === '_' || f === '0') {
      padMode = f;
      f = fmt[++i];
    }
    const num = (n: number, w = 2) => (padMode === '-' ? String(n) : padMode === '_' ? String(n).padStart(w, ' ') : String(n).padStart(w, '0'));
    switch (f) {
      case 'Y': out += Y; break;
      case 'y': out += p2(Y % 100); break;
      case 'C': out += p2(Math.floor(Y / 100)); break;
      case 'm': out += num(m + 1); break;
      case 'd': out += num(day); break;
      case 'e': out += padMode ? num(day) : String(day).padStart(2, ' '); break;
      case 'H': out += num(H); break;
      case 'I': out += num(H % 12 || 12); break;
      case 'k': out += String(H).padStart(2, ' '); break;
      case 'l': out += String(H % 12 || 12).padStart(2, ' '); break;
      case 'M': out += num(M); break;
      case 'S': out += num(S); break;
      case 'N': out += String(d.getUTCMilliseconds() * 1000000).padStart(9, '0'); break;
      case 'p': out += H < 12 ? 'AM' : 'PM'; break;
      case 'P': out += H < 12 ? 'am' : 'pm'; break;
      case 'a': out += DAYS[wd]; break;
      case 'A': out += FULL_DAYS[wd]; break;
      case 'b':
      case 'h': out += MONTHS[m]; break;
      case 'B': out += FULL_MONTHS[m]; break;
      case 'j': out += num(yday, 3); break;
      case 'u': out += wd === 0 ? 7 : wd; break;
      case 'w': out += wd; break;
      case 's': out += Math.floor(ms / 1000); break;
      case 'Z': out += 'UTC'; break;
      case 'z': out += '+0000'; break;
      case 'F': out += `${Y}-${p2(m + 1)}-${p2(day)}`; break;
      case 'T': out += `${p2(H)}:${p2(M)}:${p2(S)}`; break;
      case 'R': out += `${p2(H)}:${p2(M)}`; break;
      case 'D': out += `${p2(m + 1)}/${p2(day)}/${p2(Y % 100)}`; break;
      case 'c': out += `${DAYS[wd]} ${MONTHS[m]} ${String(day).padStart(2, ' ')} ${p2(H)}:${p2(M)}:${p2(S)} ${Y}`; break;
      case 'x': out += `${p2(m + 1)}/${p2(day)}/${p2(Y % 100)}`; break;
      case 'X': out += `${p2(H)}:${p2(M)}:${p2(S)}`; break;
      case 'n': out += '\n'; break;
      case 't': out += '\t'; break;
      case 'V': {
        const t = new Date(Date.UTC(Y, m, day));
        const dn = (t.getUTCDay() + 6) % 7;
        t.setUTCDate(t.getUTCDate() - dn + 3);
        const firstThu = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
        const wk = 1 + Math.round(((t.getTime() - firstThu.getTime()) / 86400000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
        out += num(wk);
        break;
      }
      case '%': out += '%'; break;
      default: out += '%' + f;
    }
  }
  return out;
}

/** The default `date` output, e.g. "Sat Mar 14 09:12:00 UTC 2026". */
export function defaultDate(ms: number): string {
  return strftime(ms, '%a %b %e %H:%M:%S %Z %Y');
}

/** Parse the subset of GNU `date -d` strings people actually use. Returns ms or null. */
export function parseDate(s: string, now: number): number | null {
  const t = s.trim();
  if (t === '' || t === 'now' || t === 'today') return now;
  if (t.startsWith('@')) {
    const n = Number(t.slice(1));
    return Number.isFinite(n) ? n * 1000 : null;
  }
  if (t === 'yesterday') return now - 86400000;
  if (t === 'tomorrow') return now + 86400000;
  let m = /^([+-]?\d+)\s*(second|sec|minute|min|hour|day|week|month|year)s?(\s+ago)?$/i.exec(t);
  if (m) {
    let n = Number(m[1]);
    if (m[3]) n = -n;
    const unit = m[2].toLowerCase();
    const mult: Record<string, number> = { second: 1e3, sec: 1e3, minute: 6e4, min: 6e4, hour: 36e5, day: 864e5, week: 6048e5 };
    if (unit === 'month' || unit === 'year') {
      const d = new Date(now);
      if (unit === 'month') d.setUTCMonth(d.getUTCMonth() + n);
      else d.setUTCFullYear(d.getUTCFullYear() + n);
      return d.getTime();
    }
    return now + n * mult[unit];
  }
  m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?\s*(Z|UTC)?$/.exec(t);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
  m = /^(\d{4})(\d{2})(\d{2})$/.exec(t);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]);
  // syslog style: "Mar 14 09:12:01" (assume the current year)
  m = /^([A-Z][a-z]{2})\s+(\d{1,2})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?(?:\s+(\d{4}))?$/.exec(t);
  if (m && MONTHS.includes(m[1])) {
    const y = m[6] ? +m[6] : new Date(now).getUTCFullYear();
    return Date.UTC(y, MONTHS.indexOf(m[1]), +m[2], +(m[3] ?? 0), +(m[4] ?? 0), +(m[5] ?? 0));
  }
  // "14/Mar/2026:09:12:01" (Apache) and "14 Mar 2026"
  m = /^(\d{1,2})[/ ]([A-Z][a-z]{2})[/ ](\d{4})(?::(\d{2}):(\d{2}):(\d{2}))?/.exec(t);
  if (m && MONTHS.includes(m[2])) return Date.UTC(+m[3], MONTHS.indexOf(m[2]), +m[1], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
  m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(t);
  if (m) {
    const d = new Date(now);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), +m[1], +m[2], +(m[3] ?? 0));
  }
  const fallback = Date.parse(t);
  return Number.isNaN(fallback) ? null : fallback;
}

/** ls -l style timestamp. */
export function lsTime(ms: number, now: number): string {
  const d = new Date(ms);
  const sixMonths = 182.5 * 86400000;
  const recent = ms <= now + 3600000 && now - ms < sixMonths;
  const date = `${MONTHS[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2, ' ')}`;
  return recent ? `${date} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}` : `${date}  ${d.getUTCFullYear()}`;
}
