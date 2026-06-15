// The 51 selectable profession presets (50 professions + Personal). The
// 52nd entry in the spec, "Custom (Build Your Own)", is not a preset — it
// is the builder, surfaced as the "Build my own" link.
//
// Tiered depth (Part 4): Legal Practice and Immigration Advisory are
// anchors with researched fields, statuses, and cheatsheets; a handful of
// standard presets carry sensible fields and statuses; the long tail is
// light — name, aliases, accent, icon, and the universal status set — so
// search is fully populated and they can be fleshed out later.

import type { BillingMode, FieldDef, NewSpace } from './types'

export interface SuggestedApp {
  name: string
  url?: string // Phase 3 consumes these; native-exe apps are added by the user
}

export type PresetTier = 'anchor' | 'standard' | 'light'

export interface Preset {
  id: string // stable slug, recorded in spaces.preset_id
  name: string // canonical name
  description: string // short line shown in search results
  aliases: string[]
  accent: string // hex from the 12-colour palette
  icon: string // iconCatalog slug
  tier: PresetTier
  fields: FieldDef[]
  statuses: string[]
  cheatsheet: string // plain text for now; Phase 6 converts to Tiptap
  suggestedApps: SuggestedApp[]
  // The default billing pattern for spaces created from this preset (Part 7,
  // Phase 10b). Omitted = 'none'; the user can change it per space and override
  // per task.
  billing?: BillingMode
}

// The default statuses available on every task (Part 7). Light presets and
// the custom builder start from this set.
export const UNIVERSAL_STATUSES = [
  'To start',
  'In progress',
  'Waiting on update',
  'Awaiting response',
  'Done',
  'Archived'
]

// Compact constructor for the light long-tail presets.
function light(
  id: string,
  name: string,
  description: string,
  aliases: string[],
  accent: string,
  icon: string,
  billing: BillingMode = 'none'
): Preset {
  return {
    id,
    name,
    description,
    aliases,
    accent,
    icon,
    tier: 'light',
    fields: [],
    statuses: UNIVERSAL_STATUSES,
    cheatsheet: '',
    suggestedApps: [],
    billing
  }
}

const ACCENT = {
  amber: '#BA7517',
  coral: '#D85A30',
  pink: '#D4537E',
  purple: '#7F77DD',
  indigo: '#534AB7',
  blue: '#378ADD',
  teal: '#1D9E75',
  green: '#639922',
  lime: '#97C459',
  yellow: '#EF9F27',
  gray: '#888780',
  red: '#E24B4A'
} as const

