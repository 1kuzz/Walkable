import { useState, useEffect } from 'react';
import { RichTextEditor } from '../RichTextEditor/RichTextEditor';
import { colorHex, hexRgba, useUpdateTags } from '../../services/updateTags';
import type { Update, UpdateType } from '../../services/updates';
import styles from './UpdateEditor.module.css';

interface SaveFields {
  title: string;
  description: string;
  date: string;
  type: UpdateType;
  appName: string;
  version: string;
  tagId: string | null;
}

interface Props {
  update?: Update | null; // null = create
  onSave: (fields: SaveFields) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
}

const TYPE_OPTIONS: Array<{ value: UpdateType; label: string }> = [
  { value: 'news',   label: 'News' },
  { value: 'portal', label: 'Portal Release' },
  { value: 'app',    label: 'App Update' },
];

export function UpdateEditor({ update, onSave, onDelete, onClose }: Props) {
  const isCreate = update == null;
  const { tags } = useUpdateTags();

  const [title,       setTitle]    = useState(update?.title ?? '');
  const [description, setDesc]     = useState(update?.description ?? '');
  const [date,        setDate]     = useState(update?.date ?? new Date().toISOString().slice(0, 10));
  const [type,        setType]     = useState<UpdateType>(update?.type ?? 'news');
  const [appName,     setAppName]  = useState(update?.appName ?? '');
  const [version,     setVersion]  = useState(update?.version ?? '');
  const [tagId,       setTagId]    = useState<string | null>(update?.tagId ?? null);
  const [error,       setError]    = useState('');
  const [saving,      setSaving]   = useState(false);
  const [confirmDel,  setConfirmDel] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function handleSave() {
    if (!title.trim())  { setError('Title is required'); return; }
    if (!date)          { setError('Date is required'); return; }
    if (type === 'app' && !appName.trim()) { setError('App name is required for App Update'); return; }

    setSaving(true); setError('');
    try {
      await onSave({ title: title.trim(), description, date, type, appName: appName.trim(), version: version.trim(), tagId });
      onClose();
    } catch {
      setError('Failed to save. Try again.');
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!onDelete) return;
    setSaving(true);
    try { await onDelete(); onClose(); }
    catch { setError('Failed to delete. Try again.'); setSaving(false); }
  }


  return (
    <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal="true">
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h3 className={styles.title}>{isCreate ? 'New Update' : 'Edit Update'}</h3>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>
        </div>

        {error && <div className={styles.errorMsg}>{error}</div>}

        {/* Row 1: title + date */}
        <div className={styles.row}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="ue-title">Title *</label>
            <input id="ue-title" className={styles.input} type="text" value={title}
              onChange={(e) => { setTitle(e.target.value); setError(''); }} placeholder="Update title" autoFocus />
          </div>
          <div className={styles.field} style={{ flex: '0 0 150px' }}>
            <label className={styles.label} htmlFor="ue-date">Date *</label>
            <input id="ue-date" className={styles.input} type="date" value={date}
              onChange={(e) => { setDate(e.target.value); setError(''); }} />
          </div>
        </div>

        {/* Row 2: type + version + app name */}
        <div className={styles.row}>
          <div className={styles.field}>
            <label className={styles.label}>Type</label>
            <div className={styles.segmented}>
              {TYPE_OPTIONS.map((opt) => (
                <button key={opt.value} type="button"
                  className={`${styles.segBtn} ${type === opt.value ? styles.segBtnActive : ''}`}
                  onClick={() => setType(opt.value)}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.field} style={{ flex: '0 0 110px' }}>
            <label className={styles.label} htmlFor="ue-version">Version</label>
            <input id="ue-version" className={styles.input} type="text" value={version}
              onChange={(e) => setVersion(e.target.value)} placeholder="e.g. v1.2" />
          </div>
        </div>

        {type === 'app' && (
          <div className={styles.field}>
            <label className={styles.label} htmlFor="ue-appname">App Name *</label>
            <input id="ue-appname" className={styles.input} type="text" value={appName}
              onChange={(e) => { setAppName(e.target.value); setError(''); }} placeholder="App name" />
          </div>
        )}

        {/* Tag picker */}
        <div className={styles.field}>
          <label className={styles.label}>Tag</label>
          <div className={styles.tagPicker}>
            <button type="button"
              className={`${styles.tagOpt} ${tagId === null ? styles.tagOptActive : ''}`}
              onClick={() => setTagId(null)}>
              No tag
            </button>
            {tags.map((t) => {
              const h = colorHex(t.color);
              const active = tagId === t.id;
              return (
                <button key={t.id} type="button"
                  className={`${styles.tagOpt} ${active ? styles.tagOptActive : ''}`}
                  style={active ? {
                    background: hexRgba(h, 0.2),
                    borderColor: hexRgba(h, 0.6),
                    color: h,
                  } : {}}
                  onClick={() => setTagId(t.id)}>
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Rich text description */}
        <div className={styles.field}>
          <label className={styles.label}>Description</label>
          <div className={styles.editorWrap}>
            <RichTextEditor value={description} onChange={setDesc} placeholder="Describe this update…" />
          </div>
        </div>

        <div className={styles.actions}>
          <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : isCreate ? '✓ Publish' : '✓ Save'}
          </button>
          <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>

          {onDelete && !confirmDel && (
            <button className={styles.deleteBtn} onClick={() => setConfirmDel(true)}>Delete</button>
          )}
          {onDelete && confirmDel && (
            <>
              <button className={styles.deleteBtn} onClick={handleDelete} disabled={saving} style={{ marginLeft: 'auto' }}>
                Confirm delete
              </button>
              <button className={styles.cancelBtn} onClick={() => setConfirmDel(false)}>No</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
