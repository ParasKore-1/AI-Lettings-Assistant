export interface SlashCommand {
  command: string;
  title: string;
  description: string;
  /** Text placed in the composer when chosen. */
  template: string;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    command: '/rent-reminder',
    title: 'Rent reminder',
    description: 'Draft a polite, firm reminder for late rent',
    template: '/rent-reminder ',
  },
  {
    command: '/viewing',
    title: 'Book a viewing',
    description: 'Find a property and pick a viewing slot',
    template: '/viewing ',
  },
  {
    command: '/maintenance',
    title: 'Report a repair',
    description: 'Log a maintenance issue and get a ticket',
    template: '/maintenance ',
  },
];

/** Returns matching commands while the composer contains only a slash token. */
export function matchSlashCommands(value: string): SlashCommand[] | null {
  const m = /^\/([\w-]*)$/.exec(value);
  if (!m) return null;
  const q = m[1]!.toLowerCase();
  const found = SLASH_COMMANDS.filter((c) => c.command.slice(1).startsWith(q) || c.title.toLowerCase().includes(q));
  return found;
}
