import type { CompanySize } from '../engine/types';

/**
 * Employer targets for the states the registry does not yet cover.
 *
 * The brief requires employers in all 50 states, and every posting must come
 * from the employer's own listing — no job boards, no leads. So coverage is built
 * the only honest way: name real employers headquartered in each state, then
 * resolve their own careers endpoint to a board the engine can read.
 *
 * `scripts/cover-states.ts` verifies each row. Nothing here is trusted until it
 * answers with live postings; unverified rows never reach the registry.
 */
export interface StateTarget {
  name: string;
  state: string;
  industry: string;
  size: CompanySize;
  /** The employer's own careers page, used to resolve Workday coordinates. */
  careersUrl: string;
  /** Slug guesses for the open ATS vendors, tried before the careers page. */
  slugs?: string[];
}

export const STATE_TARGETS: StateTarget[] = [
  /* ------------------------------------------------------------------ AL */
  { name: 'Regions Bank', state: 'AL', industry: 'Financial Services', size: 'Large', careersUrl: 'https://careers.regions.com/', slugs: ['regions'] },
  { name: 'Protective Life', state: 'AL', industry: 'Insurance', size: 'Large', careersUrl: 'https://www.protective.com/careers/' },
  { name: 'Vulcan Materials', state: 'AL', industry: 'Manufacturing', size: 'Large', careersUrl: 'https://www.vulcanmaterials.com/careers' },
  { name: 'UAB Medicine', state: 'AL', industry: 'Healthcare', size: 'Enterprise', careersUrl: 'https://www.uabmedicine.org/careers' },

  /* ------------------------------------------------------------------ AK */
  { name: 'Chenega Corporation', state: 'AK', industry: 'Government Contracting', size: 'Large', careersUrl: 'https://www.chenega.com/careers/' },
  { name: 'GCI', state: 'AK', industry: 'Telecom', size: 'Large', careersUrl: 'https://www.gci.com/careers' },
  { name: 'Bristol Bay Native Corporation', state: 'AK', industry: 'Government Contracting', size: 'Midsize', careersUrl: 'https://www.bbnc.net/careers/' },
  { name: 'Alyeska Pipeline Service Company', state: 'AK', industry: 'Energy', size: 'Midsize', careersUrl: 'https://www.alyeska-pipe.com/careers/' },

  /* ------------------------------------------------------------------ CT */
  { name: 'Charter Communications', state: 'CT', industry: 'Telecom', size: 'Enterprise', careersUrl: 'https://jobs.spectrum.com/' },
  { name: 'Synchrony', state: 'CT', industry: 'Financial Services', size: 'Large', careersUrl: 'https://careers.synchrony.com/', slugs: ['synchrony'] },
  { name: 'The Hartford', state: 'CT', industry: 'Insurance', size: 'Enterprise', careersUrl: 'https://careers.thehartford.com/', slugs: ['thehartford'] },
  { name: 'Booking Holdings', state: 'CT', industry: 'Technology', size: 'Enterprise', careersUrl: 'https://careers.bookingholdings.com/' },

  /* ------------------------------------------------------------------ FL */
  { name: 'Publix', state: 'FL', industry: 'Retail', size: 'Enterprise', careersUrl: 'https://jobs.publix.com/' },
  { name: 'Lennar', state: 'FL', industry: 'Real Estate', size: 'Enterprise', careersUrl: 'https://www.lennar.com/careers' },
  { name: 'Royal Caribbean Group', state: 'FL', industry: 'Hospitality', size: 'Enterprise', careersUrl: 'https://www.royalcaribbeangroup.com/careers/' },
  { name: 'AutoNation', state: 'FL', industry: 'Retail', size: 'Enterprise', careersUrl: 'https://www.autonation.com/careers' },
  { name: 'UKG', state: 'FL', industry: 'Software', size: 'Large', careersUrl: 'https://www.ukg.com/careers' },
  { name: 'Raymond James', state: 'FL', industry: 'Financial Services', size: 'Enterprise', careersUrl: 'https://www.raymondjames.com/careers' },

  /* ------------------------------------------------------------------ HI */
  { name: 'Hawaiian Airlines', state: 'HI', industry: 'Transportation', size: 'Large', careersUrl: 'https://careers.hawaiianairlines.com/' },
  { name: 'Bank of Hawaii', state: 'HI', industry: 'Financial Services', size: 'Large', careersUrl: 'https://www.boh.com/careers/' },
  { name: 'First Hawaiian Bank', state: 'HI', industry: 'Financial Services', size: 'Large', careersUrl: 'https://www.fhb.com/en/careers' },
  { name: 'The Queen\u2019s Health Systems', state: 'HI', industry: 'Healthcare', size: 'Large', careersUrl: 'https://www.queens.org/careers' },

  /* ------------------------------------------------------------------ ID */
  { name: 'Micron Technology', state: 'ID', industry: 'Manufacturing', size: 'Enterprise', careersUrl: 'https://careers.micron.com/' },
  { name: 'Albertsons Companies', state: 'ID', industry: 'Retail', size: 'Enterprise', careersUrl: 'https://careers.albertsonscompanies.com/' },
  { name: 'Clearwater Analytics', state: 'ID', industry: 'Software', size: 'Midsize', careersUrl: 'https://www.clearwateranalytics.com/careers', slugs: ['clearwateranalytics'] },
  { name: 'Idaho Power', state: 'ID', industry: 'Utilities', size: 'Midsize', careersUrl: 'https://www.idahopower.com/careers/' },

  /* ------------------------------------------------------------------ IA */
  { name: 'Principal Financial Group', state: 'IA', industry: 'Financial Services', size: 'Enterprise', careersUrl: 'https://www.principal.com/about-us/careers' },
  { name: 'Workiva', state: 'IA', industry: 'Software', size: 'Large', careersUrl: 'https://www.workiva.com/careers', slugs: ['workiva'] },
  { name: 'Casey\u2019s', state: 'IA', industry: 'Retail', size: 'Enterprise', careersUrl: 'https://www.caseys.com/careers' },
  { name: 'Hy-Vee', state: 'IA', industry: 'Retail', size: 'Enterprise', careersUrl: 'https://www.hy-vee.com/careers/' },

  /* ------------------------------------------------------------------ KS */
  { name: 'Garmin', state: 'KS', industry: 'Manufacturing', size: 'Enterprise', careersUrl: 'https://careers.garmin.com/' },
  { name: 'Spirit AeroSystems', state: 'KS', industry: 'Manufacturing', size: 'Enterprise', careersUrl: 'https://www.spiritaero.com/careers/' },
  { name: 'Koch Industries', state: 'KS', industry: 'Manufacturing', size: 'Enterprise', careersUrl: 'https://www.kochcareers.com/' },
  { name: 'AMC Theatres', state: 'KS', industry: 'Entertainment', size: 'Enterprise', careersUrl: 'https://www.amctheatres.com/careers' },

  /* ------------------------------------------------------------------ ME */
  { name: 'IDEXX Laboratories', state: 'ME', industry: 'Healthcare', size: 'Enterprise', careersUrl: 'https://www.idexx.com/en/about-idexx/careers/' },
  { name: 'Unum Group', state: 'ME', industry: 'Insurance', size: 'Enterprise', careersUrl: 'https://careers.unum.com/' },
  { name: 'WEX', state: 'ME', industry: 'Fintech', size: 'Large', careersUrl: 'https://careers.wexinc.com/', slugs: ['wex'] },
  { name: 'L.L.Bean', state: 'ME', industry: 'Retail', size: 'Large', careersUrl: 'https://www.llbean.com/careers' },

  /* ------------------------------------------------------------------ MI */
  { name: 'Ford Motor Company', state: 'MI', industry: 'Manufacturing', size: 'Enterprise', careersUrl: 'https://careers.ford.com/' },
  { name: 'General Motors', state: 'MI', industry: 'Manufacturing', size: 'Enterprise', careersUrl: 'https://search-careers.gm.com/' },
  { name: 'Whirlpool Corporation', state: 'MI', industry: 'Manufacturing', size: 'Enterprise', careersUrl: 'https://careers.whirlpool.com/' },
  { name: 'Rocket Companies', state: 'MI', industry: 'Financial Services', size: 'Enterprise', careersUrl: 'https://www.rocketcompanies.com/careers/' },
  { name: 'Meijer', state: 'MI', industry: 'Retail', size: 'Enterprise', careersUrl: 'https://jobs.meijer.com/' },

  /* ------------------------------------------------------------------ MS */
  { name: 'Trustmark National Bank', state: 'MS', industry: 'Financial Services', size: 'Large', careersUrl: 'https://www.trustmark.com/careers.html' },
  { name: 'Sanderson Farms', state: 'MS', industry: 'Manufacturing', size: 'Enterprise', careersUrl: 'https://www.sandersonfarms.com/careers/' },
  { name: 'Ergon', state: 'MS', industry: 'Energy', size: 'Large', careersUrl: 'https://www.ergon.com/careers' },
  { name: 'Blue Cross & Blue Shield of Mississippi', state: 'MS', industry: 'Health Insurance', size: 'Midsize', careersUrl: 'https://www.bcbsms.com/careers' },

  /* ------------------------------------------------------------------ MT */
  { name: 'First Interstate BancSystem', state: 'MT', industry: 'Financial Services', size: 'Large', careersUrl: 'https://www.firstinterstate.com/careers' },
  { name: 'NorthWestern Energy', state: 'MT', industry: 'Utilities', size: 'Midsize', careersUrl: 'https://www.northwesternenergy.com/careers' },
  { name: 'Glacier Bancorp', state: 'MT', industry: 'Financial Services', size: 'Midsize', careersUrl: 'https://www.glacierbancorp.com/careers' },
  { name: 'Providence Montana', state: 'MT', industry: 'Healthcare', size: 'Large', careersUrl: 'https://careers.providence.org/' },

  /* ------------------------------------------------------------------ NE */
  { name: 'Mutual of Omaha', state: 'NE', industry: 'Insurance', size: 'Enterprise', careersUrl: 'https://www.mutualofomaha.com/careers' },
  { name: 'Conagra Brands', state: 'NE', industry: 'Consumer Products', size: 'Enterprise', careersUrl: 'https://www.conagrabrands.com/careers' },
  { name: 'Kiewit', state: 'NE', industry: 'Construction', size: 'Enterprise', careersUrl: 'https://www.kiewit.com/careers/' },
  { name: 'Werner Enterprises', state: 'NE', industry: 'Logistics', size: 'Enterprise', careersUrl: 'https://www.werner.com/careers/' },
  { name: 'Nelnet', state: 'NE', industry: 'Financial Services', size: 'Large', careersUrl: 'https://nelnet.com/careers' },

  /* ------------------------------------------------------------------ NM */
  { name: 'PNM Resources', state: 'NM', industry: 'Utilities', size: 'Midsize', careersUrl: 'https://www.pnmresources.com/careers' },
  { name: 'Presbyterian Healthcare Services', state: 'NM', industry: 'Healthcare', size: 'Large', careersUrl: 'https://www.phs.org/careers' },
  { name: 'Nusenda Credit Union', state: 'NM', industry: 'Financial Services', size: 'Midsize', careersUrl: 'https://www.nusenda.org/careers' },

  /* ------------------------------------------------------------------ ND */
  { name: 'MDU Resources Group', state: 'ND', industry: 'Utilities', size: 'Large', careersUrl: 'https://www.mdu.com/careers' },
  { name: 'Noridian Healthcare Solutions', state: 'ND', industry: 'Healthcare', size: 'Midsize', careersUrl: 'https://www.noridian.com/careers' },
  { name: 'Bobcat Company', state: 'ND', industry: 'Manufacturing', size: 'Large', careersUrl: 'https://www.bobcat.com/company/careers' },

  /* ------------------------------------------------------------------ OK */
  { name: 'Devon Energy', state: 'OK', industry: 'Energy', size: 'Enterprise', careersUrl: 'https://www.devonenergy.com/careers' },
  { name: 'ONEOK', state: 'OK', industry: 'Energy', size: 'Enterprise', careersUrl: 'https://www.oneok.com/careers' },
  { name: 'Paycom', state: 'OK', industry: 'Software', size: 'Large', careersUrl: 'https://www.paycom.com/careers/', slugs: ['paycom'] },
  { name: 'BOK Financial', state: 'OK', industry: 'Financial Services', size: 'Large', careersUrl: 'https://www.bokf.com/careers' },
  { name: 'Love\u2019s Travel Stops', state: 'OK', industry: 'Retail', size: 'Enterprise', careersUrl: 'https://www.loves.com/careers' },

  /* ------------------------------------------------------------------ SC */
  { name: 'Blackbaud', state: 'SC', industry: 'Software', size: 'Large', careersUrl: 'https://www.blackbaud.com/careers', slugs: ['blackbaud'] },
  { name: 'Sonoco Products', state: 'SC', industry: 'Manufacturing', size: 'Enterprise', careersUrl: 'https://www.sonoco.com/careers' },
  { name: 'ScanSource', state: 'SC', industry: 'Technology', size: 'Midsize', careersUrl: 'https://www.scansource.com/en/careers' },
  { name: 'BlueCross BlueShield of South Carolina', state: 'SC', industry: 'Health Insurance', size: 'Enterprise', careersUrl: 'https://www.southcarolinablues.com/careers' },

  /* ------------------------------------------------------------------ SD */
  { name: 'Sanford Health', state: 'SD', industry: 'Healthcare', size: 'Enterprise', careersUrl: 'https://careers.sanfordhealth.org/' },
  { name: 'Avera Health', state: 'SD', industry: 'Healthcare', size: 'Large', careersUrl: 'https://www.avera.org/careers/' },
  { name: 'Daktronics', state: 'SD', industry: 'Manufacturing', size: 'Midsize', careersUrl: 'https://www.daktronics.com/en-us/about/careers' },
  { name: 'Black Hills Corporation', state: 'SD', industry: 'Utilities', size: 'Midsize', careersUrl: 'https://www.blackhillscorp.com/careers' },

  /* ------------------------------------------------------------------ TN */
  { name: 'AutoZone', state: 'TN', industry: 'Retail', size: 'Enterprise', careersUrl: 'https://www.autozone.com/careers' },
  { name: 'International Paper', state: 'TN', industry: 'Manufacturing', size: 'Enterprise', careersUrl: 'https://careers.internationalpaper.com/' },
  { name: 'Tractor Supply Company', state: 'TN', industry: 'Retail', size: 'Enterprise', careersUrl: 'https://careers.tractorsupply.com/' },
  { name: 'Bridgestone Americas', state: 'TN', industry: 'Manufacturing', size: 'Enterprise', careersUrl: 'https://www.bridgestoneamericas.com/en/careers' },
  { name: 'Eastman Chemical', state: 'TN', industry: 'Manufacturing', size: 'Enterprise', careersUrl: 'https://www.eastman.com/en/careers' },

  /* ------------------------------------------------------------------ VT */
  { name: 'National Life Group', state: 'VT', industry: 'Insurance', size: 'Large', careersUrl: 'https://www.nationallife.com/careers' },
  { name: 'Green Mountain Power', state: 'VT', industry: 'Utilities', size: 'Midsize', careersUrl: 'https://greenmountainpower.com/careers/' },
  { name: 'The University of Vermont Health Network', state: 'VT', industry: 'Healthcare', size: 'Large', careersUrl: 'https://www.uvmhealth.org/careers' },
  { name: 'Dealer.com', state: 'VT', industry: 'Software', size: 'Midsize', careersUrl: 'https://www.dealer.com/careers/' },

  /* ------------------------------------------------------------------ WV */
  { name: 'WVU Medicine', state: 'WV', industry: 'Healthcare', size: 'Enterprise', careersUrl: 'https://wvumedicine.org/careers/' },
  { name: 'United Bankshares', state: 'WV', industry: 'Financial Services', size: 'Large', careersUrl: 'https://www.ubsi-inc.com/careers' },
  { name: 'City Holding Company', state: 'WV', industry: 'Financial Services', size: 'Midsize', careersUrl: 'https://www.bankatcity.com/careers' },
  { name: 'Charleston Area Medical Center', state: 'WV', industry: 'Healthcare', size: 'Large', careersUrl: 'https://www.camc.org/careers' },

  /* ------------------------------------------------------------------ WI */
  { name: 'Northwestern Mutual', state: 'WI', industry: 'Financial Services', size: 'Enterprise', careersUrl: 'https://careers.northwesternmutual.com/' },
  { name: 'ManpowerGroup', state: 'WI', industry: 'Staffing', size: 'Enterprise', careersUrl: 'https://www.manpowergroup.com/en/careers' },
  { name: 'Rockwell Automation', state: 'WI', industry: 'Manufacturing', size: 'Enterprise', careersUrl: 'https://www.rockwellautomation.com/en-us/company/careers.html' },
  { name: 'Kohl\u2019s', state: 'WI', industry: 'Retail', size: 'Enterprise', careersUrl: 'https://careers.kohls.com/' },
  { name: 'Exact Sciences', state: 'WI', industry: 'Healthcare', size: 'Large', careersUrl: 'https://careers.exactsciences.com/' },

  /* ------------------------------------------------------------------ WY */
  { name: 'University of Wyoming', state: 'WY', industry: 'Education', size: 'Large', careersUrl: 'https://www.uwyo.edu/hr/careers/' },
  { name: 'Cheyenne Regional Medical Center', state: 'WY', industry: 'Healthcare', size: 'Midsize', careersUrl: 'https://www.cheyenneregional.org/careers/' },
  { name: 'Taco John\u2019s', state: 'WY', industry: 'Retail', size: 'Midsize', careersUrl: 'https://www.tacojohns.com/careers/' },
  { name: 'Blue Cross Blue Shield of Wyoming', state: 'WY', industry: 'Health Insurance', size: 'Small', careersUrl: 'https://www.bcbswy.com/careers' },

  /* ------------------------------- top-up states with thin coverage */
  { name: 'Alaska Air Group', state: 'WA', industry: 'Transportation', size: 'Enterprise', careersUrl: 'https://careers.alaskaair.com/' },
  { name: 'Xcel Energy', state: 'MN', industry: 'Utilities', size: 'Enterprise', careersUrl: 'https://jobs.xcelenergy.com/' },
  { name: 'Cleveland Clinic', state: 'OH', industry: 'Healthcare', size: 'Enterprise', careersUrl: 'https://jobs.clevelandclinic.org/' },
  { name: 'Baylor Scott & White Health', state: 'TX', industry: 'Healthcare', size: 'Enterprise', careersUrl: 'https://jobs.bswhealth.com/' },
  { name: 'Intermountain Health', state: 'UT', industry: 'Healthcare', size: 'Enterprise', careersUrl: 'https://careers.intermountainhealth.org/' },
  { name: 'Sentara Health', state: 'VA', industry: 'Healthcare', size: 'Large', careersUrl: 'https://www.sentaracareers.com/' },
  { name: 'Providence', state: 'WA', industry: 'Healthcare', size: 'Enterprise', careersUrl: 'https://careers.providence.org/' },
  { name: 'Mass General Brigham', state: 'MA', industry: 'Healthcare', size: 'Enterprise', careersUrl: 'https://careers.massgeneralbrigham.org/' },
  { name: 'Banner Health', state: 'AZ', industry: 'Healthcare', size: 'Enterprise', careersUrl: 'https://careers.bannerhealth.com/' },
  { name: 'CommonSpirit Health', state: 'IL', industry: 'Healthcare', size: 'Enterprise', careersUrl: 'https://careers.commonspirit.org/' },
  { name: 'Ascension', state: 'MO', industry: 'Healthcare', size: 'Enterprise', careersUrl: 'https://careers.ascension.org/' },
  { name: 'Ochsner Health', state: 'LA', industry: 'Healthcare', size: 'Large', careersUrl: 'https://careers.ochsner.org/' },
  { name: 'Houston Methodist', state: 'TX', industry: 'Healthcare', size: 'Large', careersUrl: 'https://careers.houstonmethodist.org/' },
  { name: 'Cedars-Sinai', state: 'CA', industry: 'Healthcare', size: 'Large', careersUrl: 'https://careers.cedars-sinai.org/' },
  { name: 'Stanford Health Care', state: 'CA', industry: 'Healthcare', size: 'Large', careersUrl: 'https://careers.stanfordhealthcare.org/' },
  { name: 'Geisinger', state: 'PA', industry: 'Healthcare', size: 'Large', careersUrl: 'https://jobs.geisinger.org/' },
  { name: 'Highmark Health', state: 'PA', industry: 'Health Insurance', size: 'Enterprise', careersUrl: 'https://careers.highmarkhealth.org/' },
  { name: 'Elevance Health', state: 'IN', industry: 'Health Insurance', size: 'Enterprise', careersUrl: 'https://careers.elevancehealth.com/' },
  { name: 'Humana', state: 'KY', industry: 'Health Insurance', size: 'Enterprise', careersUrl: 'https://careers.humana.com/' },
  { name: 'Centene', state: 'MO', industry: 'Health Insurance', size: 'Enterprise', careersUrl: 'https://careers.centene.com/' },
  { name: 'Molina Healthcare', state: 'CA', industry: 'Health Insurance', size: 'Large', careersUrl: 'https://careers.molinahealthcare.com/' },
  { name: 'UnitedHealth Group', state: 'MN', industry: 'Health Insurance', size: 'Enterprise', careersUrl: 'https://careers.unitedhealthgroup.com/' },
  { name: 'Cigna', state: 'CT', industry: 'Health Insurance', size: 'Enterprise', careersUrl: 'https://careers.thecignagroup.com/' },
  { name: 'Guidehouse', state: 'VA', industry: 'Consulting', size: 'Large', careersUrl: 'https://careers.guidehouse.com/' },
  { name: 'ICF', state: 'VA', industry: 'Consulting', size: 'Large', careersUrl: 'https://www.icf.com/careers' },
  { name: 'Booz Allen Hamilton', state: 'VA', industry: 'Government Contracting', size: 'Enterprise', careersUrl: 'https://careers.boozallen.com/' },
  { name: 'Leidos', state: 'VA', industry: 'Government Contracting', size: 'Enterprise', careersUrl: 'https://careers.leidos.com/' },
  { name: 'Accenture', state: 'IL', industry: 'Consulting', size: 'Enterprise', careersUrl: 'https://www.accenture.com/us-en/careers' },
  { name: 'Deloitte', state: 'NY', industry: 'Consulting', size: 'Enterprise', careersUrl: 'https://apply.deloitte.com/careers' },
  { name: 'Slalom', state: 'WA', industry: 'Consulting', size: 'Large', careersUrl: 'https://www.slalom.com/us/en/careers' },
  { name: 'Protiviti', state: 'CA', industry: 'Consulting', size: 'Large', careersUrl: 'https://www.protiviti.com/us-en/careers' },
  { name: 'Huron Consulting Group', state: 'IL', industry: 'Consulting', size: 'Large', careersUrl: 'https://www.huronconsultinggroup.com/careers' },
  { name: 'Ankura', state: 'DC', industry: 'Consulting', size: 'Large', careersUrl: 'https://ankura.com/careers/' },
  { name: 'Public Consulting Group', state: 'MA', industry: 'Consulting', size: 'Large', careersUrl: 'https://www.publicconsultinggroup.com/careers/' },
  { name: 'RAND Corporation', state: 'CA', industry: 'Consulting', size: 'Large', careersUrl: 'https://www.rand.org/jobs.html' },
  { name: 'Capital One', state: 'VA', industry: 'Financial Services', size: 'Enterprise', careersUrl: 'https://www.capitalonecareers.com/' },
  { name: 'Bank of America', state: 'NC', industry: 'Financial Services', size: 'Enterprise', careersUrl: 'https://careers.bankofamerica.com/' },
  { name: 'Citigroup', state: 'NY', industry: 'Financial Services', size: 'Enterprise', careersUrl: 'https://jobs.citi.com/' },
  { name: 'Mastercard', state: 'NY', industry: 'Financial Services', size: 'Enterprise', careersUrl: 'https://careers.mastercard.com/' },
  { name: 'State Street', state: 'MA', industry: 'Financial Services', size: 'Enterprise', careersUrl: 'https://careers.statestreet.com/' },
  { name: 'Northern Trust', state: 'IL', industry: 'Financial Services', size: 'Enterprise', careersUrl: 'https://careers.northerntrust.com/' },
  { name: 'Prudential Financial', state: 'NJ', industry: 'Insurance', size: 'Enterprise', careersUrl: 'https://jobs.prudential.com/' },
  { name: 'Nationwide', state: 'OH', industry: 'Insurance', size: 'Enterprise', careersUrl: 'https://careers.nationwide.com/' },
  { name: 'Target', state: 'MN', industry: 'Retail', size: 'Enterprise', careersUrl: 'https://corporate.target.com/careers' },
  { name: 'Nordstrom', state: 'WA', industry: 'Retail', size: 'Enterprise', careersUrl: 'https://careers.nordstrom.com/' },
  { name: 'Nike', state: 'OR', industry: 'Consumer Products', size: 'Enterprise', careersUrl: 'https://jobs.nike.com/' },
  { name: 'The Coca-Cola Company', state: 'GA', industry: 'Consumer Products', size: 'Enterprise', careersUrl: 'https://careers.coca-colacompany.com/' },
  { name: 'General Mills', state: 'MN', industry: 'Consumer Products', size: 'Enterprise', careersUrl: 'https://careers.generalmills.com/' },
  { name: 'Xcel Energy Holdings', state: 'CO', industry: 'Utilities', size: 'Enterprise', careersUrl: 'https://jobs.xcelenergy.com/' },
];

