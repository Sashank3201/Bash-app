// "Explain this command": break a command line into pieces and say what each does.

import type { Node, Redir, Word } from '../shell/ast';
import { parse } from '../shell/parser';
import { lookupRef } from '../content/reference';

export type PartKind = 'command' | 'option' | 'argument' | 'operator' | 'redirect' | 'keyword' | 'assignment';

export interface ExplainPart {
  text: string;
  kind: PartKind;
  explain: string;
}

const REDIR: Record<string, string> = {
  '>': 'Send the output into this file (replacing what was there).',
  '>>': 'Append the output to the end of this file.',
  '<': 'Feed this file in as the command’s input.',
  '2>': 'Send error messages into this file.',
  '2>>': 'Append error messages to this file.',
  '2>&1': 'Send errors to the same place as normal output.',
  '&>': 'Send both output and errors into this file.',
  '<<': 'Here-document: the following lines become the input.',
  '<<-': 'Here-document (leading tabs stripped).',
  '<<<': 'Here-string: this text becomes the input.',
  '>&2': 'Print to the error stream instead of normal output.',
};

function argExplain(w: Word): string {
  const raw = w.raw;
  if (w.parts.some((p) => p.t === 'cmd')) return 'Command substitution — replaced by the output of the command inside $( ).';
  if (w.parts.some((p) => p.t === 'arith')) return 'Arithmetic — replaced by the result of the calculation.';
  if (/^["']/.test(raw) && raw.length > 1) {
    if (raw.startsWith("'")) return 'Single quotes: taken literally, exactly as written, as one argument.';
    return w.parts.some((p) => p.t === 'dq' && p.parts.some((x) => x.t !== 'q')) ? 'Double quotes: one argument, with $variables expanded inside.' : 'Double quotes: kept together as one argument.';
  }
  if (w.parts.some((p) => p.t === 'param')) return 'A variable — replaced by its value. (Tip: quote it like "$var" so spaces don’t split it.)';
  if (/[*?[]/.test(raw) && !/^-/.test(raw)) return 'A glob pattern — bash expands it to the matching file names before the command runs.';
  if (/^\{.*\}$/.test(raw) || /\{[^}]*,[^}]*\}/.test(raw)) return 'Brace expansion — generates several words.';
  if (raw.startsWith('~')) return 'A path in your home directory (~ means /home/analyst).';
  if (raw.startsWith('/')) return 'An absolute path (starts from the root, /).';
  if (raw.includes('/')) return 'A relative path (starts from the current directory).';
  if (/^\d+$/.test(raw)) return 'A number argument.';
  return 'An argument — what the command should work on.';
}

function optionExplain(cmd: string, opt: string, next?: string): string {
  const ref = lookupRef(cmd);
  if (ref) {
    const exact = ref.options.find(([k]) => k.split(/[ ,/]/).includes(opt));
    if (exact) return exact[1];
    const pref = ref.options.find(([k]) => k.startsWith(opt + ' ') || k.startsWith(opt + '|'));
    if (pref) return pref[1];
    // combined short flags like -la
    if (/^-[A-Za-z]{2,}$/.test(opt)) {
      const bits = [...opt.slice(1)].map((c) => {
        const o = ref.options.find(([k]) => k.split(/[ ,/]/).includes('-' + c));
        return o ? `-${c}: ${o[1]}` : `-${c}`;
      });
      return 'Several options combined. ' + bits.join(' · ');
    }
  }
  void next;
  return 'An option that changes how the command behaves.';
}

function simpleParts(n: Node & { type: 'simple' }, out: ExplainPart[]) {
  for (const a of n.assigns) {
    out.push({ text: `${a.name}${a.append ? '+=' : '='}${a.value?.raw ?? '(…)'}`, kind: 'assignment', explain: `Sets the variable ${a.name}. (No spaces around = !)` });
  }
  let cmd = '';
  n.words.forEach((w, i) => {
    if (i === 0) {
      cmd = w.raw;
      const ref = lookupRef(cmd);
      let text = ref?.summary ?? (cmd.startsWith('./') || cmd.includes('/') ? 'Runs the program or script at this path.' : 'A command (program or builtin) to run.');
      if (cmd === 'sudo') text = 'Run the following command as root (administrator).';
      out.push({ text: cmd, kind: 'command', explain: text });
      return;
    }
    if (cmd === 'sudo' && i === 1) {
      const ref = lookupRef(w.raw);
      cmd = w.raw;
      out.push({ text: w.raw, kind: 'command', explain: ref?.summary ?? 'The command to run as root.' });
      return;
    }
    if (/^-{1,2}[A-Za-z]/.test(w.raw) && !/^-\d/.test(w.raw)) {
      out.push({ text: w.raw, kind: 'option', explain: optionExplain(cmd, w.raw, n.words[i + 1]?.raw) });
    } else {
      // awk/sed program text
      if ((cmd === 'awk' || cmd === 'sed') && /^'/.test(w.raw)) {
        out.push({ text: w.raw, kind: 'argument', explain: cmd === 'awk' ? 'The awk program: PATTERN { ACTION } run on every line.' : 'The sed script — e.g. s/old/new/ replaces text.' });
      } else if (cmd === 'grep' && i === n.words.findIndex((x, k) => k > 0 && !x.raw.startsWith('-'))) {
        out.push({ text: w.raw, kind: 'argument', explain: 'The pattern grep searches for (a regular expression).' });
      } else out.push({ text: w.raw, kind: 'argument', explain: argExplain(w) });
    }
  });
  n.redirs.forEach((r) => out.push(redirPart(r)));
}

