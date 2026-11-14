import { z } from 'zod';

/* ------------------------------------------------------------------ */
/* Primitives                                                          */
/* ------------------------------------------------------------------ */

export const IdSchema = z.string().min(1).max(64);
export const IsoDateSchema = z.string().datetime({ offset: true });

export const RoleSchema = z.enum(['user', 'assistant', 'system']);
export type Role = z.infer<typeof RoleSchema>;

/**
 * - streaming: assistant reply currently being generated
 * - complete:  finished normally
 * - stopped:   the user pressed Stop (partial text kept)
 * - error:     the stream failed (partial text kept, can be resumed)
 */
export const MessageStatusSchema = z.enum(['streaming', 'complete', 'stopped', 'error']);
export type MessageStatus = z.infer<typeof MessageStatusSchema>;

export const FeedbackSchema = z.enum(['up', 'down']).nullable();
export type Feedback = z.infer<typeof FeedbackSchema>;

export const ResponseModeSchema = z.enum(['fast', 'balanced', 'thorough']);
export type ResponseMode = z.infer<typeof ResponseModeSchema>;

/* ------------------------------------------------------------------ */
/* Attachments                                                         */
/* ------------------------------------------------------------------ */

export const ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
export const ATTACHMENT_MAX_COUNT = 4;
export const ATTACHMENT_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/pdf',
] as const;
export const AttachmentMimeSchema = z.enum(ATTACHMENT_MIME_TYPES);
export type AttachmentMime = z.infer<typeof AttachmentMimeSchema>;

export const AttachmentSchema = z.object({
  id: IdSchema,
  name: z.string().min(1).max(255),
  mimeType: AttachmentMimeSchema,
  size: z.number().int().nonnegative().max(ATTACHMENT_MAX_BYTES),
  url: z.string(),
});
export type Attachment = z.infer<typeof AttachmentSchema>;

/* ------------------------------------------------------------------ */
/* Tool results (structured cards)                                     */
/* ------------------------------------------------------------------ */

export const EpcRatingSchema = z.enum(['A', 'B', 'C', 'D', 'E', 'F', 'G']);
export type EpcRating = z.infer<typeof EpcRatingSchema>;

export const PropertySchema = z.object({
  id: IdSchema,
  title: z.string(),
  address: z.string(),
  area: z.string(),
  rentPcm: z.number().int().positive(),
  beds: z.number().int().nonnegative(),
  baths: z.number().int().nonnegative(),
  epcRating: EpcRatingSchema,
  furnished: z.enum(['furnished', 'part-furnished', 'unfurnished']),
  availableFrom: z.string(),
  imageUrl: z.string().nullable(),
  tags: z.array(z.string()).max(6),
});
export type Property = z.infer<typeof PropertySchema>;

export const ViewingSlotSchema = z.object({
  id: IdSchema,
  start: IsoDateSchema,
  end: IsoDateSchema,
  available: z.boolean(),
});
export type ViewingSlot = z.infer<typeof ViewingSlotSchema>;

export const MaintenanceTicketSchema = z.object({
  id: IdSchema,
  reference: z.string(),
  title: z.string(),
  category: z.enum(['plumbing', 'heating', 'electrical', 'damp-mould', 'appliance', 'other']),
  priority: z.enum(['low', 'medium', 'high', 'emergency']),
  status: z.enum(['open', 'scheduled', 'resolved']),
  address: z.string(),
  description: z.string(),
  createdAt: IsoDateSchema,
  nextStep: z.string(),
});
export type MaintenanceTicket = z.infer<typeof MaintenanceTicketSchema>;

/** Character offset in the reply text where the card was emitted (keeps cards inline). */
const OffsetSchema = z.number().int().nonnegative().optional();

export const ToolResultSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('property_cards'),
    id: IdSchema,
    offset: OffsetSchema,
    properties: z.array(PropertySchema).min(1).max(6),
  }),
  z.object({
    kind: z.literal('viewing_slots'),
    id: IdSchema,
    offset: OffsetSchema,
    propertyId: IdSchema,
    propertyTitle: z.string(),
    slots: z.array(ViewingSlotSchema).min(1).max(12),
  }),
  z.object({
    kind: z.literal('maintenance_ticket'),
    id: IdSchema,
    offset: OffsetSchema,
    ticket: MaintenanceTicketSchema,
  }),
]);
export type ToolResult = z.infer<typeof ToolResultSchema>;
export type ToolResultKind = ToolResult['kind'];

/* ------------------------------------------------------------------ */
/* Messages & conversations                                            */
/* ------------------------------------------------------------------ */

export const MessageErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
});
export type MessageError = z.infer<typeof MessageErrorSchema>;

export const MessageSchema = z.object({
  id: IdSchema,
  conversationId: IdSchema,
  /** Messages form a tree: edit-and-resend and regenerate create siblings. */
  parentId: IdSchema.nullable(),
  role: RoleSchema,
  content: z.string(),
  toolResults: z.array(ToolResultSchema),
  attachments: z.array(AttachmentSchema),
  status: MessageStatusSchema,
  feedback: FeedbackSchema,
  error: MessageErrorSchema.nullable(),
  model: z.string().nullable(),
  createdAt: IsoDateSchema,
});
export type Message = z.infer<typeof MessageSchema>;

