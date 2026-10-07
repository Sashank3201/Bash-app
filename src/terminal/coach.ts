// "Mara's tip" — friendly explanations for the mistakes beginners actually make.

import { BUILTINS } from '../shell/builtins';
import { COMMANDS } from '../shell/commands/registry';

function lev(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

function closestCommand(name: string): string | null {
  const all = [...Object.keys(COMMANDS), ...Object.keys(BUILTINS)];
  let best: string | null = null;
  let bestD = 3;
  for (const c of all) {
    const d = lev(name.toLowerCase(), c);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best && best !== name ? best : null;
}

export function coachHint(src: string, stderr: string, status: number): string | null {
  const err = stderr;
  const trimmed = src.trim();

  let m = /([^\s:]+): command not found/.exec(err);
  if (m) {
    const name = m[1];
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) && new RegExp(`(^|[;&|\\s])${name}\\s+=`).test(src)) {
      return `No spaces around \`=\` when you set a variable: write \`${name}=value\`, not \`${name} = value\`. With spaces, bash thinks \`${name}\` is a command.`;
    }
    if (/^[A-Z]/.test(name) && (COMMANDS[name.toLowerCase()] || BUILTINS[name.toLowerCase()])) {
      return `Commands are case-sensitive. Try \`${name.toLowerCase()}\` in lowercase.`;
    }
    if (/^\.\/|\//.test(name)) return null;
    const near = closestCommand(name);
    if (near) return `There's no command called \`${name}\`. Did you mean \`${near}\`?`;
    if (/^(nc|nmap|ping|curl|wget|ssh|telnet|python3?|perl|ruby|node|apt|apt-get|systemctl|docker)$/.test(name)) {
      return `\`${name}\` isn't part of this simulator — this course stays on the local machine. You can try it in the Real Linux Lab if it's installed there.`;
    }
    return `\`${name}\` isn't a command here. Check the spelling, or type \`help\` to see what's available.`;
  }
  if (/\[: missing `\]'/.test(err)) return 'The `[` test needs a space before the closing `]`, like `[ "$x" -gt 5 ]`. Brackets are separate words in bash.';
  if (/unary operator expected/.test(err)) return 'A variable in your `[ ]` test was empty, so bash saw a broken expression. Put quotes around variables: `[ "$x" == "yes" ]` — or use `[[ ]]`.';
  if (/integer expression expected/.test(err)) return '`-eq`, `-lt`, `-gt` and friends compare numbers only. For text use `=` or `!=`.';
  if (/too many arguments/.test(err) && /\[\s/.test(src)) return 'One of your variables contains spaces, so `[` got too many words. Quote it: `"$var"`.';
  if (/cd: too many arguments/.test(err)) return 'Folder names with spaces need quotes: `cd "my folder"`.';
  if (/Permission denied/.test(err)) {
    if (/^(\.\/|\/)\S+/.test(trimmed) || /bash: \.\//.test(err)) return 'To run a script directly it must be executable. Run `chmod +x yourscript.sh` first — or start it with `bash yourscript.sh`.';
    if (/^cd\b/.test(trimmed)) return 'You don\'t have execute (x) permission on that directory, so you can\'t enter it. Use `ls -ld` on it to see who can.';
    return 'Your user isn\'t allowed to do that. Check the file\'s permissions with `ls -l`. If it\'s a system file, an admin would use `sudo`.';
  }
  if (/No such file or directory/.test(err)) {
    if (/^cd\b/.test(trimmed)) return 'That folder isn\'t here. Use `ls` to see what exists, and remember names are case-sensitive. `pwd` shows where you are.';
    return 'That path doesn\'t exist from where you are. Check with `ls` (and `pwd` to see your location). Tab completion avoids typos.';
  }
  if (/Is a directory/.test(err)) return 'That\'s a directory, not a file. Use `ls` to look inside it, or `cd` to go into it.';
  if (/Not a directory/.test(err)) return 'Part of that path is a file, not a folder.';
  m = /syntax error near unexpected token `([^']+)'/.exec(err);
  if (m) {
    const tok = m[1];
    if (tok === 'fi' || tok === 'else' || tok === 'elif') return 'Bash expected `then` before this. An `if` needs: `if CONDITION; then ...; fi` — note the `;` (or a newline) before `then`.';
    if (tok === 'done') return 'Loops need `do` before the body: `for x in a b; do ...; done`.';
    if (tok === 'then' || tok === 'do') return 'Put a `;` or a newline before this keyword, e.g. `if [ -f x ]; then`.';
    if (tok === 'newline') return 'The line ended too early — something like `>` or `|` is missing what comes after it.';
    if (tok === '(' || tok === ')') return 'Parentheses have special meaning in bash. Quote them if you mean them literally: `"(text)"`.';
    return `Bash got confused at \`${tok}\`. Check for a missing \`;\`, quote, or keyword just before it.`;
  }
  if (/unexpected end of file/.test(err)) return 'Something was opened but never closed — a quote, `if` without `fi`, `do` without `done`, or `{` without `}`.';
  if (/unbound variable/.test(err)) return 'With `set -u`, using a variable that was never set is an error. Set it first, or give a default: `${name:-default}`.';
  if (/division by 0/.test(err)) return 'Dividing by zero is undefined. Check the value before you divide.';
  if (/value too great for base/.test(err)) return 'Numbers starting with 0 are read as octal (base 8), so `08` is invalid. Strip the zero or force base 10: `$((10#08))`.';
  if (/ambiguous redirect/.test(err)) return 'The file name after `>` came from a variable that was empty or had spaces. Quote it: `> "$file"`.';
  if (/bad substitution/.test(err)) return 'That `${...}` expression isn\'t valid. Check the braces and the operator inside them.';
  if (/[“”‘’]/.test(src)) return 'Your keyboard inserted curly “smart” quotes. Bash only understands straight quotes: " and \'.';
  if (status === 127) return null;
  return null;
}
