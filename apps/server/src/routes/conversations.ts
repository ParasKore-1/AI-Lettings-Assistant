import {
  ATTACHMENT_MAX_BYTES,
  AttachmentMimeSchema,
  CreateConversationBodySchema,
  ListConversationsQuerySchema,
  PatchConversationBodySchema,
  PatchMessageBodySchema,
  type ConversationWithMessages,
} from '@keyring/shared';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { apiError, parseJson } from '../lib/http';
import type { AppDeps } from '../app';

export function conversationRoutes({ repo }: AppDeps) {
  const app = new Hono();

  app.get('/conversations', (c) => {
    const query = ListConversationsQuerySchema.safeParse(c.req.query());
    if (!query.success) return apiError(c, 400, 'bad_request', query.error.message);
    return c.json(repo.listConversations(query.data));
  });

  app.post('/conversations', async (c) => {
    const body = await parseJson(c, CreateConversationBodySchema);
    if (!body.ok) return apiError(c, 400, 'bad_request', body.message);
    if (body.data.id && repo.getConversation(body.data.id)) {
      return apiError(c, 409, 'conflict', 'Conversation already exists');
    }
    return c.json(repo.createConversation(body.data), 201);
  });

  app.get('/conversations/:id', (c) => {
    const conversation = repo.getConversation(c.req.param('id'));
    if (!conversation) return apiError(c, 404, 'not_found', 'Conversation not found');
    const payload: ConversationWithMessages = {
      conversation,
      messages: repo.listMessages(conversation.id).map(repo.toPublic),
    };
    return c.json(payload);
  });

  app.patch('/conversations/:id', async (c) => {
    const body = await parseJson(c, PatchConversationBodySchema);
    if (!body.ok) return apiError(c, 400, 'bad_request', body.message);
    const updated = repo.updateConversation(c.req.param('id'), body.data);
    if (!updated) return apiError(c, 404, 'not_found', 'Conversation not found');
    return c.json(updated);
  });

  app.delete('/conversations/:id', (c) => {
    if (!repo.deleteConversation(c.req.param('id'))) {
      return apiError(c, 404, 'not_found', 'Conversation not found');
    }
    return c.body(null, 204);
  });

  app.post('/conversations/:id/restore', (c) => {
    const restored = repo.restoreConversation(c.req.param('id'));
    if (!restored) return apiError(c, 404, 'not_found', 'Conversation not found');
    return c.json(restored);
  });

  app.patch('/messages/:id', async (c) => {
    const body = await parseJson(c, PatchMessageBodySchema);
    if (!body.ok) return apiError(c, 400, 'bad_request', body.message);
    const message = repo.getMessage(c.req.param('id'));
    if (!message || message.role !== 'assistant') return apiError(c, 404, 'not_found', 'Message not found');
    return c.json(repo.toPublic(repo.updateMessage(message.id, { feedback: body.data.feedback })!));
  });

  app.get('/share/:id', (c) => {
    const conversation = repo.getConversation(c.req.param('id'));
    if (!conversation || !conversation.shared) {
      return apiError(c, 404, 'not_found', 'This conversation is not shared');
    }
    const payload: ConversationWithMessages = {
      conversation,
      messages: repo.listMessages(conversation.id).map(repo.toPublic),
    };
    return c.json(payload);
  });

  app.post(
    '/attachments',
    bodyLimit({
      maxSize: ATTACHMENT_MAX_BYTES + 64 * 1024,
      onError: (c) => apiError(c, 413, 'too_large', 'File is larger than 5 MB'),
    }),
    async (c) => {
      const form = await c.req.parseBody().catch(() => null);
      const file = form?.['file'];
      if (!(file instanceof File)) return apiError(c, 400, 'bad_request', 'Expected a "file" field');
      const mime = AttachmentMimeSchema.safeParse(file.type);
      if (!mime.success) {
        return apiError(c, 415, 'unsupported_type', 'Only PNG, JPEG, WebP, GIF images and PDFs are allowed');
      }
      if (file.size > ATTACHMENT_MAX_BYTES) return apiError(c, 413, 'too_large', 'File is larger than 5 MB');
      const data = new Uint8Array(await file.arrayBuffer());
      if (!matchesMagicBytes(mime.data, data)) {
        return apiError(c, 415, 'unsupported_type', 'File contents do not match its type');
      }
      const name = file.name.replace(/[\\/\0]/g, '_').slice(0, 255) || 'upload';
      return c.json(repo.createAttachment({ name, mimeType: mime.data, data }), 201);
    },
  );

  app.get('/attachments/:id', (c) => {
    const file = repo.getAttachmentData(c.req.param('id'));
    if (!file) return apiError(c, 404, 'not_found', 'Attachment not found');
    c.header('Content-Type', file.mimeType);
    c.header('Content-Disposition', `inline; filename="${encodeURIComponent(file.name)}"`);
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('Cache-Control', 'private, max-age=31536000, immutable');
    // Images get a locked-down CSP; PDFs need the browser's built-in viewer, which `sandbox` breaks.
    if (file.mimeType.startsWith('image/')) {
      c.header('Content-Security-Policy', "default-src 'none'; img-src 'self'; sandbox");
    }
    return c.body(file.data as Uint8Array<ArrayBuffer>);
  });

  return app;
}

/** Cheap content sniffing so a renamed HTML file can't be served as an "image". */
function matchesMagicBytes(mime: string, d: Uint8Array): boolean {
  const starts = (...bytes: number[]) => bytes.every((b, i) => d[i] === b);
  switch (mime) {
    case 'image/png':
      return starts(0x89, 0x50, 0x4e, 0x47);
    case 'image/jpeg':
      return starts(0xff, 0xd8, 0xff);
    case 'image/gif':
      return starts(0x47, 0x49, 0x46, 0x38);
    case 'image/webp':
      return starts(0x52, 0x49, 0x46, 0x46) && d[8] === 0x57 && d[9] === 0x45 && d[10] === 0x42 && d[11] === 0x50;
    case 'application/pdf':
      return starts(0x25, 0x50, 0x44, 0x46);
    default:
      return false;
  }
}
