import * as argon2 from 'argon2';
import { inArray, eq } from 'drizzle-orm';
import { loadDotenv } from '../config/dotenv';
import { createDb } from './client';
import {
  conversations,
  messages,
  participants,
  users,
  workspaceMembers,
  workspaces,
} from './schema';

/** Jeu de données de démo réaliste. Idempotent : peut être relancé sans doublons. */

const people = [
  { email: 'julie@orion.test', displayName: 'Julie Martin' },
  { email: 'camille@orion.test', displayName: 'Camille Leroy' },
  { email: 'leo@orion.test', displayName: 'Léo Dubois' },
  { email: 'sophie@orion.test', displayName: 'Sophie Moreau' },
  { email: 'nathan@orion.test', displayName: 'Nathan Petit' },
  { email: 'thomas@orion.test', displayName: 'Thomas Valeriano' },
  { email: 'damien@orion.test', displayName: 'Damien Lion' },
  { email: 'sasha@orion.test', displayName: 'Sasha Lazrac' },
];

const groupScripts: Record<string, [number, string][]> = {
  général: [
    [0, "Salut l'équipe ! Petit point sur l'avancement du projet à 14h ?"],
    [1, "Ok pour moi, je m'occupe de la partie API aujourd'hui."],
    [2, 'Je finalise les maquettes et je les partage dans #design.'],
    [3, 'Parfait, on synchronise à 14h.'],
  ],
  design: [
    [2, 'Nouvelle version de la landing en ligne, retours bienvenus 🙏'],
    [4, 'Le hero est top. Le pricing manque un peu de contraste sur mobile.'],
    [2, 'Bien vu, je corrige ça.'],
  ],
  dev: [
    [1, 'La CI est verte sur main 🎉'],
    [5, "J'ouvre une PR pour la pagination des messages."],
    [3, 'Je la review dans la foulée.'],
  ],
};

async function main() {
  loadDotenv();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL est obligatoire');
  const { db, pool } = createDb(url);

  await db.transaction(async (tx) => {
    await tx.delete(workspaces).where(eq(workspaces.slug, 'agence-orion'));
    await tx.delete(users).where(
      inArray(
        users.email,
        people.map((p) => p.email),
      ),
    );

    const passwordHash = await argon2.hash('demo1234');
    const created = await tx
      .insert(users)
      .values(people.map((p) => ({ ...p, passwordHash })))
      .returning();
    const u = (i: number) => created[i]!;

    const [ws] = await tx
      .insert(workspaces)
      .values({ name: 'Agence Orion', slug: 'agence-orion', plan: 'PRO' })
      .returning();
    await tx.insert(workspaceMembers).values(
      created.map((user, i) => ({
        workspaceId: ws!.id,
        userId: user.id,
        role: i === 0 ? ('OWNER' as const) : i === 1 ? ('ADMIN' as const) : ('MEMBER' as const),
      })),
    );

    const start = Date.now() - 3 * 60 * 60 * 1000;
    let tick = 0;
    const nextDate = () => new Date(start + tick++ * 4 * 60 * 1000);

    async function addConversation(
      data: typeof conversations.$inferInsert,
      members: number[],
      lines: [number, string][],
    ) {
      const [conv] = await tx.insert(conversations).values(data).returning();
      await tx.insert(participants).values(
        members.map((i) => ({
          conversationId: conv!.id,
          userId: u(i).id,
          role: i === 0 ? ('ADMIN' as const) : ('MEMBER' as const),
        })),
      );
      let last = new Date();
      for (const [author, content] of lines) {
        last = nextDate();
        await tx
          .insert(messages)
          .values({ conversationId: conv!.id, authorId: u(author).id, content, createdAt: last });
      }
      await tx
        .update(conversations)
        .set({ lastMessageAt: last })
        .where(eq(conversations.id, conv!.id));
    }

    const everyone = created.map((_, i) => i);
    for (const [name, lines] of Object.entries(groupScripts)) {
      await addConversation(
        { workspaceId: ws!.id, type: 'GROUP', name, createdById: u(0).id },
        everyone,
        lines,
      );
    }

    const [a, b] = [u(0).id, u(1).id].sort();
    await addConversation(
      { workspaceId: ws!.id, type: 'DIRECT', directKey: `${a}:${b}`, createdById: u(0).id },
      [0, 1],
      [
        [0, "Tu as deux minutes pour regarder le schéma d'archi ?"],
        [1, 'Oui, envoie-le moi. On en parle avant le point de 14h.'],
      ],
    );
  });

  await pool.end();
  console.warn(`Seed terminé : ${people.length} utilisateurs, mot de passe « demo1234 ».`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
