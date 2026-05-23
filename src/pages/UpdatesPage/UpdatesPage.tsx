import { useState, useEffect, useRef } from 'react';
import {
  useUpdates,
  createUpdate,
  editUpdate,
  deleteUpdate,
  pinUpdate,
  markUpdatesRead,
  generateUpdateId,
  type Update,
  type UpdateType,
} from '../../services/updates';
import { useUpdateTags, colorHex, hexRgba } from '../../services/updateTags';
import { UpdateEditor } from '../../components/UpdateEditor/UpdateEditor';
import { TagManager } from '../../components/TagManager/TagManager';
import { sanitizeHtml } from '../../utils/sanitizeHtml';
import { trackEvent } from '../../services/usageTracker';
import styles from './UpdatesPage.module.css';
import { useI18n } from '../../i18n';

type FilterType = 'all' | UpdateType;

type EditorState =
  | { open: false }
  | { open: true; update: Update | null };

function TypeChip({ update }: { update: Update }) {
  const { t } = useI18n();
  if (update.type === 'portal') {
    return <span className={`${styles.chip} ${styles.chipPortal}`}>{t('page.updates.filterPortal')}</span>;
  }
  if (update.type === 'app') {
    return <span className={`${styles.chip} ${styles.chipApp}`}>{t('page.updates.filterApp')}: {update.appName ?? 'Unknown'}</span>;
  }
  return <span className={`${styles.chip} ${styles.chipNews}`}>{t('page.updates.filterNews')}</span>;
}

export function UpdatesPage() {
  const { t } = useI18n();
  const { tags, reload: reloadTags } = useUpdateTags();

  const [filterType, setFilterType] = useState<FilterType>('all');
  const [filterTagId, setFilterTagId] = useState('');
  const [filterQ, setFilterQ] = useState('');
  const [editor, setEditor] = useState<EditorState>({ open: false });
  const [tagManagerOpen, setTagManagerOpen] = useState(false);
  const [pinning, setPinning] = useState<string | null>(null);

  const filter = {
    type: filterType === 'all' ? undefined : filterType,
    tagId: filterTagId || undefined,
    q: filterQ || undefined,
  };

  const { updates, loading, hasMore, loadMore, reload } = useUpdates(filter);

  // Mark loaded updates as read
  const markedRef = useRef(new Set<string>());
  useEffect(() => {
    if (loading || !updates.length) return;
    const toMark = updates.filter((u) => !markedRef.current.has(u.id)).map((u) => u.id);
    if (!toMark.length) return;
    toMark.forEach((id) => markedRef.current.add(id));
    markUpdatesRead(toMark).catch(() => {});
  }, [updates, loading]);

  async function handleSave(fields: {
    title: string; description: string; date: string;
    type: UpdateType; appName: string; version: string; tagId: string | null;
  }) {
    if (editor.open && editor.update === null) {
      await createUpdate({
        id: generateUpdateId(),
        title: fields.title,
        description: fields.description,
        date: fields.date,
        type: fields.type,
        appName: fields.appName || undefined,
        version: fields.version || undefined,
        tagId: fields.tagId,
      });
    } else if (editor.open && editor.update) {
      await editUpdate(editor.update.id, {
        title: fields.title,
        description: fields.description,
        date: fields.date,
        type: fields.type,
        appName: fields.appName || null,
        version: fields.version || null,
        tagId: fields.tagId,
      });
    }
    reload();
  }

  async function handleDelete() {
    if (!editor.open || !editor.update) return;
    await deleteUpdate(editor.update.id);
    reload();
  }

  async function handlePin(update: Update, e: React.MouseEvent) {
    e.stopPropagation();
    if (pinning) return;
    setPinning(update.id);
    try {
      await pinUpdate(update.id);
      reload();
    } finally {
      setPinning(null);
    }
  }

  function handleCardClick(title: string) {
    trackEvent('page_view', `/updates#${title}`);
  }

  const pinnedUpdates = updates.filter((u) => u.isPinned);
  const regularUpdates = updates.filter((u) => !u.isPinned);

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.pageHeader}>
        <div className={styles.pageHeaderRow}>
          <div>
            <h2 className={styles.pageTitle}>{t('page.updates.title')}</h2>
            <p className={styles.pageSubtitle}>{t('page.updates.subtitle')}</p>
          </div>
        </div>

        {/* Filter bar */}
        <div className={styles.filterBar}>
          <div className={styles.typeFilters}>
            {(['all', 'news', 'portal', 'app'] as const).map((filterTypeValue) => (
              <button
                key={filterTypeValue}
                type="button"
                className={`${styles.filterBtn} ${filterType === filterTypeValue ? styles.filterBtnActive : ''}`}
                onClick={() => setFilterType(filterTypeValue)}
              >
                {filterTypeValue === 'all' ? t('page.updates.filterAll') : filterTypeValue === 'news' ? t('page.updates.filterNews') : filterTypeValue === 'portal' ? t('page.updates.filterPortal') : t('page.updates.filterApp')}
              </button>
            ))}
          </div>

          {tags.length > 0 && (
            <select
              className={styles.tagSelect}
              value={filterTagId}
              onChange={(e) => setFilterTagId(e.target.value)}
            >
                <option value="">{t('page.updates.allTags')}</option>
              {tags.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          )}

          <input
            className={styles.searchInput}
            type="search"
            placeholder={t('page.updates.search')}
            value={filterQ}
            onChange={(e) => setFilterQ(e.target.value)}
          />
        </div>
      </div>

      {/* Pinned section */}
      {pinnedUpdates.length > 0 && (
        <section className={styles.pinnedSection}>
          <h4 className={styles.sectionLabel}>{t('page.updates.pinned')}</h4>
          <ul className={styles.updateList}>
            {pinnedUpdates.map((u) => (
              <UpdateCard
                key={u.id}
                update={u}
                tags={tags}
                isAdmin={false}
                pinning={pinning}
                onPin={handlePin}
                onEdit={(upd) => setEditor({ open: true, update: upd })}
                onClick={handleCardClick}
              />
            ))}
          </ul>
        </section>
      )}

      {/* Regular feed */}
      <ul className={styles.updateList}>
        {!loading && updates.length === 0 && (
          <li className={styles.empty}>{t('page.updates.noUpdates')}</li>
        )}
        {regularUpdates.map((u) => (
          <UpdateCard
            key={u.id}
            update={u}
            tags={tags}
            isAdmin={false}
            pinning={pinning}
            onPin={handlePin}
            onEdit={(upd) => setEditor({ open: true, update: upd })}
            onClick={handleCardClick}
          />
        ))}
      </ul>

      {hasMore && (
        <div className={styles.loadMoreWrap}>
          <button className={styles.loadMoreBtn} onClick={loadMore} disabled={loading}>
            {loading ? t('page.updates.loading') : t('page.updates.loadMore')}
          </button>
        </div>
      )}

      {loading && updates.length === 0 && (
        <div className={styles.loadingMsg}>{t('page.updates.loading')}</div>
      )}

      {/* Modals */}
      {editor.open && (
        <UpdateEditor
          update={editor.update}
          onSave={handleSave}
          onDelete={editor.update ? handleDelete : undefined}
          onClose={() => setEditor({ open: false })}
        />
      )}

      {tagManagerOpen && (
        <TagManager
          tags={tags}
          onClose={() => setTagManagerOpen(false)}
          onReload={reloadTags}
        />
      )}
    </div>
  );
}

