import { writeFileSync } from 'node:fs';
import { fetchJson, mapLimit } from '../server/engine/http';
import { SEED_EMPLOYERS } from '../server/data/employers.seed';
import { isPmTitle } from '../server/engine/titles';
import { slugify } from '../server/engine/text';
import type { Ats } from '../server/engine/types';

interface Probe { ats: Ats; slug: string; postings: number; pmJobs: number }

const ATS_ORDER: Ats[] = ['greenhouse', 'ashby', 'lever', 'workable', 'smartrecruiters', 'recruitee'];

async function probe(ats: Ats, slug: string): Promise<Probe | null> {
  try {
    if (ats === 'greenhouse') {
      const data = await fetchJson<{ jobs?: { title?: string }[] }>(
        `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=false`, 15_000);
      if (!Array.isArray(data.jobs)) return null;
      return { ats, slug, postings: data.jobs.length, pmJobs: data.jobs.filter((j) => isPmTitle(j.title ?? '')).length };
    }
    if (ats === 'ashby') {
      const data = await fetchJson<{ jobs?: { title?: string }[] }>(
        `https://api.ashbyhq.com/posting-api/job-board/${slug}`, 15_000);
      if (!Array.isArray(data.jobs)) return null;
      return { ats, slug, postings: data.jobs.length, pmJobs: data.jobs.filter((j) => isPmTitle(j.title ?? '')).length };
    }
    if (ats === 'lever') {
      const data = await fetchJson<{ text?: string }[]>(`https://api.lever.co/v0/postings/${slug}?mode=json`, 15_000);
      if (!Array.isArray(data)) return null;
      return { ats, slug, postings: data.length, pmJobs: data.filter((j) => isPmTitle(j.text ?? '')).length };
    }
    if (ats === 'workable') {
      const data = await fetchJson<{ jobs?: { title?: string }[] }>(
        `https://apply.workable.com/api/v1/widget/accounts/${slug}`, 15_000);
      if (!Array.isArray(data.jobs)) return null;
      return { ats, slug, postings: data.jobs.length, pmJobs: data.jobs.filter((j) => isPmTitle(j.title ?? '')).length };
    }
    if (ats === 'smartrecruiters') {
      const data = await fetchJson<{ content?: { name?: string }[]; totalFound?: number }>(
        `https://api.smartrecruiters.com/v1/companies/${slug}/postings?limit=100`, 15_000);
      if (!Array.isArray(data.content)) return null;
      return {
        ats, slug, postings: data.totalFound ?? data.content.length,
        pmJobs: data.content.filter((j) => isPmTitle(j.name ?? '')).length,
      };
    }
    if (ats === 'recruitee') {
      const data = await fetchJson<{ offers?: { title?: string }[] }>(`https://${slug}.recruitee.com/api/offers/`, 15_000);
      if (!Array.isArray(data.offers)) return null;
      return { ats, slug, postings: data.offers.length, pmJobs: data.offers.filter((o) => isPmTitle(o.title ?? '')).length };
    }
  } catch {
    return null;
  }
  return null;
}

async function resolve(name: string, preferred: Ats, preferredSlug: string): Promise<Probe | null> {
  const first = await probe(preferred, preferredSlug);
  if (first) return first;
  const slugs = [...new Set([preferredSlug, slugify(name), slugify(name).replace(/-/g, '')])].filter((s) => s.length >= 3);
  for (const slug of slugs) {
    for (const ats of ATS_ORDER) {
      if (ats === preferred && slug === preferredSlug) continue;
      const found = await probe(ats, slug);
      if (found) return found;
    }
  }
  return null;
}

