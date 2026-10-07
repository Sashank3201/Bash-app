// Control-flow signals and errors used by the interpreter.

/** Input ended in the middle of a construct (unclosed quote, missing `fi`, trailing `|` ...). */
export class IncompleteInput extends Error {
  constructor(public what: string) {
    super(`unexpected end of file (${what})`);
  }
}

/** A real syntax error, formatted like bash. */
export class ShellSyntaxError extends Error {
  constructor(
    message: string,
    public line: number,
    public token?: string,
  ) {
    super(message);
  }
}

export class BreakSignal {
  constructor(public levels: number) {}
}
export class ContinueSignal {
  constructor(public levels: number) {}
}
export class ReturnSignal {
  constructor(public status: number) {}
}
export class ExitSignal {
  constructor(public status: number) {}
}

/** Ctrl-C from the user. */
export class InterruptSignal {
  status = 130;
}

/** The simulator's safety limit (infinite loops, runaway recursion). */
export class LimitSignal {
  constructor(public message: string) {}
}

/** An expansion error such as `${x:?msg}` or a bad substitution: aborts the current command. */
export class ExpansionError extends Error {
  constructor(
    message: string,
    public status = 1,
    public fatal = false,
  ) {
    super(message);
  }
}

/** Something the simulator deliberately does not support. */
export class UnsupportedError extends Error {
  constructor(feature: string) {
    super(`${feature} is not available in the simulator — try it in the Real Linux Lab`);
  }
}