export const ConversationSchema = z.object({
  id: IdSchema,
  title: z.string(),
  pinned: z.boolean(),
  shared: z.boolean(),
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
  preview: z.string(),
});
export type Conversation = z.infer<typeof ConversationSchema>;

export const ConversationWithMessagesSchema = z.object({
  conversation: ConversationSchema,
  messages: z.array(MessageSchema),
});
export type ConversationWithMessages = z.infer<typeof ConversationWithMessagesSchema>;

/* ------------------------------------------------------------------ */
/* REST payloads                                                       */
/* ------------------------------------------------------------------ */

export const ConversationPageSchema = z.object({
  items: z.array(ConversationSchema),
  nextCursor: z.string().nullable(),
});
export type ConversationPage = z.infer<typeof ConversationPageSchema>;

export const ListConversationsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  q: z.string().max(200).optional(),
});

export const CreateConversationBodySchema = z.object({
  id: IdSchema.optional(),
  title: z.string().trim().min(1).max(120).optional(),
});
export type CreateConversationBody = z.infer<typeof CreateConversationBodySchema>;

export const PatchConversationBodySchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    pinned: z.boolean().optional(),
    shared: z.boolean().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, 'Nothing to update');
export type PatchConversationBody = z.infer<typeof PatchConversationBodySchema>;

export const PatchMessageBodySchema = z.object({ feedback: FeedbackSchema });
export type PatchMessageBody = z.infer<typeof PatchMessageBodySchema>;

export const MESSAGE_MAX_CHARS = 4000;

/**
 * One endpoint, three intents:
 * - send:       new user message appended under `parentId` (null = first message)
 * - regenerate: new assistant reply for an existing user message
 * - resume:     continue a stopped/errored assistant message, keeping its partial text
 *
 * Edit-and-resend is a `send` whose parentId is the edited message's parent,
 * which creates a sibling branch.
 */
export const SendMessageBodySchema = z.discriminatedUnion('intent', [
  z.object({
    intent: z.literal('send'),
    content: z.string().trim().min(1).max(MESSAGE_MAX_CHARS),
    parentId: IdSchema.nullable(),
    attachmentIds: z.array(IdSchema).max(ATTACHMENT_MAX_COUNT).default([]),
    model: z.string().optional(),
    mode: ResponseModeSchema.default('balanced'),
  }),
  z.object({
    intent: z.literal('regenerate'),
    userMessageId: IdSchema,
    model: z.string().optional(),
    mode: ResponseModeSchema.default('balanced'),
  }),
  z.object({
    intent: z.literal('resume'),
    assistantMessageId: IdSchema,
    model: z.string().optional(),
    mode: ResponseModeSchema.default('balanced'),
  }),
]);
export type SendMessageBody = z.input<typeof SendMessageBodySchema>;
export type SendMessageBodyParsed = z.output<typeof SendMessageBodySchema>;

export const ModelInfoSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string(),
  provider: z.enum(['mock', 'anthropic']),
});
export type ModelInfo = z.infer<typeof ModelInfoSchema>;

export const ModelsResponseSchema = z.object({
  models: z.array(ModelInfoSchema),
  defaultModel: z.string(),
  debugEnabled: z.boolean(),
});
export type ModelsResponse = z.infer<typeof ModelsResponseSchema>;

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    retryAfterMs: z.number().int().nonnegative().optional(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const DebugModeSchema = z.enum([
  'normal',
  'slow',
  /** Server drops the connection mid-reply (client sees a network error). */
  'fail_mid_stream',
  /** Provider reports an error mid-reply via an `error` event. */
  'provider_error',
  'server_error',
  'rate_limit',
]);
export type DebugMode = z.infer<typeof DebugModeSchema>;

export const DebugBodySchema = z.object({
  mode: DebugModeSchema,
  /** If true (default) the mode applies to the next stream only. */
  once: z.boolean().default(true),
});
export type DebugBody = z.input<typeof DebugBodySchema>;

/* ------------------------------------------------------------------ */
/* Stream events (SSE `data:` payloads)                                */
/* ------------------------------------------------------------------ */

export const StreamErrorCodeSchema = z.enum([
  'rate_limited',
  'provider_error',
  'internal',
  'bad_request',
  'not_found',
]);
export type StreamErrorCode = z.infer<typeof StreamErrorCodeSchema>;

export const StreamEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('message_start'),
    /** The user message that was created (absent for regenerate/resume). */
    userMessage: MessageSchema.nullable(),
    /** The assistant message being generated, with any resumed prefix as `content`. */
    assistantMessage: MessageSchema,
  }),
  z.object({
    type: z.literal('text_delta'),
    messageId: IdSchema,
    delta: z.string(),
  }),
  z.object({
    type: z.literal('tool_result'),
    messageId: IdSchema,
    result: ToolResultSchema,
  }),
  z.object({
    type: z.literal('message_end'),
    message: MessageSchema,
    conversation: ConversationSchema,
  }),
  z.object({
    type: z.literal('error'),
    messageId: IdSchema.nullable(),
    code: StreamErrorCodeSchema,
    message: z.string(),
    retryable: z.boolean(),
    retryAfterMs: z.number().int().nonnegative().optional(),
  }),
]);
export type StreamEvent = z.infer<typeof StreamEventSchema>;
export type StreamEventType = StreamEvent['type'];
export type StreamEventOf<T extends StreamEventType> = Extract<StreamEvent, { type: T }>;