const EXTRAS: [string, string, string, string][] = [
  ['Zapier', 'Software', 'Midsize', 'CA'], ['Automattic', 'Software', 'Large', 'CA'],
  ['Doist', 'Software', 'Startup', 'NY'], ['Buffer', 'Software', 'Startup', 'CA'],
  ['Help Scout', 'Software', 'Startup', 'MA'], ['Close', 'Software', 'Startup', 'CA'],
  ['Kit (ConvertKit)', 'Software', 'Startup', 'ID'], ['Miro', 'Software', 'Large', 'CA'],
  ['ClickUp', 'Software', 'Large', 'CA'], ['Smartsheet', 'Software', 'Large', 'WA'],
  ['Wrike', 'Software', 'Large', 'CA'], ['Calendly', 'Software', 'Midsize', 'GA'],
  ['Typeform', 'Software', 'Midsize', 'CA'], ['Pipedrive', 'Software', 'Midsize', 'NY'],
  ['Semrush', 'Marketing', 'Large', 'MA'], ['Drift', 'Marketing', 'Midsize', 'MA'],
  ['Front', 'Software', 'Midsize', 'CA'], ['Kustomer', 'Software', 'Midsize', 'NY'],
  ['Gorgias', 'Software', 'Midsize', 'CA'], ['Recharge', 'E-Commerce', 'Midsize', 'CA'],
  ['Route', 'E-Commerce', 'Startup', 'UT'], ['Postscript', 'Marketing', 'Startup', 'AZ'],
  ['Attentive', 'Marketing', 'Large', 'NY'], ['Yotpo', 'Marketing', 'Large', 'NY'],
  ['Trustpilot', 'Software', 'Large', 'NY'], ['Qualtrics', 'Software', 'Enterprise', 'UT'],
  ['Medallia', 'Software', 'Enterprise', 'CA'], ['Hootsuite', 'Marketing', 'Large', 'WA'],
  ['Later', 'Marketing', 'Midsize', 'CA'], ['Doximity', 'Healthcare', 'Large', 'CA'],
  ['Health Catalyst', 'Healthcare', 'Large', 'UT'], ['Innovaccer', 'Healthcare', 'Midsize', 'CA'],
  ['Verana Health', 'Healthcare', 'Midsize', 'CA'], ['Novo', 'Banking', 'Startup', 'NY'],
  ['Lili', 'Banking', 'Startup', 'NY'], ['Bluevine', 'Financial Services', 'Large', 'CA'],
  ['Melio', 'Financial Services', 'Midsize', 'NY'], ['Bill.com', 'Financial Services', 'Large', 'CA'],
  ['Tipalti', 'Financial Services', 'Large', 'CA'], ['AvidXchange', 'Financial Services', 'Large', 'NC'],
  ['Unit', 'Financial Services', 'Midsize', 'NY'], ['Increase', 'Financial Services', 'Startup', 'CA'],
  ['GovOS', 'Government', 'Midsize', 'TX'], ['Accela', 'Government', 'Midsize', 'CA'],
  ['PayIt', 'Government', 'Midsize', 'VA'], ['Buildertrend', 'Construction', 'Midsize', 'NE'],
  ['Raken', 'Construction', 'Startup', 'CA'], ['Fieldwire', 'Construction', 'Midsize', 'CA'],
  ['EnergySage', 'Renewable Energy', 'Midsize', 'MA'], ['Bidgely', 'Utilities', 'Midsize', 'CA'],
  ['AutoGrid', 'Utilities', 'Midsize', 'CA'], ['Uplight', 'Utilities', 'Midsize', 'CO'],
  ['GlobalGiving', 'Nonprofit', 'Midsize', 'DC'], ['Charity Navigator', 'Nonprofit', 'Small', 'NJ'],
  ['Watsi', 'Nonprofit', 'Startup', 'CA'], ['Leapsome', 'Human Resources Services', 'Midsize', 'NY'],
  ['Bonusly', 'Human Resources Services', 'Startup', 'CO'], ['Kazoo', 'Human Resources Services', 'Midsize', 'TX'],
  ['Shippo', 'Logistics', 'Midsize', 'CA'], ['EasyPost', 'Logistics', 'Large', 'CA'],
  ['Stord', 'Logistics', 'Midsize', 'GA'], ['Flexe', 'Logistics', 'Midsize', 'WA'],
  ['Skillshare', 'Education', 'Midsize', 'NY'], ['Outschool', 'Education', 'Midsize', 'CA'],
  ['Guild Education', 'Education', 'Large', 'CO'], ['Degreed', 'Education', 'Midsize', 'CA'],
  ['BetterUp', 'Human Resources Services', 'Large', 'CA'], ['CoachHub', 'Human Resources Services', 'Midsize', 'NY'],
  ['Mural', 'Software', 'Midsize', 'CA'], ['Aha!', 'Software', 'Midsize', 'CA'],
  ['Kinsta', 'Cloud Services', 'Midsize', 'CA'], ['WP Engine', 'Cloud Services', 'Large', 'TX'],
  ['Pantheon', 'Cloud Services', 'Midsize', 'CA'], ['Toggl', 'Software', 'Startup', 'NY'],
  ['MailerLite', 'Marketing', 'Midsize', 'NY'], ['ActiveCampaign', 'Marketing', 'Large', 'IL'],
  ['Customer.io', 'Marketing', 'Midsize', 'NY'], ['Segment (Twilio)', 'Software', 'Midsize', 'CA'],
  ['Chili Piper', 'Software', 'Startup', 'NY'], ['UserTesting', 'Software', 'Large', 'CA'],
  ['UserZoom', 'Software', 'Midsize', 'CA'], ['Dovetail', 'Software', 'Startup', 'CA'],
  ['Maze', 'Software', 'Startup', 'CA'], ['Great Question', 'Software', 'Startup', 'CA'],
  ['Lattice', 'Human Resources Services', 'Midsize', 'CA'], ['Rippling', 'Human Resources Services', 'Large', 'CA'],
  ['Oyster', 'Human Resources Services', 'Midsize', 'CA'], ['Velocity Global', 'Human Resources Services', 'Midsize', 'CO'],
  ['Papaya Global', 'Human Resources Services', 'Midsize', 'NY'], ['TriNet', 'Human Resources Services', 'Enterprise', 'CA'],
  ['Justworks', 'Human Resources Services', 'Large', 'NY'], ['Namely', 'Human Resources Services', 'Midsize', 'NY'],
  ['Zenefits', 'Human Resources Services', 'Midsize', 'CA'], ['Gusto', 'Human Resources Services', 'Large', 'CA'],
  ['Sonder', 'Hospitality', 'Large', 'CA'], ['Mindbody', 'Hospitality', 'Large', 'CA'],
  ['ClassPass', 'Hospitality', 'Midsize', 'NY'], ['Eventbrite', 'Events', 'Large', 'CA'],
  ['Bizzabo', 'Events', 'Midsize', 'NY'], ['Cvent', 'Events', 'Large', 'VA'],
  ['Splash', 'Events', 'Startup', 'NY'], ['Hopin', 'Events', 'Midsize', 'CA'],
  ['Intercom', 'Software', 'Midsize', 'CA'], ['Zendesk', 'Software', 'Large', 'CA'],
  ['Freshworks', 'Software', 'Large', 'CA'], ['ServiceNow', 'Software', 'Enterprise', 'CA'],
  ['Atlassian', 'Software', 'Enterprise', 'CA'], ['Monday.com', 'Software', 'Large', 'NY'],
  ['Airtable', 'Software', 'Large', 'CA'], ['Notion', 'Software', 'Midsize', 'CA'],
  ['Coda', 'Software', 'Startup', 'CA'], ['Mural', 'Software', 'Midsize', 'CA'],
];

