import { z } from 'zod';

/**
 * Schémas de validation partagés entre le front (formulaires) et le back (API / WebSocket).
 * Une seule source de vérité : les messages d'erreur affichés sont les mêmes des deux côtés.
 */

export const emailSchema = z
  .string({ error: "L'adresse e-mail est obligatoire." })
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: "L'adresse e-mail n'est pas valide." }));

export const passwordSchema = z
  .string({ error: 'Le mot de passe est obligatoire.' })
  .min(8, { error: 'Le mot de passe doit contenir au moins 8 caractères.' })
  .max(128, { error: 'Le mot de passe ne peut pas dépasser 128 caractères.' });

export const displayNameSchema = z
  .string({ error: 'Le nom affiché est obligatoire.' })
  .trim()
  .min(2, { error: 'Le nom affiché doit contenir au moins 2 caractères.' })
  .max(60, { error: 'Le nom affiché ne peut pas dépasser 60 caractères.' });

export const registerSchema = z.object({
  email: emailSchema,
  displayName: displayNameSchema,
  password: passwordSchema,
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, { error: 'Le mot de passe est obligatoire.' }),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const MESSAGE_MAX_LENGTH = 4000;

/** Identifiant de conversation — validé aussi bien dans une URL que dans un payload WebSocket. */
export const conversationIdSchema = z.uuid({ error: 'Conversation invalide.' });

/** Règles de contenu d'un message, partagées par le REST, le WebSocket et le front. */
export const messageContentSchema = z
  .string({ error: 'Le message ne peut pas être vide.' })
  .trim()
  .min(1, { error: 'Le message ne peut pas être vide.' })
  .max(MESSAGE_MAX_LENGTH, {
    error: `Le message ne peut pas dépasser ${MESSAGE_MAX_LENGTH} caractères.`,
  });

/** Payload de l'événement WebSocket `message:send` (la conversation est dans le payload). */
export const sendMessageSchema = z.object({
  conversationId: conversationIdSchema,
  content: messageContentSchema,
});
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

/** Corps de `POST /api/conversations/:id/messages` (la conversation est dans l'URL). */
export const createMessageSchema = z.object({ content: messageContentSchema });
export type CreateMessageInput = z.infer<typeof createMessageSchema>;

export const MESSAGES_PAGE_SIZE = 50;
export const MESSAGES_PAGE_MAX = 100;

/** Query string de `GET /api/conversations/:id/messages` — pagination par curseur. */
export const messagesQuerySchema = z.object({
  cursor: z
    .string({ error: 'Curseur de pagination invalide.' })
    .trim()
    .min(1, { error: 'Curseur de pagination invalide.' })
    .max(200, { error: 'Curseur de pagination invalide.' })
    .optional(),
  limit: z.coerce
    .number({ error: 'La limite doit être un nombre entier.' })
    .int({ error: 'La limite doit être un nombre entier.' })
    .min(1, { error: 'La limite doit être au minimum de 1.' })
    .max(MESSAGES_PAGE_MAX, { error: `La limite ne peut pas dépasser ${MESSAGES_PAGE_MAX}.` })
    .default(MESSAGES_PAGE_SIZE),
});
export type MessagesQueryInput = z.infer<typeof messagesQuerySchema>;

/** Longueur maximale d'une adresse de photo de profil. */
export const AVATAR_URL_MAX_LENGTH = 2048;

/**
 * Adresse de la photo de profil ; `null` retire la photo.
 * Le protocole est restreint à http(s) : une URL `javascript:` ne doit jamais atteindre le rendu.
 */
export const avatarUrlSchema = z
  .string({ error: "L'adresse de la photo n'est pas valide." })
  .trim()
  .max(AVATAR_URL_MAX_LENGTH, { error: "L'adresse de la photo est trop longue." })
  .pipe(z.url({ protocol: /^https?$/, error: "L'adresse de la photo n'est pas valide." }))
  .nullable();

/** Corps de `PATCH /api/users/me` : les deux champs sont indépendants et facultatifs. */
export const updateProfileSchema = z.object({
  displayName: displayNameSchema.optional(),
  avatarUrl: avatarUrlSchema.optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/** Le mot de passe actuel est exigé pour tout changement d'identifiant de connexion. */
export const currentPasswordSchema = z
  .string({ error: 'Le mot de passe actuel est obligatoire.' })
  .min(1, { error: 'Le mot de passe actuel est obligatoire.' });

/** Corps de `PATCH /api/users/me/email`. */
export const changeEmailSchema = z.object({
  email: emailSchema,
  currentPassword: currentPasswordSchema,
});
export type ChangeEmailInput = z.infer<typeof changeEmailSchema>;

/** Corps de `PATCH /api/users/me/password`. */
export const changePasswordSchema = z.object({
  currentPassword: currentPasswordSchema,
  newPassword: passwordSchema,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