function redirPart(r: Redir): ExplainPart {
  const op = (r.fd !== undefined ? String(r.fd) : '') + r.op;
  const key = op === '2>&' ? `2>&${r.target.raw}` : op === '>&' && r.target.raw === '2' ? '>&2' : op;
  const text = r.op === '<<' || r.op === '<<-' ? `${op} ${r.target.raw}` : r.op === '>&' ? `${op}${r.target.raw}` : `${op} ${r.target.raw}`;
  return { text, kind: 'redirect', explain: REDIR[key] ?? REDIR[op] ?? 'A redirection: changes where input or output goes.' };
}

function walk(n: Node, out: ExplainPart[]) {
  switch (n.type) {
    case 'list':
      n.items.forEach((it, i) => {
        walk(it.node, out);
        if (i < n.items.length - 1) out.push({ text: ';', kind: 'operator', explain: 'Run the next command after this one finishes, no matter what.' });
        if (it.bg) out.push({ text: '&', kind: 'operator', explain: 'Run in the background.' });
      });
      break;
    case 'simple':
      simpleParts(n, out);
      break;
    case 'pipeline':
      if (n.negate) out.push({ text: '!', kind: 'operator', explain: 'Invert the exit status (success ↔ failure).' });
      n.cmds.forEach((c, i) => {
        if (i) out.push({ text: '|', kind: 'operator', explain: 'Pipe: the output of the command on the left becomes the input of the one on the right.' });
        walk(c, out);
      });
      break;
    case 'andor':
      walk(n.first, out);
      for (const r of n.rest) {
        out.push({ text: r.op, kind: 'operator', explain: r.op === '&&' ? 'AND: run the next command only if the previous one succeeded.' : 'OR: run the next command only if the previous one failed.' });
        walk(r.node, out);
      }
      break;
    case 'if':
      out.push({ text: 'if … then … fi', kind: 'keyword', explain: 'Run the body only when the condition command succeeds (exit status 0).' });
      n.clauses.forEach((c) => {
        walk(c.cond, out);
        walk(c.body, out);
      });
      if (n.else) walk(n.else, out);
      break;
    case 'for':
      out.push({ text: `for ${n.name} in …`, kind: 'keyword', explain: `Loop: set $${n.name} to each item in turn and run the body.` });
      walk(n.body, out);
      break;
    case 'cfor':
      out.push({ text: `for ((${n.init}; ${n.cond}; ${n.step}))`, kind: 'keyword', explain: 'C-style loop: start; keep going while the condition holds; step.' });
      walk(n.body, out);
      break;
    case 'while':
      out.push({ text: n.until ? 'until … do … done' : 'while … do … done', kind: 'keyword', explain: n.until ? 'Repeat the body until the condition succeeds.' : 'Repeat the body as long as the condition succeeds.' });
      walk(n.cond, out);
      walk(n.body, out);
      break;
    case 'case':
      out.push({ text: `case ${n.word.raw} in`, kind: 'keyword', explain: 'Compare the value against each pattern and run the first branch that matches.' });
      break;
    case 'func':
      out.push({ text: `${n.name}()`, kind: 'keyword', explain: `Defines a function called ${n.name} — a named, reusable block of commands.` });
      walk(n.body, out);
      break;
    case 'group':
      walk(n.body, out);
      break;
    case 'subshell':
      out.push({ text: '( … )', kind: 'keyword', explain: 'Subshell: run these commands in a separate copy of the shell.' });
      walk(n.body, out);
      break;
    case 'cond':
      out.push({ text: '[[ … ]]', kind: 'keyword', explain: 'A test: succeeds when the condition inside is true.' });
      break;
    case 'arith':
      out.push({ text: `(( ${n.expr.trim()} ))`, kind: 'keyword', explain: 'Arithmetic: calculate (and succeed if the result is non-zero).' });
      break;
  }
}

export function explain(src: string): { parts: ExplainPart[]; error?: string } {
  try {
    const prog = parse(src.trim());
    const parts: ExplainPart[] = [];
    walk(prog, parts);
    return { parts };
  } catch (e) {
    return { parts: [], error: e instanceof Error ? e.message : String(e) };
  }
}
