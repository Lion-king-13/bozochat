import { BadRequestException } from '@nestjs/common';

/**
 * Curseur de pagination de l'historique : couple (createdAt, id).
 * L'id sert de départage pour un ordre stable quand deux messages partagent le même horodatage.
 * Encodé en base64url : opaque côté client, donc non manipulable comme un offset.
 */
export interface MessageCursor {
  createdAt: Date;
  id: string;
}

const SEPARATOR = '|';
const CURSOR_PATTERN = /^(.+)\|([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export function encodeCursor(message: MessageCursor): string {
  return Buffer.from(`${message.createdAt.toISOString()}${SEPARATOR}${message.id}`).toString(
    'base64url',
  );
}

export function decodeCursor(raw: string): MessageCursor {
  const match = CURSOR_PATTERN.exec(Buffer.from(raw, 'base64url').toString('utf8'));
  const createdAt = match ? new Date(match[1]!) : null;
  if (!createdAt || Number.isNaN(createdAt.getTime())) {
    throw new BadRequestException({
      message: 'Curseur de pagination invalide.',
      fieldErrors: { cursor: 'Curseur de pagination invalide.' },
    });
  }
  return { createdAt, id: match![2]! };
}
