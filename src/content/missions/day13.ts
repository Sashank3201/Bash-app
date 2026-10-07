import { defineFixture } from '../fixtures';
import { home } from '../fixtures/base';
import type { Mission } from '../types';

// A fictional phishing email. All domains use reserved .example names and documentation IP ranges.
export const PHISH_EMAIL = `Return-Path: <billing@northw1nd-secure.example>
Received: from mail.northw1nd-secure.example (mail.northw1nd-secure.example [198.51.100.77])
	by mx1.halden.example with ESMTP id 4F2A1C; Fri, 13 Mar 2026 22:41:07 +0000
Received: from [10.8.0.14] (unknown [203.0.113.45])
	by mail.northw1nd-secure.example with ESMTPSA; Fri, 13 Mar 2026 22:41:05 +0000
From: "Northwind Bank Security" <security@northw1nd-secure.example>
Reply-To: refunds-desk@mailbox.example
To: mara@halden.example
Subject: Action required: unusual sign-in detected
Date: Fri, 13 Mar 2026 22:41:03 +0000
Message-ID: <20260313224103.7731@northw1nd-secure.example>
X-Mailer: PHPMailer 6.1.6
X-Originating-IP: [203.0.113.45]
Content-Type: text/html; charset=UTF-8

<p>Dear customer,</p>
<p>We noticed a sign-in to your account from a new device (IP 192.0.2.200).</p>
<p>If this wasn't you, verify your identity within 24 hours:</p>
<p><a href="http://northw1nd-secure.example/verify?id=88213">Verify my account</a></p>
<p>Your security report is attached, or download it here:
<a href="https://files.cdn-share.example/r/report-88213.zip">report-88213.zip</a></p>
<p>Questions? Contact support@northw1nd-secure.example or track your case at
http://track.northw1nd-secure.example/case/88213</p>
<p>Northwind Bank Security Team</p>
<!-- build 5d41402abc4b2a76b9719d911017c592 -->
`;

defineFixture('day13', (vfs) => {
  home(vfs, 'phish/email.eml', PHISH_EMAIL);
});

