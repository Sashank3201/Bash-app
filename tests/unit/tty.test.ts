// `-t FD` is true only while that stream is the terminal (the comparison tests always run piped).
import { describe, expect, it } from 'vitest';
import { buildFixture } from '../../src/content';
import { runIn } from '../../src/engine/grader';

describe('[ -t FD ]', () => {
  it('sees the terminal on stdout, but not through a pipe, a redirect or $( )', async () => {
    const src = `[ -t 1 ] && echo yes
( [ -t 1 ] && echo pipe-yes || echo pipe-no ) | cat
[ -t 1 ] > /tmp/x && echo never
[[ -t 1 ]] && echo double
echo "sub: $( [ -t 1 ] && echo tty || echo captured )"
[ -t 2 ] && echo stderr-tty || echo stderr-not`;
    const r = await runIn(buildFixture('base'), src, { tty: true });
    expect(r.stdout).toBe('yes\npipe-no\ndouble\nsub: captured\nstderr-not\n');
  });
  it('is false everywhere when nothing is a terminal', async () => {
    const r = await runIn(buildFixture('base'), '[ -t 0 ] || [ -t 1 ] || echo none', {});
    expect(r.stdout).toBe('none\n');
  });
});
