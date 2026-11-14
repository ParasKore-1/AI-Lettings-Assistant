import {
  ToolResultSchema,
  type Attachment,
  type AttachmentMime,
  type Conversation,
  type ConversationPage,
  type Feedback,
  type Message,
  type MessageError,
  type MessageStatus,
  type Role,
  type ToolResult,
} from '@keyring/shared';
import { z } from 'zod';
import { newId, nowIso, truncate } from '../lib/util';
import type { Database } from './database';

export const DEFAULT_TITLE = 'New chat';

type Row = Record<string, unknown>;

interface MessageRow {
  id: string;
  conversation_id: string;
  parent_id: string | null;
  role: Role;
  content: string;
  tool_results: string;
  attachment_ids: string;
  status: MessageStatus;
  feedback: 'up' | 'down' | null;
  error: string | null;
  model: string | null;
  provider_trace: string | null;
  created_at: string;
}

export interface StoredMessage extends Message {
  /** Provider-native transcript of how this reply was produced (e.g. Anthropic content blocks). */
  providerTrace: unknown;
}

const ToolResultsJson = z.array(ToolResultSchema);
const IdsJson = z.array(z.string());

function encodeCursor(c: Conversation): string {
  return Buffer.from(JSON.stringify([c.pinned ? 1 : 0, c.updatedAt, c.id])).toString('base64url');
}