export const day13: Mission = {
  day: 13,
  week: 2,
  title: 'Patterns',
  topic: 'Regular expressions & IOC extraction',
  minutes: 45,
  fixture: 'day13',
  briefing: `Mara forwarded you an email this morning, with one line: *“Pull the IOCs before anyone clicks anything.”*

**IOCs** — indicators of compromise — are the fingerprints an attack leaves: IP addresses, domains, URLs, email addresses, file hashes. Once you have them, we can block them, search other mailboxes for them and share them with partners.

You can’t \`grep\` for an IP you don’t know yet. You need to describe what an IP **looks like**. That’s what **regular expressions** do, and today they become your most-used security skill.`,
  objectives: ['Read and write extended regular expressions', 'Extract matches with grep -Eo', 'Pull IPs, URLs, emails and hashes out of messy text', 'Defang IOCs with sed and test strings with [[ =~ ]]'],
  lesson: [
    {
      kind: 'read',
      id: 'regex',
      title: 'Describing text',
      md: `A **regular expression** (regex) is a pattern that describes text. With \`grep -E\` (extended regex):

| Pattern | Matches |
|---|---|
| \`.\` | any one character |
| \`[0-9]\` \`[a-z]\` \`[A-Za-z0-9]\` | one character from a set |
| \`[^ ]\` | one character **not** in the set |
| \`*\` \`+\` \`?\` | the thing before it: 0+ times, 1+ times, optional |
| \`{3}\` \`{1,3}\` | exactly 3 times; 1 to 3 times |
| \`^\` \`$\` | start / end of the line |
| \`(a\\|b)\` | a or b, grouped |
| \`\\.\` | a literal dot |

\`grep -o\` prints **only the matching part**, one match per line — that’s how you extract.`,
    },
    {
      kind: 'widget',
      id: 'w-regex',
      md: 'Build an IPv4 pattern step by step. Start with `[0-9]+`, then try `[0-9]{1,3}\\.[0-9]{1,3}`, then the full `[0-9]{1,3}(\\.[0-9]{1,3}){3}`.',
      widget: 'regex',
      props: { regex: '[0-9]+', text: 'Received: from mail (mail [198.51.100.77])\nX-Mailer: PHPMailer 6.1.6\nsign-in from a new device (IP 192.0.2.200)\nMessage-ID: <20260313224103.7731@mail>' },
    },
    {
      kind: 'task',
      id: 'headers',
      md: 'Show the lines of `~/phish/email.eml` that **start with** `From:` or `Reply-To:`.',
      check: { output: 'reference', uses: ['grep'] },
      solution: "grep -E '^(From|Reply-To):' ~/phish/email.eml",
      hints: ['Anchor with `^` and group the choices: `^(From|Reply-To):`', "`grep -E '^(From|Reply-To):' FILE`"],
      explain: 'Red flag number one: replies go to a **different** domain from the sender. Real banks don’t do that.',
    },
    {
      kind: 'task',
      id: 'ips',
      md: 'Extract every **IPv4 address** in the email — unique and sorted.\n\n`grep -Eo \'[0-9]{1,3}(\\.[0-9]{1,3}){3}\' ~/phish/email.eml | sort -u`',
      check: { output: 'reference', uses: ['grep', 'sort'] },
      solution: "grep -Eo '[0-9]{1,3}(\\.[0-9]{1,3}){3}' ~/phish/email.eml | sort -u",
      hints: ['Copy the command — then read the regex: 1–3 digits, then three times (dot + 1–3 digits).'],
      explain: '`10.8.0.14` is a private address — the sender’s own laptop. `203.0.113.45` is where they really connected from, and `198.51.100.77` is their mail server.',
    },
    {
      kind: 'task',
      id: 'urls',
      md: 'Extract every **URL**: `http` or `https`, then `://`, then any run of characters that aren’t a space, quote or angle bracket. Unique and sorted.',
      check: { output: 'reference', uses: ['grep'] },
      solution: "grep -Eo 'https?://[^ \"<>]+' ~/phish/email.eml | sort -u",
      hints: ['`s?` makes the s optional.', "`[^ \"<>]+` — one or more characters that are not space, `\"`, `<` or `>`.", "`grep -Eo 'https?://[^ \"<>]+' FILE | sort -u`"],
    },
    {
      kind: 'task',
      id: 'emails',
      md: 'Extract every **email address**, unique and sorted. A simple, good-enough pattern:\n\n`[A-Za-z0-9._-]+@[A-Za-z0-9.-]+\\.[A-Za-z]+`',
      check: { output: 'reference', uses: ['grep'] },
      solution: "grep -Eo '[A-Za-z0-9._-]+@[A-Za-z0-9.-]+\\.[A-Za-z]+' ~/phish/email.eml | sort -u",
      hints: ["`grep -Eo 'PATTERN' ~/phish/email.eml | sort -u`"],
      explain: 'Did you spot the odd one out? The Message-ID looks like an address too. Regexes match **shapes**, not meaning, so always read your results.',
    },
    {
      kind: 'read',
      id: 'defang-read',
      title: 'Defanging',
      md: `Before you paste IOCs into a ticket or a chat, **defang** them so nobody clicks them by accident and no tool turns them into live links:

\`http://evil.example/x\` → \`hxxp://evil[.]example/x\`

\`sed\` can do both changes in one pass with two expressions:

\`\`\`bash
sed -e 's/^http/hxxp/' -e 's/\\./[.]/g'
\`\`\``,
    },
    {
      kind: 'task',
      id: 'defang',
      md: 'Extract the URLs again (unique, sorted) and **defang** them with that `sed`.',
      check: { output: 'reference', uses: ['grep', 'sed'] },
      solution: "grep -Eo 'https?://[^ \"<>]+' ~/phish/email.eml | sort -u | sed -e 's/^http/hxxp/' -e 's/\\./[.]/g'",
      hints: ['Press ↑ to get the URL command back, then add `| sed -e … -e …`.'],
    },
    {
      kind: 'task',
      id: 'domains',
      md: 'Which domains do the links point to, and how often? Extract `https?://` plus everything up to the next `/` or `"`, strip the scheme with `sed -E \'s#https?://##\'`, then count.',
      check: { output: 'reference', uses: ['grep', 'sed', 'uniq'] },
      solution: "grep -Eo 'https?://[^/\"]+' ~/phish/email.eml | sed -E 's#https?://##' | sort | uniq -c | sort -rn",
      hints: ["`grep -Eo 'https?://[^/\"]+'` stops at the first slash.", "`sed -E 's#https?://##'` — `#` works as the separator, so the slashes don’t need escaping."],
    },
    {
      kind: 'read',
      id: 'match',
      title: 'Testing a string: [[ =~ ]]',
      md: `Inside a script, \`[[ $var =~ REGEX ]]\` is true when the variable matches. Use it to **validate input** before you trust it:

\`\`\`bash
if [[ $ip =~ ^[0-9]{1,3}(\\.[0-9]{1,3}){3}$ ]]; then
  echo "looks like an IP"
fi
\`\`\`

Don’t quote the regex on the right-hand side, or bash treats it as plain text.`,
    },
    {
      kind: 'task',
      id: 'validate',
      md: 'Set `ip=203.0.113.45` and print `valid` if it matches the full IPv4 pattern (anchored with `^` and `$`).',
      check: { output: 'valid\n', nodes: ['cond'] },
      solution: 'ip=203.0.113.45; [[ $ip =~ ^[0-9]{1,3}(\\.[0-9]{1,3}){3}$ ]] && echo valid',
      hints: ['`[[ $ip =~ ^…$ ]] && echo valid`'],
    },
    {
      kind: 'predict',
      id: 'p-o',
      md: 'What does this print?',
      code: "echo 'user=admin id=42 port=8080' | grep -Eo '[0-9]+'",
      options: ['42 8080', '42\n8080', 'user=admin id=42 port=8080', '4\n2\n8\n0\n8\n0'],
      answer: 1,
      explain: '`-o` prints each match on its own line, and `+` makes each match as long as possible.',
    },
    {
      kind: 'quiz',
      id: 'q-anchor',
      q: 'Which pattern matches lines that **begin** with `ERROR` or `CRIT`?',
      options: ['ERROR|CRIT', '^(ERROR|CRIT)', '(ERROR|CRIT)$', '[ERROR|CRIT]'],
      answer: 1,
      explain: '`^` anchors to the start of the line. `[…]` is a set of single characters, not a list of words.',
    },
  ],
  drills: [
    {
      kind: 'task',
      id: 'd-md5',
      md: '**Drill 1.** There’s an MD5 hash hidden in the email: exactly **32 hex characters** (`0-9`, `a-f`). Extract it.',
      check: { output: '5d41402abc4b2a76b9719d911017c592\n', uses: ['grep'] },
      solution: "grep -Eo '[0-9a-f]{32}' ~/phish/email.eml",
      hints: ['`[0-9a-f]{32}`'],
    },
    {
      kind: 'task',
      id: 'd-iocs',
      md: '**Drill 2.** Save every unique IP **and** every unique URL into `~/phish/iocs.txt` (IPs first, then URLs). Two commands with `>` then `>>` is fine — or use `{ …; …; } > file`.',
      check: { fs: [{ path: '~/phish/iocs.txt', contains: '203.0.113.45' }, { path: '~/phish/iocs.txt', contains: 'https://files.cdn-share.example/r/report-88213.zip' }] },
      solution: "{ grep -Eo '[0-9]{1,3}(\\.[0-9]{1,3}){3}' ~/phish/email.eml | sort -u; grep -Eo 'https?://[^ \"<>]+' ~/phish/email.eml | sort -u; } > ~/phish/iocs.txt",
      hints: ['First command with `>`, second with `>>`.'],
    },
    {
      kind: 'task',
      id: 'd-invalid',
      md: '**Drill 3.** Back to `auth.log`: which usernames did attackers try most? Extract `Invalid user NAME`, keep just the name, and show the top 5 with counts.',
      check: { output: 'reference', uses: ['grep'] },
      solution: "grep -Eo 'Invalid user [A-Za-z0-9_-]+' /var/log/auth.log | awk '{print $3}' | sort | uniq -c | sort -rn | head -5",
      hints: ["`grep -Eo 'Invalid user [A-Za-z0-9_-]+'`", "`awk '{print $3}'` keeps the name, then rank."],
      explain: 'admin, test, ubuntu, oracle… attackers try default and service account names. A strong reason never to leave such accounts with passwords.',
    },
    {
      kind: 'task',
      id: 'd-private',
      md: '**Drill 4.** Which IPs in the email are **private** (`10.x.x.x` or `192.168.x.x`)? Extract all IPs, then keep only those with `grep -E \'^(10|192\\.168)\\.\'`.',
      check: { output: '10.8.0.14\n', uses: ['grep'] },
      solution: "grep -Eo '[0-9]{1,3}(\\.[0-9]{1,3}){3}' ~/phish/email.eml | grep -E '^(10|192\\.168)\\.'",
      hints: ['Two greps in a pipe: extract, then filter.'],
    },
  ],
  debrief: {
    summary: [
      'Regex building blocks: `.` `[…]` `[^…]` `* + ?` `{n,m}` `^ $` `(a|b)` and `\\.` for a literal dot.',
      '`grep -Eo` extracts just the matches — the core of IOC extraction.',
      'IPv4: `[0-9]{1,3}(\\.[0-9]{1,3}){3}`. URL: `https?://[^ "<>]+`. MD5: `[0-9a-f]{32}`.',
      'Defang before sharing: `hxxp`, `[.]`. Validate input with `[[ $x =~ ^…$ ]]`.',
    ],
    cards: ['c-regex-class', 'c-regex-quant', 'c-grepEo', 'c-ipv4', 'c-url', 'c-ioc', 'c-defang', 'c-matchop'],
  },
};
