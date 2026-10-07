// AST for the subset of Bash the simulator understands.

export type WordPart =
  | { t: 'lit'; v: string } // unquoted literal text (globbing/brace/tilde apply)
  | { t: 'q'; v: string } // quoted literal: '...', $'...', or a backslash escape
  | { t: 'dq'; parts: WordPart[] } // "..."
  | { t: 'param'; p: ParamExp }
  | { t: 'cmd'; src: string; body: Program } // $(...) or `...`
  | { t: 'arith'; expr: string }; // $(( ... ))

export interface Word {
  parts: WordPart[];
  raw: string;
  /** Set for `declare arr=(...)` style words that follow a declaration builtin. */
  arrayAssign?: Assign;
}

export interface ParamExp {
  name: string;
  index?: string; // raw subscript text for name[...]
  length?: boolean; // ${#x}
  indirect?: boolean; // ${!x} / ${!arr[@]}
  op?: string;
  arg?: Word;
  arg2?: Word;
  braced: boolean;
}

export type RedirOp = '>' | '>>' | '<' | '<<' | '<<-' | '<<<' | '>&' | '<&' | '&>' | '&>>' | '>|' | '<>';

export interface Redir {
  fd?: number;
  op: RedirOp;
  target: Word;
  heredoc?: { body: string; quoted: boolean };
}

export interface Assign {
  name: string;
  index?: string;
  append: boolean;
  value?: Word;
  array?: { key?: string; value: Word }[];
}

export type CondExpr =
  | { t: 'and'; l: CondExpr; r: CondExpr }
  | { t: 'or'; l: CondExpr; r: CondExpr }
  | { t: 'not'; e: CondExpr }
  | { t: 'unary'; op: string; arg: Word }
  | { t: 'binary'; op: string; l: Word; r: Word }
  | { t: 'word'; w: Word };

export type Node =
  | { type: 'simple'; assigns: Assign[]; words: Word[]; redirs: Redir[]; line: number }
  | { type: 'pipeline'; cmds: Node[]; negate: boolean; line: number }
  | { type: 'andor'; first: Node; rest: { op: '&&' | '||'; node: Node }[]; line: number }
  | { type: 'list'; items: { node: Node; bg: boolean }[]; line: number }
  | { type: 'if'; clauses: { cond: Node; body: Node }[]; else?: Node; redirs: Redir[]; line: number }
  | { type: 'for'; name: string; words?: Word[]; body: Node; redirs: Redir[]; line: number }
  | { type: 'cfor'; init: string; cond: string; step: string; body: Node; redirs: Redir[]; line: number }
  | { type: 'while'; until: boolean; cond: Node; body: Node; redirs: Redir[]; line: number }
  | {
      type: 'case';
      word: Word;
      items: { patterns: Word[]; body?: Node; term: ';;' | ';&' | ';;&' }[];
      redirs: Redir[];
      line: number;
    }
  | { type: 'group'; body: Node; redirs: Redir[]; line: number }
  | { type: 'subshell'; body: Node; redirs: Redir[]; line: number }
  | { type: 'func'; name: string; body: Node; line: number }
  | { type: 'cond'; expr: CondExpr; redirs: Redir[]; line: number }
  | { type: 'arith'; expr: string; redirs: Redir[]; line: number };

export type Program = Node & { type: 'list' };

export type NodeType = Node['type'];
