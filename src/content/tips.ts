// Rotating "From Mara" notes for the Today screen.

export const TIPS: string[] = [
  'Press **↑** to bring back your last command instead of retyping it. Edit, then Enter.',
  '**Tab** completes file names. If nothing happens, there’s probably a typo earlier in the name.',
  'Quote your variables: `"$file"`, not `$file`. File names with spaces will thank you.',
  'Before you delete anything on a real server, run the same command with `ls` first to see what it would match.',
  '`man` is not cheating. Senior analysts read manual pages every day.',
  'Logs are evidence. Copy them with `cp -p` (keeps timestamps) before you touch anything.',
  '`grep -c` counts matches. `grep -v` hides them. Together they answer half of all log questions.',
  'The pipeline `sort | uniq -c | sort -rn | head` is the analyst’s top-N machine. You’ll use it weekly.',
  '`set -euo pipefail` at the top of a script turns silent failures into loud ones. Loud is good.',
  'Base64 is an encoding, not encryption. Anyone can decode it — attackers use it to hide, not to protect.',
  'An exit status of 0 means success. Anything else is a failure — and `$?` tells you which.',
  'Read a script before you run it. Especially one you found on a compromised machine.',
  'When a script misbehaves, run it with `bash -x script.sh` and watch every step.',
  'Your fingers will get faster. Accuracy first — speed comes on its own.',
  '`find / -perm -4000 -type f 2>/dev/null` lists SUID programs: a classic first check in any audit.',
  'Cron is a favourite hiding place for persistence. Always read every crontab during an incident.',
];
