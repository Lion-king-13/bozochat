import { MESSAGE_MAX_LENGTH, messageContentSchema } from '@bozochat/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { toast } from 'sonner';
import {
  conversationsKey,
  errorMessage,
  upsertMessageInCache,
  useSendMessage,
} from '../../lib/conversations';
import { sendMessage, type AppSocket } from '../../lib/socket';

type Props = { conversationId: string; socket: AppSocket | null; connected: boolean };

/** Le compteur n'apparaît qu'à l'approche de la limite, pour ne pas alourdir la saisie. */
const COUNTER_FROM = Math.floor(MESSAGE_MAX_LENGTH * 0.9);

export function MessageComposer({ conversationId, socket, connected }: Props) {
  const qc = useQueryClient();
  const restSend = useSendMessage(conversationId);
  const [content, setContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  /**
   * Temps réel quand le socket est connecté, REST sinon. Dans les deux cas le message renvoyé
   * passe par `upsertMessageInCache` : `message:new` peut arriver avant ou après, la
   * déduplication sur l'id rend l'ordre indifférent.
   */
  async function submit() {
    if (sending) return;
    const parsed = messageContentSchema.safeParse(content);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Le message ne peut pas être vide.');
      return;
    }
    setError(null);
    setSending(true);
    try {
      if (socket && connected) {
        const ack = await sendMessage(socket, { conversationId, content: parsed.data });
        if (!ack.ok) {
          toast.error(ack.error.message); // le texte saisi est conservé pour réessayer
          return;
        }
        upsertMessageInCache(qc, ack.message);
        void qc.invalidateQueries({ queryKey: conversationsKey });
      } else {
        await restSend.mutateAsync(parsed.data);
      }
      setContent(''); // vidé seulement après un envoi réussi
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSending(false);
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit();
  }

  /** Entrée envoie, Maj+Entrée insère un retour à la ligne (jamais pendant une saisie IME). */
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit();
    }
  }

  return (
    <form onSubmit={onSubmit} className="border-t border-stone-200 bg-white p-3">
      {error && (
        <p role="alert" className="mb-2 text-sm text-red-600">
          {error}
        </p>
      )}
      <div className="flex items-end gap-2">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          maxLength={MESSAGE_MAX_LENGTH}
          aria-label="Votre message"
          aria-invalid={Boolean(error)}
          placeholder="Écrivez un message…"
          className={`max-h-40 w-full resize-none rounded-lg border bg-white px-3 py-2 outline-none transition focus:ring-2 focus:ring-brand-400 ${
            error ? 'border-red-500' : 'border-stone-300'
          }`}
        />
        <button
          type="submit"
          disabled={sending}
          className="shrink-0 rounded-lg bg-ink px-4 py-2 font-medium text-white hover:bg-stone-800 disabled:opacity-60"
        >
          {sending ? 'Envoi…' : 'Envoyer'}
        </button>
      </div>
      {content.length >= COUNTER_FROM && (
        <p
          className={`mt-1 text-right text-xs ${
            content.length >= MESSAGE_MAX_LENGTH ? 'text-red-600' : 'text-stone-500'
          }`}
        >
          {content.length} / {MESSAGE_MAX_LENGTH}
        </p>
      )}
    </form>
  );
}
