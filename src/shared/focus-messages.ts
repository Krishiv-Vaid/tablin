/** Friendly, varied completion messages (stable per session id, so a re-render never changes it). */
const MESSAGES = [
  'You did it!',
  'Another little victory!',
  'Look at you go!',
  "That's {m} minutes of pure focus!",
  '{name} is proud of you!',
  'Focus session complete!',
  'Nailed it!',
];

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function completionMessage(sessionId: string, minutes: number, name: string): string {
  const template = MESSAGES[hash(sessionId) % MESSAGES.length]!;
  return template.replace('{m}', String(minutes)).replace('{name}', name);
}

export const ALL_COMPLETION_MESSAGES = MESSAGES;
