// Mara's tips: the right hint for the mistake, and none that mislead.
import { describe, expect, it } from 'vitest';
import '../../src/shell';
import { coachHint } from '../../src/terminal/coach';

describe('coachHint', () => {
  it('spots spaces around = in an assignment', () => {
    expect(coachHint('count = 5', 'bash: count: command not found\n', 127)).toMatch(/No spaces around/);
  });

  it('suggests the closest command for a typo', () => {
    const tip = (w: string) => coachHint(`${w} x`, `bash: ${w}: command not found\n`, 127);
    expect(tip('gerp')).toMatch(/`grep`/);
    expect(tip('grpe')).toMatch(/`grep`/);
    expect(tip('ehco')).toMatch(/`echo`/);
    expect(tip('sl')).toMatch(/`ls`/);
    expect(tip('whomai')).toMatch(/`whoami`/);
  });

  it('explains a missing path', () => {
    expect(coachHint('cat nope.txt', 'cat: nope.txt: No such file or directory\n', 1)).toMatch(/doesn't exist/);
  });

  it('treats a file missing from a checksum list as a finding, not a typo', () => {
    const err = 'sha256sum: robots.txt: No such file or directory\nsha256sum: WARNING: 1 listed file could not be read\n';
    const tip = coachHint('sha256sum -c baseline.sha256', err, 1);
    expect(tip).toMatch(/finding/);
    expect(tip).not.toMatch(/pwd/);
  });

  it('stays quiet when nothing went wrong', () => {
    expect(coachHint('ls', '', 0)).toBeNull();
  });
});
