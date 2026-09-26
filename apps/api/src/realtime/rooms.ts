/**
 * Noms des rooms Socket.IO.
 * Fichier volontairement sans dépendance : utilisable depuis la gateway comme depuis
 * un service métier, sans créer de dépendance circulaire entre modules.
 */

export const userRoom = (userId: string) => `user:${userId}`;
export const conversationRoom = (conversationId: string) => `conversation:${conversationId}`;