export const PRESETS: Preset[] = [
  // --- Legal and compliance ---
  {
    id: 'legal',
    name: 'Legal Practice',
    description: 'Casework, matters, hearings, and fee tracking.',
    aliases: ['lawyer', 'solicitor', 'barrister', 'attorney', 'paralegal', 'litigation', 'legal counsel', 'law firm'],
    accent: ACCENT.amber,
    icon: 'scale',
    tier: 'anchor',
    billing: 'time',
    fields: [
      { name: 'Client name', type: 'text' },
      { name: 'Matter reference', type: 'text' },
      {
        name: 'Court / Tribunal',
        type: 'select',
        options: ['WAIRB', 'Upper Tribunal', 'Court of Appeal', 'High Court', 'County Court', "Magistrates' Court"]
      },
      {
        name: 'Matter type',
        type: 'select',
        options: ['Immigration', 'Conveyancing', 'Family', 'Litigation', 'Employment', 'Wills & Probate']
      },
      { name: 'Hearing date', type: 'date' },
      { name: 'Opposing counsel', type: 'text' },
      { name: 'Fee arrangement', type: 'select', options: ['Hourly', 'Fixed fee', 'Legal aid', 'CFA'] }
    ],
    statuses: ['To start', 'In progress', 'Awaiting response', 'Court/Hearing', 'Done', 'Archived'],
    cheatsheet: [
      'Quick reference',
      '- Section 3C leave lasts 2 months from expiry.',
      '- Section 117C exceptional circumstances applies to deport cases only.',
      '- Materially different evidence required for appeal-to-revoke applications.',
      '',
      'Key contacts',
      '- (add clerks, counsel, and court contacts here)'
    ].join('\n'),
    suggestedApps: [
      { name: 'Companies House', url: 'https://find-and-update.company-information.service.gov.uk' },
      { name: 'BAILII', url: 'https://www.bailii.org' },
      { name: 'Gov.uk', url: 'https://www.gov.uk' }
    ]
  },
  {
    id: 'immigration',
    name: 'Immigration Advisory',
    description: 'Applications, deadlines, and Home Office correspondence.',
    aliases: ['immigration', 'visa consultant', 'OISC', 'immigration lawyer', 'citizenship adviser', 'asylum', 'deportation'],
    accent: ACCENT.indigo,
    icon: 'plane',
    tier: 'anchor',
    billing: 'time',
    fields: [
      { name: 'Client name', type: 'text' },
      { name: 'Home Office reference', type: 'text' },
      {
        name: 'Application type',
        type: 'select',
        options: ['Asylum', 'Spouse visa', 'Work visa', 'Student visa', 'ILR', 'Citizenship', 'Visit visa']
      },
      { name: 'Decision / submission deadline', type: 'date' },
      { name: 'Representative', type: 'text' },
      { name: 'Fee arrangement', type: 'select', options: ['Hourly', 'Fixed fee', 'Legal aid', 'CFA'] }
    ],
    statuses: ['To start', 'In progress', 'Awaiting Home Office', 'Hearing', 'Done', 'Archived'],
    cheatsheet: [
      'Quick reference',
      '- 3C leave protects status while an in-time application is pending.',
      '- Fee waiver requires evidence of destitution for human-rights routes.',
      '- Check the 28-day grace period before treating leave as overstayed.',
      '',
      'Key links',
      '- Gov.uk visas and immigration; Home Office contact points.'
    ].join('\n'),
    suggestedApps: [
      { name: 'Gov.uk visas', url: 'https://www.gov.uk/browse/visas-immigration' },
      { name: 'Home Office', url: 'https://www.gov.uk/government/organisations/home-office' }
    ]
  },
  light('compliance', 'Compliance Officer', 'Regulatory, governance, and audit work.', ['compliance', 'regulatory', 'GDPR', 'audit', 'governance', 'risk officer'], ACCENT.amber, 'shield-check'),
  light('conveyancer', 'Conveyancer / Property Lawyer', 'Residential and commercial property transactions.', ['conveyancing', 'property law', 'residential property', 'commercial property'], ACCENT.amber, 'home'),

  // --- Healthcare and wellbeing ---
  {
    id: 'gp',
    name: 'General Practice (GP)',
    description: 'Patient list, appointments, and reviews.',
    aliases: ['GP', 'family doctor', 'physician', 'primary care', 'surgery', 'doctor'],
    accent: ACCENT.teal,
    icon: 'stethoscope',
    tier: 'standard',
    fields: [
      { name: 'Patient initials', type: 'text' },
      { name: 'NHS number', type: 'text' },
      { name: 'Appointment type', type: 'select', options: ['Consultation', 'Follow-up', 'Telephone', 'Home visit'] },
      { name: 'Next review', type: 'date' }
    ],
    statuses: UNIVERSAL_STATUSES,
    cheatsheet: '',
    suggestedApps: []
  },
  light('specialist', 'Specialist Clinician', 'Secondary-care clinics and referrals.', ['specialist', 'consultant', 'hospital doctor', 'secondary care', 'registrar'], ACCENT.teal, 'heartbeat'),
  light('therapist', 'Therapist / Counsellor', 'Sessions, notes, and client wellbeing.', ['therapist', 'counsellor', 'psychotherapist', 'mental health', 'psychologist', 'CBT', 'EMDR'], ACCENT.teal, 'heart', 'time'),
  light('dentist', 'Dentist', 'Patients, treatments, and recalls.', ['dentist', 'dental', 'orthodontist', 'hygienist'], ACCENT.teal, 'dental', 'unit'),
  light('vet', 'Veterinarian', 'Animal patients, treatments, and owners.', ['vet', 'veterinary', 'animal hospital', 'equine vet', 'exotic vet'], ACCENT.teal, 'paw'),

  // --- Education and research ---
  {
    id: 'teacher',
    name: 'Teacher (K-12)',
    description: 'Lessons, classes, planning, and marking.',
    aliases: ['teacher', 'primary school', 'secondary school', 'classroom', 'educator'],
    accent: ACCENT.purple,
    icon: 'school',
    tier: 'standard',
    fields: [
      { name: 'Class / Year', type: 'text' },
      { name: 'Subject', type: 'text' },
      { name: 'Lesson date', type: 'date' }
    ],
    statuses: ['To plan', 'Prepared', 'Taught', 'Marked', 'Archived'],
    cheatsheet: '',
    suggestedApps: []
  },
  light('lecturer', 'University Lecturer', 'Courses, research, and supervision.', ['lecturer', 'professor', 'academic', 'tutor', 'faculty', 'university'], ACCENT.purple, 'books'),
  light('phd', 'PhD Researcher', 'Experiments, reading, and writing up.', ['PhD', 'doctoral', 'research student', 'postgrad researcher', 'postdoc'], ACCENT.purple, 'microscope'),
  light('tutor', 'Private Tutor', 'Students, sessions, and exam prep.', ['tutor', 'private tuition', 'exam prep', 'GCSE tutor', 'A-level tutor'], ACCENT.purple, 'pencil', 'time'),
  light('librarian', 'Librarian / Archivist', 'Collections, records, and cataloguing.', ['librarian', 'library', 'archive', 'archivist', 'records manager'], ACCENT.purple, 'books'),

  // --- Engineering and trades ---
  {
    id: 'software',
    name: 'Software Engineer',
    description: 'Features, bugs, tickets, and releases.',
    aliases: ['developer', 'programmer', 'software engineer', 'coder', 'devops', 'SRE'],
    accent: ACCENT.indigo,
    icon: 'code',
    tier: 'standard',
    fields: [
      { name: 'Repository', type: 'url' },
      { name: 'Work type', type: 'select', options: ['Feature', 'Bug', 'Refactor', 'Infra', 'Docs'] },
      { name: 'Ticket reference', type: 'text' },
      { name: 'Target release', type: 'text' }
    ],
    statuses: ['Backlog', 'In progress', 'In review', 'Blocked', 'Done', 'Archived'],
    cheatsheet: '',
    suggestedApps: []
  },
  light('civil-eng', 'Civil / Structural Engineer', 'Projects, drawings, and site work.', ['civil engineer', 'structural engineer', 'construction engineer', 'MEng'], ACCENT.indigo, 'building-bridge'),
  light('electrician', 'Electrician', 'Jobs, certificates, and callouts.', ['electrician', 'sparky', 'electrical contractor', 'NICEIC'], ACCENT.indigo, 'bolt', 'job'),
  light('plumber', 'Plumber / Heating Engineer', 'Jobs, boilers, and pipework.', ['plumber', 'gas safe', 'heating engineer', 'boiler', 'pipework'], ACCENT.indigo, 'droplet', 'job'),
  light('carpenter', 'Carpenter / Joiner', 'Builds, fittings, and commissions.', ['carpenter', 'joiner', 'woodwork', 'cabinet maker', 'kitchen fitter'], ACCENT.indigo, 'hammer', 'job'),
  light('builder', 'General Builder / Contractor', 'Projects, trades, and schedules.', ['builder', 'contractor', 'construction', 'building'], ACCENT.indigo, 'tools', 'job'),
  light('mechanic', 'Mechanic / Automotive Tech', 'Vehicles, repairs, and MOTs.', ['mechanic', 'garage', 'MOT', 'automotive technician', 'car repair'], ACCENT.indigo, 'car', 'job'),
  light('locksmith', 'Locksmith', 'Callouts, jobs, and installations.', ['locksmith', 'locks', 'security installer', 'emergency callout'], ACCENT.indigo, 'key', 'job'),

  // --- Creative and media ---
  {
    id: 'graphic-designer',
    name: 'Graphic Designer',
    description: 'Clients, briefs, deliverables, and revisions.',
    aliases: ['graphic designer', 'designer', 'brand designer', 'visual designer'],
    accent: ACCENT.coral,
    icon: 'palette',
    tier: 'standard',
    billing: 'job',
    fields: [
      { name: 'Client', type: 'text' },
      { name: 'Project type', type: 'select', options: ['Branding', 'Print', 'Digital', 'Packaging', 'Illustration'] },
      { name: 'Deliverable', type: 'text' },
      { name: 'Deadline', type: 'date' }
    ],
    statuses: ['To start', 'In progress', 'Awaiting feedback', 'Revisions', 'Done', 'Archived'],
    cheatsheet: '',
    suggestedApps: []
  },
  light('ux-designer', 'UX/UI Designer', 'Research, flows, and product design.', ['UX designer', 'product designer', 'UI designer', 'interaction designer'], ACCENT.coral, 'layout'),
  {
    id: 'photographer',
    name: 'Photographer',
    description: 'Shoots, bookings, editing, and delivery.',
    aliases: ['photographer', 'wedding photographer', 'event photographer', 'studio'],
    accent: ACCENT.coral,
    icon: 'camera',
    tier: 'standard',
    billing: 'job',
    fields: [
      { name: 'Client', type: 'text' },
      { name: 'Shoot type', type: 'select', options: ['Wedding', 'Portrait', 'Event', 'Product', 'Studio'] },
      { name: 'Shoot date', type: 'datetime' },
      { name: 'Location', type: 'text' },
      { name: 'Deliverables due', type: 'date' }
    ],
    statuses: ['Enquiry', 'Booked', 'Shot', 'Editing', 'Delivered', 'Archived'],
    cheatsheet: '',
    suggestedApps: []
  },
  light('videographer', 'Videographer / Filmmaker', 'Shoots, edits, and productions.', ['videographer', 'filmmaker', 'editor', 'cinematographer', 'video'], ACCENT.coral, 'video'),
  {
    id: 'writer',
    name: 'Writer / Author',
    description: 'Projects, drafts, deadlines, and submissions.',
    aliases: ['writer', 'author', 'novelist', 'copywriter', 'screenwriter', 'ghostwriter'],
    accent: ACCENT.coral,
    icon: 'pencil',
    tier: 'standard',
    billing: 'job',
    fields: [
      { name: 'Project', type: 'text' },
      { name: 'Type', type: 'select', options: ['Article', 'Book', 'Copy', 'Script', 'Blog'] },
      { name: 'Word count target', type: 'number' },
      { name: 'Deadline', type: 'date' }
    ],
    statuses: ['Idea', 'Drafting', 'Editing', 'Submitted', 'Published', 'Archived'],
    cheatsheet: '',
    suggestedApps: []
  },
  light('musician', 'Musician / Producer', 'Tracks, sessions, and releases.', ['musician', 'producer', 'composer', 'audio engineer', 'sound designer'], ACCENT.coral, 'music'),
  light('illustrator', 'Illustrator / Animator', 'Commissions, frames, and concepts.', ['illustrator', 'animator', 'motion designer', 'concept artist'], ACCENT.coral, 'brush'),
  light('architect', 'Architect / Interior Designer', 'Projects, drawings, and approvals.', ['architect', 'interior designer', 'RIBA', 'ARB'], ACCENT.coral, 'ruler'),

  // --- Property and estate ---
  {
    id: 'estate-agent',
    name: 'Estate Agent',
    description: 'Listings, viewings, offers, and completions.',
    aliases: ['estate agent', 'lettings agent', 'realtor', 'property agent'],
    accent: ACCENT.green,
    icon: 'building-store',
    tier: 'standard',
    billing: 'job',
    fields: [
      { name: 'Property address', type: 'text' },
      { name: 'Listing type', type: 'select', options: ['Sale', 'Letting'] },
      { name: 'Asking price', type: 'number' },
      { name: 'Vendor / Landlord', type: 'text' },
      { name: 'Viewing date', type: 'datetime' }
    ],
    statuses: ['New', 'Listed', 'Viewings', 'Under offer', 'Completed', 'Archived'],
    cheatsheet: '',
    suggestedApps: []
  },
  light('property-manager', 'Property Manager / Landlord', 'Tenancies, maintenance, and rent.', ['landlord', 'property manager', 'lettings', 'HMO operator'], ACCENT.green, 'building-community'),
  light('surveyor', 'Surveyor', 'Surveys, valuations, and reports.', ['surveyor', 'RICS', 'building surveyor', 'quantity surveyor'], ACCENT.green, 'ruler-2'),

  // --- Business and operations ---
  light('consultant', 'Freelance Consultant', 'Clients, engagements, and deliverables.', ['consultant', 'freelancer', 'contractor', 'advisor'], ACCENT.blue, 'briefcase', 'time'),
  light('project-manager', 'Project Manager', 'Plans, milestones, and risks.', ['project manager', 'programme manager', 'PMO', 'PMP', 'PRINCE2'], ACCENT.blue, 'checklist'),
  light('marketing', 'Marketing / Content Manager', 'Campaigns, content, and channels.', ['marketer', 'marketing manager', 'content manager', 'social media manager'], ACCENT.blue, 'speakerphone'),
  light('sales', 'Sales / Account Manager', 'Pipeline, accounts, and follow-ups.', ['sales', 'account manager', 'business development', 'BD', 'account executive'], ACCENT.blue, 'phone'),
  light('hr', 'HR / People Operations', 'People, hiring, and cases.', ['HR', 'people ops', 'talent', 'recruiter', 'people partner'], ACCENT.blue, 'users'),
  {
    id: 'accountant',
    name: 'Accountant / Bookkeeper',
    description: 'Clients, periods, and filing deadlines.',
    aliases: ['accountant', 'bookkeeper', 'finance', 'CPA', 'ACCA'],
    accent: ACCENT.gray,
    icon: 'calculator',
    tier: 'standard',
    billing: 'time',
    fields: [
      { name: 'Client', type: 'text' },
      { name: 'Service', type: 'select', options: ['Bookkeeping', 'VAT', 'Payroll', 'Self-assessment', 'Year-end accounts'] },
      { name: 'Period end', type: 'date' },
      { name: 'Filing deadline', type: 'date' }
    ],
    statuses: ['To start', 'In progress', 'Awaiting client', 'Filed', 'Done', 'Archived'],
    cheatsheet: '',
    suggestedApps: []
  },
  light('financial-advisor', 'Financial Advisor / IFA', 'Clients, reviews, and plans.', ['financial advisor', 'IFA', 'wealth manager', 'financial planner'], ACCENT.blue, 'coin'),
  light('executive-assistant', 'Executive Assistant', 'Diary, travel, and tasks.', ['EA', 'executive assistant', 'PA', 'personal assistant', 'office manager'], ACCENT.blue, 'clipboard'),

  // --- Service and care ---
  light('personal-trainer', 'Personal Trainer / Coach', 'Clients, sessions, and programmes.', ['personal trainer', 'PT', 'fitness coach', 'strength coach'], ACCENT.lime, 'barbell'),
  light('hairdresser', 'Hairdresser / Stylist', 'Clients, bookings, and services.', ['hairdresser', 'stylist', 'barber', 'salon'], ACCENT.pink, 'scissors'),
  light('nanny', 'Childminder / Nanny', 'Children, schedules, and activities.', ['childminder', 'nanny', 'au pair', 'early years'], ACCENT.lime, 'baby-carriage'),
  light('dog-walker', 'Dog Walker / Pet Sitter', 'Pets, walks, and bookings.', ['dog walker', 'pet sitter', 'dog boarding', 'kennels'], ACCENT.lime, 'dog'),
  light('cleaner', 'Cleaner / Housekeeper', 'Clients, jobs, and schedules.', ['cleaner', 'housekeeper', 'domestic cleaning', 'end-of-tenancy'], ACCENT.lime, 'spray'),

  // --- Specialist ---
  light('researcher', 'Researcher (non-academic)', 'Studies, sources, and findings.', ['researcher', 'market research', 'UX research', 'analyst'], ACCENT.gray, 'chart-bar'),
  light('event-planner', 'Event Planner', 'Events, vendors, and timelines.', ['event planner', 'wedding planner', 'event manager', 'conference organiser'], ACCENT.yellow, 'confetti'),
  light('translator', 'Translator / Interpreter', 'Projects, languages, and deadlines.', ['translator', 'interpreter', 'linguist', 'localiser'], ACCENT.gray, 'language', 'unit'),
  light('breeder', 'Breeder / Animal Keeper', 'Animals, pairs, and care schedules.', ['breeder', 'animal keeper', 'kennel', 'cattery', 'exotic animal keeper'], ACCENT.lime, 'feather'),

  // --- Personal (default non-professional space) ---
  {
    id: 'personal',
    name: 'Personal',
    description: 'Life, home, and everything else.',
    aliases: ['personal', 'life', 'home', 'individual'],
    accent: ACCENT.green,
    icon: 'user',
    tier: 'light',
    fields: [],
    statuses: ['To do', 'In progress', 'Done', 'Archived'],
    cheatsheet: '',
    suggestedApps: []
  }
]