function decodeCursor(cursor: string): [number, string, string] | null {
  try {
    const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as unknown;
    const parsed = z.tuple([z.number(), z.string(), z.string()]).safeParse(value);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

const escapeLike = (q: string) => q.replace(/[\\%_]/g, (m) => `\\${m}`);

export function createRepository(db: Database) {
  const attachmentUrl = (id: string) => `/api/attachments/${id}`;

  function toConversation(row: Row): Conversation {
    return {
      id: row.id as string,
      title: row.title as string,
      pinned: row.pinned === 1,
      shared: row.shared === 1,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
      preview: truncate((row.preview as string | null) ?? '', 120),
    };
  }

  const attachmentMeta = db.prepare(
    'SELECT id, name, mime_type, size FROM attachments WHERE id = ?',
  );

  function loadAttachments(ids: string[]): Attachment[] {
    const out: Attachment[] = [];
    for (const id of ids) {
      const row = attachmentMeta.get(id) as Row | undefined;
      if (row) {
        out.push({
          id: row.id as string,
          name: row.name as string,
          mimeType: row.mime_type as AttachmentMime,
          size: row.size as number,
          url: attachmentUrl(row.id as string),
        });
      }
    }
    return out;
  }

  function toMessage(raw: Row): StoredMessage {
    const row = raw as unknown as MessageRow;
    return {
      id: row.id,
      conversationId: row.conversation_id,
      parentId: row.parent_id,
      role: row.role,
      content: row.content,
      toolResults: ToolResultsJson.parse(JSON.parse(row.tool_results)),
      attachments: loadAttachments(IdsJson.parse(JSON.parse(row.attachment_ids))),
      status: row.status,
      feedback: row.feedback,
      error: row.error ? (JSON.parse(row.error) as MessageError) : null,
      model: row.model,
      createdAt: row.created_at,
      providerTrace: row.provider_trace ? (JSON.parse(row.provider_trace) as unknown) : null,
    };
  }

  const PREVIEW_SQL = `(SELECT content FROM messages m WHERE m.conversation_id = c.id AND m.content <> ''
     ORDER BY m.created_at DESC LIMIT 1)`;

  const getConversationStmt = db.prepare(
    `SELECT c.*, ${PREVIEW_SQL} AS preview FROM conversations c WHERE c.id = ? AND c.deleted_at IS NULL`,
  );

  return {
    listConversations(opts: { cursor?: string | undefined; limit: number; q?: string | undefined }): ConversationPage {
      const where: string[] = ['c.deleted_at IS NULL'];
      const params: (string | number)[] = [];
      if (opts.q && opts.q.trim()) {
        const like = `%${escapeLike(opts.q.trim())}%`;
        where.push(
          `(c.title LIKE ? ESCAPE '\\' OR EXISTS (SELECT 1 FROM messages s WHERE s.conversation_id = c.id AND s.content LIKE ? ESCAPE '\\'))`,
        );
        params.push(like, like);
      }
      if (opts.cursor) {
        const c = decodeCursor(opts.cursor);
        if (c) {
          where.push('(c.pinned, c.updated_at, c.id) < (?, ?, ?)');
          params.push(...c);
        }
      }
      const rows = db
        .prepare(
          `SELECT c.*, ${PREVIEW_SQL} AS preview FROM conversations c
           WHERE ${where.join(' AND ')}
           ORDER BY c.pinned DESC, c.updated_at DESC, c.id DESC
           LIMIT ?`,
        )
        .all(...params, opts.limit + 1) as Row[];
      const items = rows.slice(0, opts.limit).map(toConversation);
      const last = items[items.length - 1];
      return { items, nextCursor: rows.length > opts.limit && last ? encodeCursor(last) : null };
    },

    getConversation(id: string): Conversation | null {
      const row = getConversationStmt.get(id) as Row | undefined;
      return row ? toConversation(row) : null;
    },

    createConversation(input: { id?: string | undefined; title?: string | undefined; createdAt?: string }): Conversation {
      const now = input.createdAt ?? nowIso();
      const id = input.id ?? newId('c');
      db.prepare(
        'INSERT INTO conversations (id, title, pinned, shared, created_at, updated_at) VALUES (?, ?, 0, 0, ?, ?)',
      ).run(id, input.title ?? DEFAULT_TITLE, now, now);
      return this.getConversation(id)!;
    },

    updateConversation(
      id: string,
      patch: { title?: string | undefined; pinned?: boolean | undefined; shared?: boolean | undefined; touch?: boolean },
    ): Conversation | null {
      const sets: string[] = [];
      const params: (string | number)[] = [];
      if (patch.title !== undefined) {
        sets.push('title = ?');
        params.push(patch.title);
      }
      if (patch.pinned !== undefined) {
        sets.push('pinned = ?');
        params.push(patch.pinned ? 1 : 0);
      }
      if (patch.shared !== undefined) {
        sets.push('shared = ?');
        params.push(patch.shared ? 1 : 0);
      }
      if (patch.touch) {
        sets.push('updated_at = ?');
        params.push(nowIso());
      }
      if (sets.length > 0) {
        db.prepare(`UPDATE conversations SET ${sets.join(', ')} WHERE id = ? AND deleted_at IS NULL`).run(
          ...params,
          id,
        );
      }
      return this.getConversation(id);
    },

    /** Soft delete so the client can offer "Undo". */
    deleteConversation(id: string): boolean {
      const res = db
        .prepare('UPDATE conversations SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL')
        .run(nowIso(), id);
      return Number(res.changes) > 0;
    },

    restoreConversation(id: string): Conversation | null {
      db.prepare('UPDATE conversations SET deleted_at = NULL WHERE id = ?').run(id);
      return this.getConversation(id);
    },

    listMessages(conversationId: string): StoredMessage[] {
      return (
        db
          .prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC, id ASC')
          .all(conversationId) as Row[]
      ).map(toMessage);
    },

    getMessage(id: string): StoredMessage | null {
      const row = db.prepare('SELECT * FROM messages WHERE id = ?').get(id) as Row | undefined;
      return row ? toMessage(row) : null;
    },

    createMessage(input: {
      conversationId: string;
      parentId: string | null;
      role: Role;
      content: string;
      status: MessageStatus;
      attachmentIds?: string[];
      model?: string | null;
      createdAt?: string;
      toolResults?: ToolResult[];
    }): StoredMessage {
      const id = newId(input.role === 'user' ? 'u' : 'a');
      db.prepare(
        `INSERT INTO messages (id, conversation_id, parent_id, role, content, tool_results, attachment_ids, status, model, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        input.conversationId,
        input.parentId,
        input.role,
        input.content,
        JSON.stringify(input.toolResults ?? []),
        JSON.stringify(input.attachmentIds ?? []),
        input.status,
        input.model ?? null,
        input.createdAt ?? nowIso(),
      );
      return this.getMessage(id)!;
    },

    updateMessage(
      id: string,
      patch: {
        content?: string;
        status?: MessageStatus;
        toolResults?: ToolResult[];
        error?: MessageError | null;
        feedback?: Feedback;
        model?: string | null;
        providerTrace?: unknown;
      },
    ): StoredMessage | null {
      const sets: string[] = [];
      const params: (string | null)[] = [];
      const add = (col: string, value: string | null) => {
        sets.push(`${col} = ?`);
        params.push(value);
      };
      if (patch.content !== undefined) add('content', patch.content);
      if (patch.status !== undefined) add('status', patch.status);
      if (patch.toolResults !== undefined) add('tool_results', JSON.stringify(patch.toolResults));
      if (patch.error !== undefined) add('error', patch.error ? JSON.stringify(patch.error) : null);
      if (patch.feedback !== undefined) add('feedback', patch.feedback);
      if (patch.model !== undefined) add('model', patch.model);
      if (patch.providerTrace !== undefined)
        add('provider_trace', patch.providerTrace === null ? null : JSON.stringify(patch.providerTrace));
      if (sets.length > 0) {
        db.prepare(`UPDATE messages SET ${sets.join(', ')} WHERE id = ?`).run(...params, id);
      }
      return this.getMessage(id);
    },

    /** Marks replies left "streaming" by a crash/restart as errored so they can be resumed. */
    recoverInterruptedMessages(): number {
      const res = db
        .prepare(`UPDATE messages SET status = 'error', error = ? WHERE status = 'streaming'`)
        .run(JSON.stringify({ code: 'interrupted', message: 'The server restarted mid-reply.' }));
      return Number(res.changes);
    },

    createAttachment(input: { name: string; mimeType: AttachmentMime; data: Uint8Array }): Attachment {
      const id = newId('f');
      db.prepare(
        'INSERT INTO attachments (id, name, mime_type, size, data, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(id, input.name, input.mimeType, input.data.byteLength, input.data, nowIso());
      return { id, name: input.name, mimeType: input.mimeType, size: input.data.byteLength, url: attachmentUrl(id) };
    },

    getAttachmentData(id: string): { name: string; mimeType: AttachmentMime; data: Uint8Array } | null {
      const row = db.prepare('SELECT name, mime_type, data FROM attachments WHERE id = ?').get(id) as
        | Row
        | undefined;
      if (!row) return null;
      return { name: row.name as string, mimeType: row.mime_type as AttachmentMime, data: row.data as Uint8Array };
    },

    attachmentsExist(ids: string[]): boolean {
      return ids.every((id) => attachmentMeta.get(id) !== undefined);
    },

    /** Strips the server-only provider trace before sending to the browser. */
    toPublic(message: StoredMessage): Message {
      const { providerTrace, ...rest } = message;
      return rest;
    },
  };
}

export type Repository = ReturnType<typeof createRepository>;
