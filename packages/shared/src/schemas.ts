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

export const registerSchema = z.object({
  email: emailSchema,
  displayName: z
    .string({ error: 'Le nom affiché est obligatoire.' })
    .trim()
    .min(2, { error: 'Le nom affiché doit contenir au moins 2 caractères.' })
    .max(60, { error: 'Le nom affiché ne peut pas dépasser 60 caractères.' }),
  password: passwordSchema,
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, { error: 'Le mot de passe est obligatoire.' }),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const MESSAGE_MAX_LENGTH = 4000;

export const sendMessageSchema = z.object({
  conversationId: z.uuid({ error: 'Conversation invalide.' }),
  content: z
    .string()
    .trim()
    .min(1, { error: 'Le message ne peut pas être vide.' })
    .max(MESSAGE_MAX_LENGTH, {
      error: `Le message ne peut pas dépasser ${MESSAGE_MAX_LENGTH} caractères.`,
    }),
});
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
