import { useRef, useEffect, useCallback } from 'react';
import styles from './RichTextEditor.module.css';

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

type FormatCommand = 'bold' | 'italic' | 'underline' | 'strikeThrough' | 'removeFormat';

export function RichTextEditor({ value, onChange, placeholder = 'Enter text…' }: Props) {
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (el.innerHTML !== value) {
      el.innerHTML = value;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exec = useCallback((command: FormatCommand) => {
    document.execCommand(command, false);
    editorRef.current?.focus();
    onChange(editorRef.current?.innerHTML ?? '');
  }, [onChange]);

  const handleInput = useCallback(() => {
    onChange(editorRef.current?.innerHTML ?? '');
  }, [onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const mod = e.metaKey || e.ctrlKey;
    if (!mod) return;

    if (e.key === 'b') { e.preventDefault(); exec('bold'); }
    else if (e.key === 'i') { e.preventDefault(); exec('italic'); }
    else if (e.key === 'u') { e.preventDefault(); exec('underline'); }
    else if (e.shiftKey && (e.key === 's' || e.key === 'S')) { e.preventDefault(); exec('strikeThrough'); }
  }, [exec]);

  return (
    <div className={styles.wrapper}>
      <div className={styles.toolbar}>
        <button type="button" className={styles.btn} title="Bold (Ctrl+B)" onMouseDown={(e) => { e.preventDefault(); exec('bold'); }}>B</button>
        <button type="button" className={`${styles.btn}`} title="Italic (Ctrl+I)" style={{ fontStyle: 'italic' }} onMouseDown={(e) => { e.preventDefault(); exec('italic'); }}>I</button>
        <button type="button" className={styles.btn} title="Underline (Ctrl+U)" style={{ textDecoration: 'underline' }} onMouseDown={(e) => { e.preventDefault(); exec('underline'); }}>U</button>
        <button type="button" className={styles.btn} title="Strikethrough (Ctrl+Shift+S)" style={{ textDecoration: 'line-through' }} onMouseDown={(e) => { e.preventDefault(); exec('strikeThrough'); }}>S</button>
        <div className={styles.divider} />
        <button type="button" className={styles.btn} title="Clear formatting" onMouseDown={(e) => { e.preventDefault(); exec('removeFormat'); }}>✕</button>
      </div>
      <div
        ref={editorRef}
        className={styles.editor}
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
      />
    </div>
  );
}