/**
 * Employers in states where no public board could be resolved.
 *
 * They are seeded as tracked employers with their own careers link, so every state is
 * represented in the employer list and nothing is silently missing. They are marked
 * inactive with the reason recorded, exactly like the ownership watchlist: the tracker
 * never claims it searched a board it cannot read.
 */
export const TRACKED_STATE_EMPLOYERS: StateTarget[] = [
  { name: 'Regions Bank', state: 'AL', industry: 'Financial Services', size: 'Large', careersUrl: 'https://careers.regions.com/' },
  { name: 'Protective Life', state: 'AL', industry: 'Insurance', size: 'Large', careersUrl: 'https://www.protective.com/careers/' },
  { name: 'Vulcan Materials', state: 'AL', industry: 'Manufacturing', size: 'Large', careersUrl: 'https://www.vulcanmaterials.com/careers' },
  { name: 'UAB Medicine', state: 'AL', industry: 'Healthcare', size: 'Enterprise', careersUrl: 'https://www.uabmedicine.org/careers' },
  { name: 'Chenega Corporation', state: 'AK', industry: 'Government Contracting', size: 'Large', careersUrl: 'https://www.chenega.com/careers/' },
  { name: 'GCI', state: 'AK', industry: 'Telecom', size: 'Large', careersUrl: 'https://www.gci.com/careers' },
  { name: 'Bristol Bay Native Corporation', state: 'AK', industry: 'Government Contracting', size: 'Midsize', careersUrl: 'https://www.bbnc.net/careers/' },
  { name: 'Alyeska Pipeline Service Company', state: 'AK', industry: 'Energy', size: 'Midsize', careersUrl: 'https://www.alyeska-pipe.com/careers/' },
  { name: 'Charter Communications', state: 'CT', industry: 'Telecom', size: 'Enterprise', careersUrl: 'https://jobs.spectrum.com/' },
  { name: 'Synchrony', state: 'CT', industry: 'Financial Services', size: 'Large', careersUrl: 'https://careers.synchrony.com/' },
  { name: 'The Hartford', state: 'CT', industry: 'Insurance', size: 'Enterprise', careersUrl: 'https://careers.thehartford.com/' },
  { name: 'Booking Holdings', state: 'CT', industry: 'Technology', size: 'Enterprise', careersUrl: 'https://careers.bookingholdings.com/' },
  { name: 'Publix', state: 'FL', industry: 'Retail', size: 'Enterprise', careersUrl: 'https://jobs.publix.com/' },
  { name: 'Lennar', state: 'FL', industry: 'Real Estate', size: 'Enterprise', careersUrl: 'https://www.lennar.com/careers' },
  { name: 'Royal Caribbean Group', state: 'FL', industry: 'Hospitality', size: 'Enterprise', careersUrl: 'https://www.royalcaribbeangroup.com/careers/' },
  { name: 'AutoNation', state: 'FL', industry: 'Retail', size: 'Enterprise', careersUrl: 'https://www.autonation.com/careers' },
  { name: 'UKG', state: 'FL', industry: 'Software', size: 'Large', careersUrl: 'https://www.ukg.com/careers' },
  { name: 'Raymond James', state: 'FL', industry: 'Financial Services', size: 'Enterprise', careersUrl: 'https://www.raymondjames.com/careers' },
  { name: 'Hawaiian Airlines', state: 'HI', industry: 'Transportation', size: 'Large', careersUrl: 'https://careers.hawaiianairlines.com/' },
  { name: 'Bank of Hawaii', state: 'HI', industry: 'Financial Services', size: 'Large', careersUrl: 'https://www.boh.com/careers/' },
  { name: 'First Hawaiian Bank', state: 'HI', industry: 'Financial Services', size: 'Large', careersUrl: 'https://www.fhb.com/en/careers' },
  { name: 'The Queen\u2019s Health Systems', state: 'HI', industry: 'Healthcare', size: 'Large', careersUrl: 'https://www.queens.org/careers' },
  { name: 'Garmin', state: 'KS', industry: 'Manufacturing', size: 'Enterprise', careersUrl: 'https://careers.garmin.com/' },
  { name: 'Spirit AeroSystems', state: 'KS', industry: 'Manufacturing', size: 'Enterprise', careersUrl: 'https://www.spiritaero.com/careers/' },
  { name: 'Koch Industries', state: 'KS', industry: 'Manufacturing', size: 'Enterprise', careersUrl: 'https://www.kochcareers.com/' },
  { name: 'AMC Theatres', state: 'KS', industry: 'Entertainment', size: 'Enterprise', careersUrl: 'https://www.amctheatres.com/careers' },
  { name: 'IDEXX Laboratories', state: 'ME', industry: 'Healthcare', size: 'Enterprise', careersUrl: 'https://www.idexx.com/en/about-idexx/careers/' },
  { name: 'Unum Group', state: 'ME', industry: 'Insurance', size: 'Enterprise', careersUrl: 'https://careers.unum.com/' },
  { name: 'WEX', state: 'ME', industry: 'Fintech', size: 'Large', careersUrl: 'https://careers.wexinc.com/' },
  { name: 'L.L.Bean', state: 'ME', industry: 'Retail', size: 'Large', careersUrl: 'https://www.llbean.com/careers' },
  { name: 'Mutual of Omaha', state: 'NE', industry: 'Insurance', size: 'Enterprise', careersUrl: 'https://www.mutualofomaha.com/careers' },
  { name: 'Conagra Brands', state: 'NE', industry: 'Consumer Products', size: 'Enterprise', careersUrl: 'https://www.conagrabrands.com/careers' },
  { name: 'Kiewit', state: 'NE', industry: 'Construction', size: 'Enterprise', careersUrl: 'https://www.kiewit.com/careers/' },
  { name: 'Werner Enterprises', state: 'NE', industry: 'Logistics', size: 'Enterprise', careersUrl: 'https://www.werner.com/careers/' },
  { name: 'Nelnet', state: 'NE', industry: 'Financial Services', size: 'Large', careersUrl: 'https://nelnet.com/careers' },
  { name: 'PNM Resources', state: 'NM', industry: 'Utilities', size: 'Midsize', careersUrl: 'https://www.pnmresources.com/careers' },
  { name: 'Presbyterian Healthcare Services', state: 'NM', industry: 'Healthcare', size: 'Large', careersUrl: 'https://www.phs.org/careers' },
  { name: 'Nusenda Credit Union', state: 'NM', industry: 'Financial Services', size: 'Midsize', careersUrl: 'https://www.nusenda.org/careers' },
  { name: 'MDU Resources Group', state: 'ND', industry: 'Utilities', size: 'Large', careersUrl: 'https://www.mdu.com/careers' },
  { name: 'Noridian Healthcare Solutions', state: 'ND', industry: 'Healthcare', size: 'Midsize', careersUrl: 'https://www.noridian.com/careers' },
  { name: 'Bobcat Company', state: 'ND', industry: 'Manufacturing', size: 'Large', careersUrl: 'https://www.bobcat.com/company/careers' },
  { name: 'Sanford Health', state: 'SD', industry: 'Healthcare', size: 'Enterprise', careersUrl: 'https://careers.sanfordhealth.org/' },
  { name: 'Avera Health', state: 'SD', industry: 'Healthcare', size: 'Large', careersUrl: 'https://www.avera.org/careers/' },
  { name: 'Daktronics', state: 'SD', industry: 'Manufacturing', size: 'Midsize', careersUrl: 'https://www.daktronics.com/en-us/about/careers' },
  { name: 'Black Hills Corporation', state: 'SD', industry: 'Utilities', size: 'Midsize', careersUrl: 'https://www.blackhillscorp.com/careers' },
  { name: 'AutoZone', state: 'TN', industry: 'Retail', size: 'Enterprise', careersUrl: 'https://www.autozone.com/careers' },
  { name: 'International Paper', state: 'TN', industry: 'Manufacturing', size: 'Enterprise', careersUrl: 'https://careers.internationalpaper.com/' },
  { name: 'Tractor Supply Company', state: 'TN', industry: 'Retail', size: 'Enterprise', careersUrl: 'https://careers.tractorsupply.com/' },
  { name: 'Bridgestone Americas', state: 'TN', industry: 'Manufacturing', size: 'Enterprise', careersUrl: 'https://www.bridgestoneamericas.com/en/careers' },
  { name: 'Eastman Chemical', state: 'TN', industry: 'Manufacturing', size: 'Enterprise', careersUrl: 'https://www.eastman.com/en/careers' },
  { name: 'National Life Group', state: 'VT', industry: 'Insurance', size: 'Large', careersUrl: 'https://www.nationallife.com/careers' },
  { name: 'Green Mountain Power', state: 'VT', industry: 'Utilities', size: 'Midsize', careersUrl: 'https://greenmountainpower.com/careers/' },
  { name: 'The University of Vermont Health Network', state: 'VT', industry: 'Healthcare', size: 'Large', careersUrl: 'https://www.uvmhealth.org/careers' },
  { name: 'Dealer.com', state: 'VT', industry: 'Software', size: 'Midsize', careersUrl: 'https://www.dealer.com/careers/' },
  { name: 'WVU Medicine', state: 'WV', industry: 'Healthcare', size: 'Enterprise', careersUrl: 'https://wvumedicine.org/careers/' },
  { name: 'United Bankshares', state: 'WV', industry: 'Financial Services', size: 'Large', careersUrl: 'https://www.ubsi-inc.com/careers' },
  { name: 'City Holding Company', state: 'WV', industry: 'Financial Services', size: 'Midsize', careersUrl: 'https://www.bankatcity.com/careers' },
  { name: 'Charleston Area Medical Center', state: 'WV', industry: 'Healthcare', size: 'Large', careersUrl: 'https://www.camc.org/careers' },
  { name: 'University of Wyoming', state: 'WY', industry: 'Education', size: 'Large', careersUrl: 'https://www.uwyo.edu/hr/careers/' },
  { name: 'Cheyenne Regional Medical Center', state: 'WY', industry: 'Healthcare', size: 'Midsize', careersUrl: 'https://www.cheyenneregional.org/careers/' },
  { name: 'Taco John\u2019s', state: 'WY', industry: 'Retail', size: 'Midsize', careersUrl: 'https://www.tacojohns.com/careers/' },
  { name: 'Blue Cross Blue Shield of Wyoming', state: 'WY', industry: 'Health Insurance', size: 'Small', careersUrl: 'https://www.bcbswy.com/careers' },
  { name: 'Alaska Air Group', state: 'WA', industry: 'Transportation', size: 'Enterprise', careersUrl: 'https://careers.alaskaair.com/' },
  { name: 'Baylor Scott & White Health', state: 'TX', industry: 'Healthcare', size: 'Enterprise', careersUrl: 'https://jobs.bswhealth.com/' },
  { name: 'Intermountain Health', state: 'UT', industry: 'Healthcare', size: 'Enterprise', careersUrl: 'https://careers.intermountainhealth.org/' },
  { name: 'Providence', state: 'WA', industry: 'Healthcare', size: 'Enterprise', careersUrl: 'https://careers.providence.org/' },
  { name: 'Banner Health', state: 'AZ', industry: 'Healthcare', size: 'Enterprise', careersUrl: 'https://careers.bannerhealth.com/' },
  { name: 'Ascension', state: 'MO', industry: 'Healthcare', size: 'Enterprise', careersUrl: 'https://careers.ascension.org/' },
  { name: 'Houston Methodist', state: 'TX', industry: 'Healthcare', size: 'Large', careersUrl: 'https://careers.houstonmethodist.org/' },
  { name: 'Humana', state: 'KY', industry: 'Health Insurance', size: 'Enterprise', careersUrl: 'https://careers.humana.com/' },
  { name: 'Centene', state: 'MO', industry: 'Health Insurance', size: 'Enterprise', careersUrl: 'https://careers.centene.com/' },
  { name: 'Cigna', state: 'CT', industry: 'Health Insurance', size: 'Enterprise', careersUrl: 'https://careers.thecignagroup.com/' },
  { name: 'Slalom', state: 'WA', industry: 'Consulting', size: 'Large', careersUrl: 'https://www.slalom.com/us/en/careers' },
  { name: 'Prudential Financial', state: 'NJ', industry: 'Insurance', size: 'Enterprise', careersUrl: 'https://jobs.prudential.com/' },
  { name: 'Nordstrom', state: 'WA', industry: 'Retail', size: 'Enterprise', careersUrl: 'https://careers.nordstrom.com/' },
  { name: 'Nike', state: 'OR', industry: 'Consumer Products', size: 'Enterprise', careersUrl: 'https://jobs.nike.com/' },
];
