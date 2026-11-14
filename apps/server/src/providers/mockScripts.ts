import type { Attachment, ToolResult } from '@keyring/shared';
import { createRng, hashString } from '../lib/util';
import {
  findProperty,
  maintenanceTicketResult,
  propertyCardsResult,
  searchProperties,
  viewingSlotsResult,
} from './fixtures';

export type Segment = { text: string } | { tool: ToolResult };

export interface MockScript {
  intent: Intent;
  title: string;
  segments: Segment[];
}

export type Intent =
  | 'rent_reminder'
  | 'deposit'
  | 'viewing'
  | 'search'
  | 'maintenance'
  | 'compliance'
  | 'pro_rata'
  | 'xss_demo'
  | 'long'
  | 'greeting'
  | 'general';

const RULES: [Intent, RegExp][] = [
  ['xss_demo', /\b(xss|script tag|raw html|sanitis|sanitiz)/],
  ['rent_reminder', /^\/rent-reminder|rent reminder|arrears|late rent|overdue rent|chase.*rent/],
  ['maintenance', /^\/maintenance|repair|maintenance|boiler|leak|mould|mold|damp|broken|no hot water|heating/],
  ['viewing', /^\/viewing|viewing|book a visit|see the (flat|house|property)/],
  ['deposit', /deposit|tdp|protection scheme|prescribed information/],
  ['pro_rata', /pro[- ]?rata|calculate|formula|code|typescript|csv|spreadsheet/],
  ['compliance', /gas safety|eicr|epc|compliance|checklist|right to rent|smoke alarm/],
  ['search', /\b(find|search|looking for|show me)\b.*\b(flat|house|home|studio|bed|property|properties)|\b\d\s?-?bed/],
  ['long', /\b(everything|complete guide|in detail|long answer|essay)\b/],
  ['greeting', /^(hi|hello|hey|good (morning|afternoon|evening))\b/],
];

export function detectIntent(text: string): Intent {
  const t = text.toLowerCase().trim();
  for (const [intent, re] of RULES) if (re.test(t)) return intent;
  return 'general';
}

export function titleFor(intent: Intent, userText: string): string {
  const titles: Partial<Record<Intent, string>> = {
    rent_reminder: 'Rent reminder draft',
    deposit: 'Deposit protection rules',
    viewing: 'Booking a viewing',
    maintenance: 'Maintenance request',
    compliance: 'Landlord compliance checklist',
    pro_rata: 'Pro-rata rent calculation',
    xss_demo: 'HTML sanitisation demo',
  };
  return titles[intent] ?? heuristicTitle(userText);
}

export function heuristicTitle(text: string): string {
  const cleaned = text
    .replace(/^\/[\w-]+\s*/, '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/[^\p{L}\p{N}£$%'’ -]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return 'New chat';
  const words = cleaned.split(' ').slice(0, 6).join(' ');
  const title = words.length > 48 ? `${words.slice(0, 47).trimEnd()}…` : words;
  return title.charAt(0).toUpperCase() + title.slice(1);
}

const DISCLAIMER =
  '\n\n> Keyring gives general information about lettings in England, not legal advice. Check current guidance on GOV.UK or speak to a qualified adviser for your situation.';

function attachmentNote(attachments: Attachment[]): string {
  if (attachments.length === 0) return '';
  const list = attachments
    .map((a) => `**${a.name}** (${a.mimeType === 'application/pdf' ? 'PDF' : 'image'})`)
    .join(', ');
  return `Thanks — I've received ${list}. In mock mode I can't read file contents, but here's how I'd help:\n\n`;
}

export function buildMockScript(input: {
  userText: string;
  attachments: Attachment[];
  seed: string;
}): MockScript {
  const intent = detectIntent(input.userText);
  const rng = createRng(hashString(input.seed));
  const lead = attachmentNote(input.attachments);
  const segments = SCRIPTS[intent]({ ...input, rng });
  if (lead && segments[0] && 'text' in segments[0]) segments[0] = { text: lead + segments[0].text };
  return { intent, title: titleFor(intent, input.userText), segments };
}

type Ctx = { userText: string; seed: string; rng: ReturnType<typeof createRng> };