async function main(): Promise<void> {
  const rows: { name: string; industry: string; size: string; hq: string; preferred: Ats; slug: string }[] = [
    ...SEED_EMPLOYERS.map((e) => ({ name: e.name, industry: e.industry, size: e.size, hq: e.hq, preferred: e.ats, slug: e.slug })),
    ...EXTRAS.map(([name, industry, size, hq]) => ({
      name, industry, size, hq, preferred: 'greenhouse' as Ats, slug: slugify(name),
    })),
  ];

  const results = await mapLimit(rows, 8, async (row) => {
    const found = await resolve(row.name, row.preferred, row.slug);
    return { row, found };
  });

  const valid = results.filter((r) => r.found && r.found.postings > 0 && r.found.pmJobs > 0);
  const empty = results.filter((r) => r.found && r.found.pmJobs === 0);
  const dead = results.filter((r) => !r.found);

  console.log(`valid=${valid.length} empty=${empty.length} dead=${dead.length} of ${rows.length}`);
  const lines: string[] = [];
  valid
    .sort((a, b) => (b.found!.pmJobs - a.found!.pmJobs))
    .forEach((r) => {
      console.log(`${String(r.found!.pmJobs).padStart(3)} PM ${String(r.found!.postings).padStart(5)} tot  ${r.found!.ats.padEnd(15)} ${String(r.found!.slug).padEnd(28)} ${r.row.name}`);
      lines.push(`${r.row.name}\t${r.found!.ats}\t${r.found!.slug}\t${r.row.industry}\t${r.row.size}\t${r.row.hq}\t${r.found!.postings}\t${r.found!.pmJobs}`);
    });

  writeFileSync('/tmp/employer-validation.tsv', lines.join('\n'));
  writeFileSync('/tmp/employer-dead.txt', dead.map((r) => `${r.row.name}\t${r.row.preferred}\t${r.row.slug}`).join('\n'));
  writeFileSync('/tmp/employer-empty.txt', empty.map((r) => `${r.row.name}\t${r.found!.ats}\t${r.found!.slug}`).join('\n'));
  console.log('wrote /tmp/employer-validation.tsv');
}

void main().catch((err) => { console.error(err); process.exitCode = 1; });
