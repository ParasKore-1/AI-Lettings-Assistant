import { CalendarClock, FileText, Home, ShieldCheck, Wrench, type LucideIcon } from 'lucide-react';

/** Prompt chips shown on the empty state (lettings-specific starting points). */
export interface Suggestion {
  icon: LucideIcon;
  title: string;
  prompt: string;
}

export const SUGGESTIONS: Suggestion[] = [
  { icon: FileText, title: 'Draft a rent reminder', prompt: '/rent-reminder Rent for Flat 4 is 10 days late' },
  { icon: ShieldCheck, title: 'What deposit protection rules apply?', prompt: 'What deposit protection rules apply?' },
  { icon: CalendarClock, title: 'Book a viewing', prompt: 'Book a viewing for Wrenfield Road' },
  { icon: Wrench, title: 'Report a broken boiler', prompt: 'My boiler has stopped working and there is no hot water' },
  { icon: Home, title: 'Find a 2-bed flat in Bristol', prompt: 'Find me a 2-bed flat in Bristol under £1,500' },
];
