const URL_REGEX = /(https?:\/\/[^\s<>"']+)/g;

export interface ChatLink {
  url: string;
  messageId: string;
  senderId: string;
  createdAt: Date | null;
}

interface ChatMessageLike {
  id: string;
  senderId: string;
  content?: string;
  createdAt?: any;
  type?: string;
  attachmentUrl?: string;
  attachmentName?: string;
  attachmentType?: string;
}

function toDate(value: any): Date | null {
  if (!value) return null;
  try {
    const d = value.toDate ? value.toDate() : new Date(value);
    return d instanceof Date && !isNaN(d.getTime()) ? d : null;
  } catch {
    return null;
  }
}

export function extractLinksFromMessages(messages: ChatMessageLike[]): ChatLink[] {
  const seen = new Set<string>();
  const links: ChatLink[] = [];

  messages.forEach(msg => {
    if (!msg.content || msg.type === 'call_history') return;
    const matches = msg.content.match(URL_REGEX);
    if (!matches) return;

    matches.forEach(url => {
      const normalized = url.replace(/[.,!?;:]+$/, '');
      if (seen.has(normalized)) return;
      seen.add(normalized);
      links.push({
        url: normalized,
        messageId: msg.id,
        senderId: msg.senderId,
        createdAt: toDate(msg.createdAt),
      });
    });
  });

  return links.reverse();
}
