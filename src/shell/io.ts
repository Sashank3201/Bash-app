// Streams used by the interpreter. Pipelines are buffered: each stage runs to completion.

export interface Writer {
  write(s: string): void;
  /** True when this is the interactive terminal (enables colours/columns like real tools). */
  isTTY?: boolean;
}

export class StringWriter implements Writer {
  buf = '';
  write(s: string) {
    this.buf += s;
  }
}

export const NullWriter: Writer = { write() {} };

/** Line-oriented input. Interactive terminals supply `pull` to ask the user for more input. */
export class InBuf {
  private data: string;
  private pos = 0;
  private eof: boolean;
  isTTY: boolean;

  constructor(
    data = '',
    private pull?: () => Promise<string | null>,
  ) {
    this.data = data;
    this.eof = !pull;
    this.isTTY = !!pull;
  }

  static empty(): InBuf {
    return new InBuf('');
  }

  private async fill(): Promise<boolean> {
    if (this.eof || !this.pull) return false;
    const more = await this.pull();
    if (more === null) {
      this.eof = true;
      return false;
    }
    this.data = this.data.slice(this.pos) + more;
    this.pos = 0;
    return true;
  }

  /** Returns [line, hadNewline] or null at EOF. */
  async readLine(delim = '\n'): Promise<[string, boolean] | null> {
    for (;;) {
      const i = this.data.indexOf(delim, this.pos);
      if (i >= 0) {
        const line = this.data.slice(this.pos, i);
        this.pos = i + delim.length;
        return [line, true];
      }
      if (!(await this.fill())) {
        if (this.pos >= this.data.length) return null;
        const line = this.data.slice(this.pos);
        this.pos = this.data.length;
        return [line, false];
      }
    }
  }

  async readAll(): Promise<string> {
    while (await this.fill()) {
      /* keep pulling until EOF */
    }
    const s = this.data.slice(this.pos);
    this.pos = this.data.length;
    return s;
  }

  async readChars(n: number): Promise<string> {
    while (this.data.length - this.pos < n && (await this.fill())) {
      /* pull */
    }
    const s = this.data.slice(this.pos, this.pos + n);
    this.pos += s.length;
    return s;
  }
}