/* ── Card subcomponent ──────────────────────────────────────────────────── */

interface CardProps {
  update: Update;
  tags: ReturnType<typeof useUpdateTags>['tags'];
  isAdmin: boolean;
  pinning: string | null;
  onPin: (u: Update, e: React.MouseEvent) => void;
  onEdit: (u: Update) => void;
  onClick: (title: string) => void;
}

function UpdateCard({ update, tags, isAdmin, pinning, onPin, onEdit, onClick }: CardProps) {
  const { t } = useI18n();
  const tag = tags.find((t) => t.id === update.tagId);
  const tagHex = tag ? colorHex(tag.color) : null;

  return (
    <li
      className={`${styles.updateCard} ${update.isPinned ? styles.pinnedCard : ''}`}
      onClick={() => onClick(update.title)}
    >
      <div className={styles.updateMeta}>
        <span className={styles.updateDate}>{update.date}</span>
        <TypeChip update={update} />
        {update.version && (
          <span className={styles.versionBadge}>v{update.version}</span>
        )}
        {tag && tagHex && (
          <span
            className={styles.tagChip}
            style={{
              background: hexRgba(tagHex, 0.18),
              border: `1px solid ${hexRgba(tagHex, 0.5)}`,
              color: tagHex,
            }}
          >
            {tag.label}
          </span>
        )}
        {isAdmin && (
          <div className={styles.adminActions}>
            <button
              className={`${styles.pinBtn} ${update.isPinned ? styles.pinBtnActive : ''}`}
              onClick={(e) => onPin(update, e)}
              disabled={pinning === update.id}
              aria-label={update.isPinned ? t('page.updates.unpin') : t('page.updates.pin')}
              title={update.isPinned ? t('page.updates.unpin') : t('page.updates.pin')}
            >
              📌
            </button>
            <button
              className={styles.editBtn}
              onClick={(e) => { e.stopPropagation(); onEdit(update); }}
              aria-label={t('page.updates.edit')}
            >
              {t('page.updates.edit')}
            </button>
          </div>
        )}
      </div>

      <h3 className={styles.updateTitle}>{update.title}</h3>

      {update.description && (
        <div
          className={styles.updateDescription}
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(update.description) }}
        />
      )}

      <span className={styles.publishedBy}>{t('page.updates.publishedBy', { name: update.publishedBy })}</span>
    </li>
  );
}
