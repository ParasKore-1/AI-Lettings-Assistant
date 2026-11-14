import {
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_MAX_COUNT,
  ATTACHMENT_MIME_TYPES,
  type Attachment,
  type AttachmentMime,
} from '@keyring/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, uploadAttachment } from '../../lib/api';
import { formatBytes, newClientId } from '../../lib/utils';
import { toast } from '../../stores/toasts';

export interface RejectedFile {
  name: string;
  reason: string;
}

/** Pure validation, shared by the drop zone, paste handler and file picker. */
export function validateFiles(files: File[], existingCount: number): { accepted: File[]; rejected: RejectedFile[] } {
  const accepted: File[] = [];
  const rejected: RejectedFile[] = [];
  for (const file of files) {
    if (!(ATTACHMENT_MIME_TYPES as readonly string[]).includes(file.type)) {
      rejected.push({ name: file.name, reason: 'Only images (PNG, JPEG, WebP, GIF) and PDFs are supported.' });
    } else if (file.size > ATTACHMENT_MAX_BYTES) {
      rejected.push({ name: file.name, reason: `Larger than ${formatBytes(ATTACHMENT_MAX_BYTES)}.` });
    } else if (file.size === 0) {
      rejected.push({ name: file.name, reason: 'The file is empty.' });
    } else if (existingCount + accepted.length >= ATTACHMENT_MAX_COUNT) {
      rejected.push({ name: file.name, reason: `You can attach up to ${ATTACHMENT_MAX_COUNT} files.` });
    } else {
      accepted.push(file);
    }
  }
  return { accepted, rejected };
}

export interface PendingAttachment {
  localId: string;
  name: string;
  size: number;
  mimeType: AttachmentMime;
  previewUrl: string | null;
  progress: number;
  status: 'uploading' | 'done' | 'error';
  error: string | null;
  attachment: Attachment | null;
}

/** Upload queue for the composer: validates, previews, uploads with progress, supports removal. */
export function useAttachmentQueue() {
  const [items, setItems] = useState<PendingAttachment[]>([]);
  const aborts = useRef(new Map<string, () => void>());
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const update = (localId: string, patch: Partial<PendingAttachment>) =>
    setItems((list) => list.map((i) => (i.localId === localId ? { ...i, ...patch } : i)));

  const add = useCallback((files: File[]) => {
    const { accepted, rejected } = validateFiles(files, itemsRef.current.length);
    for (const r of rejected) toast({ title: `Couldn’t attach ${r.name}`, description: r.reason, tone: 'danger' });
    const created = accepted.map((file) => {
      const item: PendingAttachment = {
        localId: newClientId('att'),
        name: file.name,
        size: file.size,
        mimeType: file.type as AttachmentMime,
        previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
        progress: 0,
        status: 'uploading',
        error: null,
        attachment: null,
      };
      const { promise, abort } = uploadAttachment(file, (p) => update(item.localId, { progress: p }));
      aborts.current.set(item.localId, abort);
      promise
        .then((attachment) => update(item.localId, { status: 'done', progress: 1, attachment }))
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === 'AbortError') return;
          update(item.localId, {
            status: 'error',
            error: err instanceof ApiError ? err.message : 'Upload failed',
          });
        })
        .finally(() => aborts.current.delete(item.localId));
      return item;
    });
    if (created.length) setItems((list) => [...list, ...created]);
  }, []);

  const remove = useCallback((localId: string) => {
    aborts.current.get(localId)?.();
    setItems((list) => {
      const item = list.find((i) => i.localId === localId);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return list.filter((i) => i.localId !== localId);
    });
  }, []);

  const clear = useCallback(() => {
    for (const abort of aborts.current.values()) abort();
    setItems((list) => {
      for (const i of list) if (i.previewUrl) URL.revokeObjectURL(i.previewUrl);
      return [];
    });
  }, []);

  useEffect(
    () => () => {
      for (const abort of aborts.current.values()) abort();
    },
    [],
  );

  const uploading = items.some((i) => i.status === 'uploading');
  const ready = items.flatMap((i) => (i.attachment ? [i.attachment] : []));
  return { items, add, remove, clear, uploading, ready };
}
