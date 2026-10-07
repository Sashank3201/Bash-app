import { useEffect, useRef, useState } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, drawSelection, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { HighlightStyle, StreamLanguage, bracketMatching, indentOnInput, syntaxHighlighting } from '@codemirror/language';
import { shell } from '@codemirror/legacy-modes/mode/shell';
import { tags as t } from '@lezer/highlight';
import s from './ScriptEditor.module.css';

const theme = EditorView.theme(
  {
    '&': { height: '100%', backgroundColor: 'var(--term-bg)', color: 'var(--term-fg)', fontSize: '0.86rem' },
    '.cm-content': { fontFamily: 'var(--font-mono)', caretColor: 'var(--term-accent)', padding: '12px 0 40vh' },
    '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.6' },
    '.cm-gutters': { backgroundColor: 'var(--term-bg)', color: '#5d564c', border: 'none', paddingRight: '4px' },
    '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--term-muted)' },
    '.cm-activeLine': { backgroundColor: 'rgba(255,255,255,0.035)' },
    '&.cm-focused .cm-cursor': { borderLeftColor: 'var(--term-accent)', borderLeftWidth: '2px' },
    '&.cm-focused .cm-selectionBackground, ::selection, .cm-selectionBackground': { backgroundColor: 'rgba(240,162,59,0.25) !important' },
    '.cm-matchingBracket': { backgroundColor: 'rgba(143,201,164,0.18)', outline: 'none' },
    '&.cm-focused': { outline: 'none' },
  },
  { dark: true },
);

const highlight = HighlightStyle.define([
  { tag: t.comment, color: '#7d7466', fontStyle: 'italic' },
  { tag: [t.string, t.special(t.string)], color: '#a8e0b9' },
  { tag: t.keyword, color: '#ef8a7d', fontWeight: '600' },
  { tag: [t.variableName, t.special(t.variableName)], color: '#f0c674' },
  { tag: t.number, color: '#d9a7d3' },
  { tag: t.operator, color: '#8fb3d9' },
  { tag: t.standard(t.variableName), color: '#7fc8c4' },
  { tag: t.atom, color: '#d9a7d3' },
  { tag: t.meta, color: '#8fb3d9' },
]);

const SYMBOLS = ['$', '"', "'", '|', '>', '<', '{', '}', '[', ']', '(', ')', '=', ';', '&', '#', '-', '/', '*', '\\', '`', '~'];

export interface ScriptEditorProps {
  value: string;
  onChange?: (v: string) => void;
  readOnly?: boolean;
  autoFocus?: boolean;
  className?: string;
  symbols?: boolean;
}

export function ScriptEditor({ value, onChange, readOnly, autoFocus, className, symbols = true }: ScriptEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [coarse] = useState(() => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches);

  useEffect(() => {
    if (!host.current) return;
    const v = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightActiveLine(),
          drawSelection(),
          history(),
          indentOnInput(),
          bracketMatching(),
          StreamLanguage.define(shell),
          syntaxHighlighting(highlight),
          keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),
          EditorView.lineWrapping,
          EditorState.tabSize.of(2),
          EditorState.readOnly.of(!!readOnly),
          EditorView.contentAttributes.of({ autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', 'aria-label': 'Script editor' }),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) onChangeRef.current?.(u.state.doc.toString());
          }),
          theme,
        ],
      }),
    });
    view.current = v;
    if (autoFocus && !coarse) v.focus();
    return () => {
      v.destroy();
      view.current = null;
    };
    // the editor owns its document after mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly]);

  // external value changes (e.g. reset to starter)
  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== value) {
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
    }
  }, [value]);

  const insert = (txt: string) => {
    const v = view.current;
    if (!v) return;
    const sel = v.state.selection.main;
    v.dispatch({ changes: { from: sel.from, to: sel.to, insert: txt }, selection: { anchor: sel.from + txt.length } });
    v.focus();
  };

  return (
    <div className={[s.wrap, className].filter(Boolean).join(' ')}>
      <div className={s.cm} ref={host} />
      {symbols && coarse && !readOnly && (
        <div className={s.symbols} role="toolbar" aria-label="Symbols">
          <button className={s.sym} onPointerDown={(e) => e.preventDefault()} onClick={() => insert('  ')}>
            ⇥
          </button>
          {SYMBOLS.map((c) => (
            <button key={c} className={s.sym} onPointerDown={(e) => e.preventDefault()} onClick={() => insert(c)}>
              {c}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