const SCRIPTS: Record<Intent, (ctx: Ctx) => Segment[]> = {
  greeting: ({ rng }) => [
    {
      text: `${rng.pick(['Hi there!', 'Hello!', 'Hey — good to see you.'])} I'm **Keyring**, an assistant for tenants, landlords and letting agents.

I can help you:

- draft letters and reminders (rent, renewals, notices)
- explain rules like **deposit protection** and safety certificates
- find homes and **book viewings**
- log and triage **maintenance requests**

What would you like to do?`,
    },
  ],

  rent_reminder: () => [
    {
      text: `Here's a friendly, firm reminder you can adapt. It keeps the tone polite for a first reminder while making the amount and deadline unambiguous.

---

**Subject:** Rent reminder — [Property address]

Dear [Tenant name],

I hope you're well. Our records show that the rent due on **[due date]** hasn't been received yet:

| Period | Amount due | Received | Outstanding |
| --- | ---: | ---: | ---: |
| [Month] rent | £1,450.00 | £0.00 | **£1,450.00** |

Could you please make the payment by **[date — 7 days from today]** to the usual account, or reply to let me know when you expect to pay? If something has changed and you're struggling, please tell me early — we can talk through a short repayment plan.

Kind regards,
[Your name]
[Agency / landlord contact details]

---

**Tips**

1. **Keep it factual.** Stick to dates and amounts; avoid assumptions about why the payment is late.
2. **Put it in writing.** Email or letter gives you a dated record if arrears continue.
3. **Escalate gradually.** A second reminder after 7 days, then a formal arrears letter, before considering any legal step.
4. **Signpost support.** Mentioning that help is available often gets a faster reply than a stern tone.

Want me to draft the **second reminder** or a **repayment plan** template next?`,
    },
  ],

  deposit: () => [
    {
      text: `## Tenancy deposit protection (England)

If you take a deposit for an **assured shorthold tenancy**, the core rules are:

1. **Protect it within 30 days** in a government-approved scheme — the [Deposit Protection Service, mydeposits or the Tenancy Deposit Scheme](https://www.gov.uk/tenancy-deposit-protection).
2. **Give the tenant the prescribed information** within the same 30 days: which scheme holds it, how to get it back, and how disputes are handled.
3. **Respect the cap** set by the Tenant Fees Act 2019:

| Annual rent | Maximum deposit |
| --- | --- |
| Under £50,000 | 5 weeks' rent |
| £50,000 or more | 6 weeks' rent |

4. **Return it promptly** — agree any deductions in writing; disputed amounts go to the scheme's free dispute service.

### What happens if it isn't protected?

- The tenant can apply to court, which can order you to repay the deposit **plus compensation of 1–3× the deposit**.
- Your ability to regain possession using certain notices can be restricted until it's resolved.

### Quick worked example

For rent of **£1,450 pcm**, the weekly rent is \`1,450 × 12 ÷ 52 = £334.62\`, so the 5-week cap is **£1,673.08**.${DISCLAIMER}`,
    },
  ],

  viewing: ({ seed, userText }) => {
    const property =
      PROPERTIES_BY_WORD(userText) ?? findProperty('prop_wrenfield_4') ?? searchProperties({})[0]!;
    return [
      { text: `Happy to set that up. Here's the property I think you mean:\n\n` },
      { tool: propertyCardsResult([property], `${seed}:viewing-prop`) },
      {
        text: `\n\nThese are the next available **30-minute viewing slots**. Pick one and I'll confirm it with the agent — greyed-out slots are already taken.\n\n`,
      },
      { tool: viewingSlotsResult(property, seed) },
      {
        text: `\n\n**Before the viewing**

- Bring photo ID — you'll need it later for **Right to Rent** checks.
- Ask about the **EPC rating**, council tax band and typical bills.
- Check water pressure, signs of damp, and mobile signal in each room.`,
      },
    ];
  },

  search: ({ seed, userText }) => {
    const beds = /(\d)\s?-?bed/.exec(userText.toLowerCase())?.[1];
    const max = /£\s?([\d,]{3,6})/.exec(userText)?.[1];
    const area = ['bristol', 'leeds', 'manchester', 'nottingham'].find((a) =>
      userText.toLowerCase().includes(a),
    );
    const results = searchProperties({
      area,
      minBeds: beds ? Number(beds) : undefined,
      maxRentPcm: max ? Number(max.replace(/,/g, '')) : undefined,
    });
    return [
      {
        text: `I found **${results.length} homes** that match${area ? ` in **${capitalise(area)}**` : ''}. All listings here are fictional demo data.\n\n`,
      },
      { tool: propertyCardsResult(results, `${seed}:search`) },
      {
        text: `\n\n| Home | Rent (pcm) | Beds | EPC |
| --- | ---: | :---: | :---: |
${results.map((p) => `| ${p.title} | £${p.rentPcm.toLocaleString('en-GB')} | ${p.beds === 0 ? 'Studio' : p.beds} | ${p.epcRating} |`).join('\n')}

Would you like to **book a viewing** for any of these, or narrow it down by budget or move-in date?`,
      },
    ];
  },

  maintenance: ({ seed, userText }) => {
    const t = userText.toLowerCase();
    const category = /boiler|heating|hot water/.test(t)
      ? 'heating'
      : /leak|tap|toilet|pipe/.test(t)
        ? 'plumbing'
        : /mould|mold|damp/.test(t)
          ? 'damp-mould'
          : /socket|electric|light|fuse/.test(t)
            ? 'electrical'
            : /oven|fridge|washing|dishwasher/.test(t)
              ? 'appliance'
              : 'other';
    const priority =
      /no (heat|hot water)|gas smell|flood|sparks|burst/.test(t)
        ? 'emergency'
        : category === 'heating' || category === 'plumbing'
          ? 'high'
          : category === 'damp-mould'
            ? 'medium'
            : 'low';
    const titles: Record<string, string> = {
      heating: 'Boiler not providing heating or hot water',
      plumbing: 'Water leak reported',
      'damp-mould': 'Damp and mould in property',
      electrical: 'Electrical fault reported',
      appliance: 'Appliance not working',
      other: 'General repair request',
    };
    return [
      {
        text: `Sorry you're dealing with that. I've logged it so it doesn't get lost — here's the ticket:\n\n`,
      },
      {
        tool: maintenanceTicketResult(
          {
            title: titles[category]!,
            category,
            priority,
            address: 'Flat 4, 27 Wrenfield Road',
            description: userText.replace(/^\/maintenance\s*/, '').trim() || 'Reported via Keyring chat.',
          },
          seed,
        ),
      },
      {
        text: `\n\n**What happens next**

1. Your agent sees the ticket straight away and assigns a contractor.
2. You'll get a message to agree access — you're entitled to at least **24 hours' notice** for non-emergency visits.
3. Keep photos and dates of anything relevant; they help if the issue comes back.

${priority === 'emergency' ? '> **If you smell gas**, leave the property and call the National Gas Emergency number on **0800 111 999** straight away.\n\n' : ''}Landlords are generally responsible for keeping the structure, heating, hot water and sanitation in repair. Is there anything else wrong at the property?`,
      },
    ];
  },

  compliance: () => [
    {
      text: `## Core safety and compliance checklist (England)

| Requirement | How often | Give tenant a copy? |
| --- | --- | --- |
| Gas safety check (Gas Safe engineer) | Every 12 months | Yes — within 28 days |
| Electrical safety report (EICR) | At least every 5 years | Yes |
| Energy Performance Certificate | Valid for 10 years | Yes, before the tenancy |
| Smoke alarm on every storey | Test at the start of each tenancy | — |
| Carbon monoxide alarm | Rooms with a fixed combustion appliance | — |
| Right to Rent checks | Before the tenancy starts | — |

**Also remember**

- Provide the current *How to rent* guide at the start of the tenancy.
- Most privately rented homes need an EPC rating of **E or above** to be let.
- Keep dated records of every certificate — a simple shared folder is fine.

Want this as a printable checklist with renewal reminders?${DISCLAIMER}`,
    },
  ],

  pro_rata: () => [
    {
      text: `When a tenancy starts mid-month, a common approach is to charge **daily rent × days occupied**, where daily rent is the annual rent divided by 365:

\`\`\`ts
/** Pro-rata rent for a part month, rounded to the penny. */
export function proRataRent(monthlyRent: number, moveIn: Date, periodEnd: Date): number {
  const DAY_MS = 86_400_000;
  const daily = (monthlyRent * 12) / 365;
  const days = Math.round((periodEnd.getTime() - moveIn.getTime()) / DAY_MS) + 1; // inclusive
  return Math.round(daily * days * 100) / 100;
}

proRataRent(1450, new Date('2026-12-12'), new Date('2026-12-31')); // → 953.42
\`\`\`

If you'd rather track it in a spreadsheet, here's a CSV you can paste in:

\`\`\`csv
Tenant,Monthly rent,Move-in,Period end,Days,Daily rate,Pro-rata due
A. Okafor,1450,2026-12-12,2026-12-31,20,47.67,953.42
J. Patel,925,2026-11-28,2026-11-30,3,30.41,91.23
\`\`\`

Make sure the method is written into the tenancy agreement so everyone calculates it the same way.`,
    },
  ],

  xss_demo: () => [
    {
      text: `Here's a response that **contains raw HTML and hostile links** — Keyring should render it as harmless text:

<script>window.__xss = true; alert('xss')</script>

<img src="x" onerror="window.__xss = true; alert('xss')">

<a href="javascript:window.__xss=true">a javascript: link</a> and a [markdown javascript link](javascript:window.__xss=true)

<iframe src="https://example.com"></iframe>

And here's a **safe** external link: [GOV.UK renting guidance](https://www.gov.uk/private-renting) — it should open in a new tab.

If nothing popped up and \`window.__xss\` is still undefined, sanitisation worked.`,
    },
  ],

  long: () => [
    {
      text: `# The renting journey, end to end

This is a long overview — handy for testing scroll behaviour while it streams.

${[
  ['Before you search', 'Work out a realistic budget: many agents look for an annual income of around 30× the monthly rent. Gather payslips, ID and references early.'],
  ['Searching', 'Shortlist on location, commute and total monthly cost — rent plus council tax, energy, water and broadband.'],
  ['Viewing', 'Visit in daylight if you can. Check for damp, water pressure, heating, window locks and mobile signal.'],
  ['Applying', 'You may pay a holding deposit of up to one week\'s rent. The landlord must decide within the agreed deadline.'],
  ['Referencing', 'Expect checks on income, previous landlords and Right to Rent. Be upfront about anything unusual.'],
  ['Signing', 'Read the agreement fully: rent review terms, break clauses, pets, decorating and who handles which bills.'],
  ['Moving in', 'Agree an inventory with photos. Note meter readings and test smoke and CO alarms on day one.'],
  ['During the tenancy', 'Report repairs in writing and keep a log. Pay rent on time and keep receipts.'],
  ['Renewals and rent changes', 'Rent increases should follow the process in your agreement or the statutory procedure. Ask questions early.'],
  ['Moving out', 'Give the right notice, clean to the inventory standard, and request your deposit back in writing.'],
]
  .map(
    ([h, p], i) =>
      `## ${i + 1}. ${h}\n\n${p}\n\n- Keep copies of everything you sign.\n- Ask for answers in writing when they matter.\n- Save the agent's contact details somewhere you can find them.`,
  )
  .join('\n\n')}

That's the full journey. Which stage are you at?`,
    },
  ],

  general: ({ rng }) => [
    {
      text: `${rng.pick([
        'Good question.',
        'Here’s a quick way to think about it.',
        'Happy to help with that.',
      ])} In lettings, most issues come down to three things: **what the tenancy agreement says**, **what the law requires**, and **what's been agreed in writing** since.

A sensible next step:

1. Check the relevant clause in the tenancy agreement.
2. Confirm the current legal position for England on GOV.UK.
3. Put your question or request in writing to the other party, with dates.

I can also:

- draft the message for you (try \`/rent-reminder\`),
- explain **deposit protection** or **safety certificates**,
- find homes and **book a viewing** (try \`/viewing\`), or
- log a repair (try \`/maintenance\`).

What would be most useful?`,
    },
  ],
};

function PROPERTIES_BY_WORD(text: string) {
  const t = text.toLowerCase();
  return searchProperties({}, 10).find((p) =>
    p.address
      .toLowerCase()
      .split(/[\s,]+/)
      .some((w) => w.length > 4 && t.includes(w)),
  );
}

function capitalise(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