export function getPreset(id: string): Preset | undefined {
  return PRESETS.find((p) => p.id === id)
}

// Maps a chosen preset to a space-creation spec. Used by the profession
// search flow and the self-test. The user may override the name.
export function presetToSpace(preset: Preset, name?: string): NewSpace {
  return {
    name: name ?? preset.name,
    accentColor: preset.accent,
    icon: preset.icon,
    presetId: preset.id,
    fields: preset.fields,
    statusSet: preset.statuses,
    cheatsheet: preset.cheatsheet
  }
}

function score(preset: Preset, q: string): number {
  const name = preset.name.toLowerCase()
  let best = 0
  // An exact alias (e.g. "lawyer") is a stronger signal than a mere name
  // substring (e.g. "lawyer" inside "Property Lawyer"), so it ranks above
  // name-includes but below a name match.
  for (const alias of preset.aliases) {
    const a = alias.toLowerCase()
    if (a === q) best = Math.max(best, 70)
    else if (a.startsWith(q)) best = Math.max(best, 40)
    else if (a.includes(q)) best = Math.max(best, 25)
  }
  if (name === q) return 100
  if (name.startsWith(q)) return Math.max(best, 80)
  if (name.includes(q)) return Math.max(best, 60)
  return best
}

// Matches name first, then aliases, ranked. An empty query returns the
// presets with real content as friendly suggestions.
export function searchPresets(query: string): Preset[] {
  const q = query.trim().toLowerCase()
  if (!q) return PRESETS.filter((p) => p.tier !== 'light')
  return PRESETS.map((p) => ({ p, s: score(p, q) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.p.name.localeCompare(b.p.name))
    .map((x) => x.p)
}
