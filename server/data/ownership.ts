export type OwnershipStatus = 'Verified' | 'Self-reported' | 'Not verified' | 'Not researched' | 'Not applicable';

export interface OwnershipRecord {
  /** Matches employers.name (case/punctuation-insensitive). */
  name: string;
  blackOwned: boolean;
  status: OwnershipStatus;
  source: string | null;
  note?: string;
}

/**
 * Ownership records are marked "Verified" only where a public, citable source
 * documents Black ownership or Black founding. Nothing is inferred from names,
 * photographs or workforce demographics, and nonprofits are not described as
 * "owned" at all.
 *
 * Full research trail: VERIFICATION.md.
 */
export const OWNERSHIP_RECORDS: OwnershipRecord[] = [
  {
    name: 'Esusu',
    blackOwned: true,
    status: 'Verified',
    source: 'https://www.esusurent.com/about \u2014 co-founded 2018 by Wemimo Abbey; Sixth Street profile describes it as "one of the few Black-owned companies to reach unicorn status" (https://sixthstreet.com/insights/wemimo-abbey-co-founder-and-co-ceo-of-esusu)',
    note: 'Rent-reporting fintech; Black co-founder and co-CEO.',
  },
  {
    name: 'Blavity',
    blackOwned: true,
    status: 'Verified',
    source: 'https://en.wikipedia.org/wiki/Morgan_DeBaun \u2014 "African American serial entrepreneur\u2026 Founder and CEO of Blavity Inc."; company site: https://blavityinc.com/ceo-founder-morgan-debaun/',
    note: 'Digital media company for Black audiences; Black founder and CEO.',
  },
  {
    name: 'Mayvenn',
    blackOwned: true,
    status: 'Verified',
    source: 'https://www.forbes.com/sites/raquelharris/2022/06/30/black-owned-beauty-and-tech-company-mayvenn-raises-40-million-in-series-c-funding-round-plans-to-use-capital-to-expand-partnership-with-walmart/ \u2014 describes Mayvenn as a Black-owned beauty and tech company; founder profile: https://www.blackventures.org/blackleaders/diishan-imira',
    note: 'Beauty-tech marketplace; Black co-founder and CEO (Diishan Imira).',
  },
  {
    name: 'H.J. Russell & Company',
    blackOwned: true,
    status: 'Verified',
    source: 'https://www.hjrussell.com/about \u2014 construction and real-estate firm founded in 1952 by Herman J. Russell, one of the largest Black-owned construction companies in the US.',
    note: 'Manual-check employer: no machine-readable job feed.',
  },
  {
    name: 'C.D. Moody Construction',
    blackOwned: true,
    status: 'Verified',
    source: 'https://www.cdmoody.com/about \u2014 Atlanta construction firm founded by Cedric D. Moody.',
    note: 'Manual-check employer: applications by email/form.',
  },
  {
    name: 'The Integral Group',
    blackOwned: true,
    status: 'Verified',
    source: 'https://www.integralgroup.com/about \u2014 real-estate development and investment firm founded by Egbert L. J. Perry.',
    note: 'Manual-check employer: no public ATS feed.',
  },
  {
    name: 'BITHGROUP Technologies',
    blackOwned: true,
    status: 'Verified',
    source: 'https://www.bithgroup.com/about \u2014 Baltimore IT consulting firm founded by Dr. Robert L. Wallace.',
    note: 'Manual-check employer: no public ATS feed.',
  },
  {
    name: 'Ariel Investments',
    blackOwned: true,
    status: 'Verified',
    source: 'https://www.arielinvestments.com/about-us/ \u2014 asset manager co-founded in 1983 by John W. Rogers Jr.',
    note: 'Manual-check employer: postings on own careers page.',
  },
  {
    name: 'Urban One',
    blackOwned: true,
    status: 'Verified',
    source: 'https://urban1.com/about/ \u2014 media company founded by Cathy Hughes; the largest Black-owned broadcasting company in the US.',
    note: 'Manual-check employer: internal careers portal.',
  },
  {
    name: 'Management Leadership for Tomorrow',
    blackOwned: false,
    status: 'Not applicable',
    source: 'https://mlt.org/about-us/ \u2014 nonprofit talent-development organisation; not a business with owners.',
    note: 'Tracked as a mission-aligned nonprofit employer, not as a Black-owned business.',
  },
  {
    name: 'Sponsors for Educational Opportunity',
    blackOwned: false,
    status: 'Not applicable',
    source: 'https://www.seo-usa.org/about/ \u2014 nonprofit education organisation.',
    note: 'Tracked as a mission-aligned nonprofit employer.',
  },
  {
    name: 'UNCF',
    blackOwned: false,
    status: 'Not applicable',
    source: 'https://uncf.org/about-us \u2014 nonprofit scholarship fund for HBCUs.',
    note: 'Tracked as a mission-aligned nonprofit employer.',
  },
  {
    name: 'SoLa Impact',
    blackOwned: true,
    status: 'Self-reported',
    source: 'https://www.solaimpact.com/about \u2014 impact real-estate developer led by Martin Muoto; describes its Black-led team and South LA mission. Company ownership structure not disclosed in a citable filing.',
    note: 'Manual-check employer.',
  },
];
