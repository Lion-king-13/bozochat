import { describe, expect, it } from 'vitest';
import { registerSchema, sendMessageSchema } from './schemas';

describe('registerSchema', () => {
  it('normalise l’e-mail', () => {
    const r = registerSchema.parse({
      email: '  Alice@Example.COM ',
      displayName: 'Alice',
      password: 'motdepasse',
    });
    expect(r.email).toBe('alice@example.com');
  });

  it('refuse un mot de passe trop court avec un message clair', () => {
    const r = registerSchema.safeParse({ email: 'a@b.be', displayName: 'Al', password: '123' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe(
      'Le mot de passe doit contenir au moins 8 caractères.',
    );
  });
});

describe('sendMessageSchema', () => {
  const conversationId = '3f2a8c1e-4b5d-4e6f-8a9b-0c1d2e3f4a5b';

  it('refuse un message vide (espaces uniquement)', () => {
    expect(sendMessageSchema.safeParse({ conversationId, content: '   ' }).success).toBe(false);
  });

  it('refuse un message trop long', () => {
    const content = 'a'.repeat(4001);
    expect(sendMessageSchema.safeParse({ conversationId, content }).success).toBe(false);
  });

  it('conserve le HTML tel quel (l’échappement se fait à l’affichage)', () => {
    const r = sendMessageSchema.parse({ conversationId, content: '<script>x</script>' });
    expect(r.content).toBe('<script>x</script>');
  });
});
