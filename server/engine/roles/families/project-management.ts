import { BOTH, type RoleFamily } from '../types';

/**
 * Project, program and delivery management.
 *
 * Titles are matched broadly (employers invent titles constantly) but roles that
 * only mention projects incidentally are rejected, e.g. "Software Engineer,
 * Project Atlas". The two lanes mirror the two resumes on file: enterprise
 * PMO/delivery and construction/infrastructure delivery.
 */

const LEADS = String.raw`(?:project|program|programme|portfolio|pmo|delivery|implementation|transformation|integration|deployment|onboarding|migration|pmo operations)`;
const RANKS = String.raw`(?:manager|management|director|lead|leader|head|officer|principal|consultant|specialist|coordinator|administrator|supervisor)`;

const SEARCH_LEADS = ['project', 'program', 'programme', 'portfolio', 'pmo', 'delivery', 'implementation', 'transformation', 'integration', 'deployment', 'onboarding', 'migration'];
const SEARCH_RANKS = ['manager', 'management', 'director', 'lead', 'coordinator', 'consultant', 'specialist', 'officer', 'principal'];
const SEARCH_EXTRA = [
  'technical program manager', 'technical project manager', 'senior project manager', 'senior program manager',
  'it project manager', 'it program manager', 'program management office', 'project management office',
  'chief of staff', 'business operations manager', 'change manager', 'change management', 'operational excellence',
  'strategic initiatives', 'continuous improvement', 'scrum master', 'agile delivery', 'release manager',
  'engagement manager', 'customer implementation', 'clinical program manager', 'construction project manager',
  'capital projects', 'infrastructure program manager', 'epic project manager', 'erp project manager',
  'workday project manager', 'salesforce project manager', 'digital transformation', 'business transformation',
];

/** The 86 nontechnical titles named in Jeanine's master prompt (§3). Every one is searched and recognised. */
export const MASTER_PROMPT_NONTECHNICAL_TITLES = [
  'Nontechnical Project Manager', 'Nontechnical Program Manager', 'Business Project Manager',
  'Business Program Manager', 'Senior Business Project Manager', 'Operations Project Manager',
  'Operations Program Manager', 'Senior Operations Project Manager', 'Senior Operations Program Manager',
  'Strategic Project Manager', 'Strategic Program Manager', 'Strategic Initiatives Manager',
  'Corporate Project Manager', 'Enterprise Project Manager', 'Enterprise Program Manager',
  'Administrative Project Manager', 'Business Transformation Project Manager',
  'Business Transformation Program Manager', 'Process Improvement Project Manager',
  'Operational Excellence Program Manager', 'Organizational Change Project Manager',
  'Change Management Program Manager', 'Marketing Project Manager', 'Marketing Program Manager',
  'Creative Project Manager', 'Creative Operations Project Manager', 'Advertising Project Manager',
  'Agency Project Manager', 'Communications Project Manager', 'Brand Project Manager',
  'Campaign Project Manager', 'Event Project Manager', 'Event Program Manager',
  'Healthcare Operations Project Manager', 'Healthcare Program Manager',
  'Healthcare Administration Project Manager', 'Healthcare Transformation Project Manager',
  'Health Insurance Program Manager', 'Human Resources Project Manager', 'Human Resources Program Manager',
  'People Operations Program Manager', 'Workforce Transformation Project Manager',
  'Procurement Project Manager', 'Procurement Program Manager', 'Strategic Sourcing Project Manager',
  'Vendor Management Program Manager', 'Contract Management Program Manager', 'Compliance Project Manager',
  'Regulatory Project Manager', 'Regulatory Program Manager', 'Government Project Manager',
  'Government Program Manager', 'Federal Contract Project Manager', 'Government Services Program Manager',
  'Public Sector Project Manager', 'Consulting Project Manager', 'Consulting Program Manager',
  'Client Services Project Manager', 'Client Delivery Program Manager', 'Professional Services Project Manager',
  'Professional Services Program Manager', 'Customer Success Program Manager',
  'Customer Implementation Program Manager', 'Education Project Manager', 'University Program Manager',
  'Higher Education Program Manager', 'Nonprofit Program Manager', 'Foundation Program Manager',
  'Grants Program Manager', 'Construction Project Manager', 'Construction Program Manager',
  'Facilities Project Manager', 'Infrastructure Program Manager', 'Manufacturing Project Manager',
  'Manufacturing Program Manager', 'Supply Chain Project Manager', 'Logistics Program Manager',
  'Quality Improvement Project Manager', 'Quality Assurance Program Manager', 'Portfolio Manager',
  'PMO Manager', 'PMO Director', 'Senior Project Manager', 'Senior Program Manager',
  'Project Director', 'Program Director',
];

/** The 46 technical titles named in Jeanine's master prompt (§4). */
export const MASTER_PROMPT_TECHNICAL_TITLES = [
  'Technical Project Manager', 'Technical Program Manager', 'IT Project Manager', 'IT Program Manager',
  'Senior Technical Project Manager', 'Senior Technical Program Manager', 'Enterprise Systems Project Manager',
  'Enterprise Systems Program Manager', 'Software Implementation Project Manager',
  'Software Delivery Program Manager', 'SaaS Implementation Project Manager', 'SaaS Program Manager',
  'Digital Transformation Project Manager', 'Digital Transformation Program Manager',
  'AI Implementation Project Manager', 'AI Program Manager', 'AI Product Delivery Program Manager',
  'Automation Project Manager', 'Workflow Automation Program Manager', 'Healthcare IT Project Manager',
  'Healthcare IT Program Manager', 'Epic Project Manager', 'Electronic Health Record Project Manager',
  'Workday Project Manager', 'Workday Program Manager', 'ERP Project Manager', 'ERP Program Manager',
  'Salesforce Project Manager', 'Salesforce Program Manager', 'ServiceNow Project Manager',
  'Infrastructure Project Manager', 'IT Infrastructure Program Manager', 'Disaster Recovery Project Manager',
  'Business Continuity Program Manager', 'Cybersecurity Project Manager', 'Cybersecurity Program Manager',
  'IT Transformation Project Manager', 'Systems Integration Project Manager', 'Implementation Manager',
  'Enterprise Implementation Manager', 'Technology Delivery Manager', 'Technical Delivery Manager',
  'PMO Manager', 'Technical Portfolio Manager', 'Program Director', 'Senior Project Manager',
];

function buildSearchTerms(): string[] {
  const terms = new Set<string>();
  for (const lead of SEARCH_LEADS) for (const rank of SEARCH_RANKS) terms.add(`${lead} ${rank}`);
  for (const extra of SEARCH_EXTRA) terms.add(extra);
  // The master prompt's own title lists are searched verbatim as well, so a board is asked for
  // "Grants Program Manager" or "Workday Project Manager" by name, not only for the generic pairings.
  for (const title of [...MASTER_PROMPT_NONTECHNICAL_TITLES, ...MASTER_PROMPT_TECHNICAL_TITLES]) terms.add(title.toLowerCase());
  return [...terms];
}

export const PROJECT_MANAGEMENT: RoleFamily = {
  id: 'project-management',
  label: 'Project & Program Management',
  shortLabel: 'PM',
  jobNoun: 'PM roles',
  defaultBoardName: 'Remote PM Radar',
  defaultRoleFamily: 'Remote project, program and delivery roles in the United States',

  /**
   * Search phrases used against boards that support server-side search (Workday).
   * These mirror the title vocabulary in the brief so a search covers the same ground
   * the title matcher does, instead of only the two most obvious phrasings.
   */
  // Every lead/rank pairing the title patterns recognise is also a search phrase, so a board
  // is asked for each variant rather than a fixed handful (no numeric cap on searches).
  searchTerms: buildSearchTerms(),

  titlePatterns: [
    // "Project Manager", "Senior Program Manager", "Technical Project Management"
    new RegExp(String.raw`\b${LEADS}\b[\s,\-/]+(?:[a-z&,\- ]{0,28}?)\b${RANKS}\b`, 'i'),
    // "Manager, Project Management", "Director of Program Management", "Head of PMO"
    new RegExp(String.raw`\b${RANKS}\b[\s,\-]*(?:of\s+)?(?:[a-z&,\- ]{0,20}?)\b${LEADS}\b`, 'i'),
    /\bpmo\b/i,
    /\bprogram management office\b/i,
    /\bproject management office\b/i,
    /\bchief of staff\b/i,
    /\btransformation (?:lead|manager|director)\b/i,
    /\bchange management (?:lead|manager|director)\b/i,
    /\boperational excellence (?:manager|lead|director)\b/i,
    /\bstrategic initiatives (?:manager|lead|director)\b/i,
    /\bcontinuous improvement (?:manager|lead|director)\b/i,
  ],

  disqualifiers: [
    /\b(software|backend|frontend|full[- ]stack|data|machine learning|ml|platform|infrastructure|network|security|cloud|devops|qa|test|systems|hardware|electrical|mechanical|civil|project|field|site|construction) engineer\b/i,
    /\b(developer|programmer|architect|scientist|researcher|designer|accountant|bookkeeper|attorney|lawyer|paralegal|nurse|physician|therapist|pharmacist|electrician|plumber|welder|carpenter|estimator|superintendent|technician|recruiter|sourcer|account executive|sales representative|sales manager|business development representative|customer support representative|service desk|help desk)\b/i,
    /\b(assistant|intern|apprentice)\b/i,
  ],

  // Lending, trust and investment "portfolio managers" manage money, not projects.
  hardExclusions: [
    /\b(commercial|trust|loan|lending|credit|investment|wealth|asset|mortgage|real estate|client|insurance|equity|fixed income|fund) portfolio manager\b/i,
  ],

  disqualifiedAllow: /\b(project manager|program manager|programme manager|project director|program director|pmo (?:manager|director|lead)|portfolio manager|project management)\b/i,

  juniorPattern: /\b(associate|junior|jr\.?|assistant|coordinator i\b|entry[- ]level|intern)\b/i,

  titleFamilies: [
    { label: 'PMO', patterns: [/pmo|project management office|program management office/] },
    { label: 'Portfolio', patterns: [/portfolio/] },
    { label: 'Program', patterns: [/program|programme/] },
    { label: 'Transformation', patterns: [/transformation|change management/] },
    { label: 'Implementation / Delivery', patterns: [/implementation|deployment|integration|migration|onboarding|delivery/] },
    { label: 'Project', patterns: [/project/] },
  ],
  defaultTitleFamily: 'Project',

  lanes: [
    { id: 'exec', label: 'Enterprise / PMO', resume: 'Jeanine_Kendricks_Resume2026.pdf' },
    { id: 'construction', label: 'Construction / Infrastructure', resume: 'Jeanine_Kendricks_Resume_Construction_PM.pdf' },
  ],
  defaultLane: 'exec',

  competencies: [
    {
      label: 'Program & portfolio leadership', weight: 10, lane: BOTH,
      keywords: ['program management', 'program manager', 'portfolio management', 'portfolio of projects', 'multi-project', 'program governance', 'program delivery', 'enterprise program', 'strategic initiatives'],
    },
    {
      label: 'PMO, governance & delivery controls', weight: 9, lane: 'exec',
      keywords: ['pmo', 'project management office', 'program management office', 'governance', 'steering committee', 'stage gate', 'project controls', 'delivery methodology', 'raid log', 'delivery assurance'],
    },
    {
      label: 'Budget & financial oversight', weight: 9, lane: BOTH,
      keywords: ['budget', 'budgeting', 'p&l', 'financial oversight', 'forecast', 'cost control', 'capital expenditure', 'capex', 'opex', 'financial management', 'cost savings', 'million dollar'],
    },
    {
      label: 'Vendor, procurement & contract management', weight: 9, lane: BOTH,
      keywords: ['vendor management', 'procurement', 'contract management', 'contracts', 'strategic sourcing', 'rfp', 'rfi', 'supplier', 'third-party', 'statement of work', 'sow', 'negotiation'],
    },
    {
      label: 'Executive & cross-functional stakeholder leadership', weight: 8, lane: BOTH,
      keywords: ['stakeholder', 'cross-functional', 'executive', 'steering', 'board of directors', 'business partner', 'senior leadership', 'collaborate across'],
    },
    {
      label: 'Risk, compliance & regulatory programs', weight: 7, lane: BOTH,
      keywords: ['risk management', 'risk register', 'compliance', 'regulatory', 'hipaa', 'sox', 'audit', 'issue management', 'mitigation'],
    },
    {
      label: 'Enterprise systems & SaaS implementation', weight: 8, lane: 'exec',
      keywords: ['workday', 'peoplesoft', 'salesforce', 'servicenow', 'erp', 'sap', 'oracle', 'saas implementation', 'crm', 'systems integration', 'implementation', 'configuration', 'data migration'],
    },
    {
      label: 'Healthcare & clinical systems', weight: 8, lane: 'exec',
      keywords: ['healthcare', 'health system', 'hospital', 'epic', 'cerner', 'ehr', 'electronic health record', 'medicare', 'medicaid', 'cms', 'clinical', 'payer', 'provider', 'health plan', 'patient'],
    },
    {
      label: 'Technology delivery & digital transformation', weight: 7, lane: 'exec',
      keywords: ['digital transformation', 'it project', 'technology', 'software', 'cloud', 'data', 'cybersecurity', 'infrastructure', 'platform', 'agile', 'scrum', 'product', 'disaster recovery', 'business continuity', 'telecommunications', 'ivr'],
    },
    {
      label: 'AI & workflow automation', weight: 5, lane: 'exec',
      keywords: ['artificial intelligence', 'machine learning', 'automation', 'genai', 'llm', 'workflow automation', 'prompt engineering'],
    },
    {
      label: 'Construction, facilities & infrastructure', weight: 8, lane: 'construction',
      keywords: ['construction', 'general contractor', 'subcontractor', 'courthouse', 'facilities', 'infrastructure', 'build-out', 'capital projects', 'real estate', 'renovation', 'design-build'],
    },
    {
      label: 'Energy, utilities & sustainability', weight: 6, lane: 'construction',
      keywords: ['solar', 'renewable', 'utility', 'utilities', 'energy', 'grid', 'smart grid', 'photovoltaic', 'fuel cell', 'biogas', 'decarbon', 'sustainability', 'clean energy', 'wind', 'battery'],
    },
    {
      label: 'Marketing, creative & agency operations', weight: 7, lane: 'exec',
      keywords: ['marketing', 'campaign', 'creative', 'agency', 'brand', 'advertising', 'content', 'media', 'communications', 'public relations'],
    },
    {
      label: 'Process improvement & operational excellence', weight: 7, lane: BOTH,
      keywords: ['process improvement', 'lean', 'six sigma', 'operational excellence', 'continuous improvement', 'efficiency', 'standard operating', 'workflow', 'streamline'],
    },
    {
      label: 'Organizational change & transformation', weight: 6, lane: BOTH,
      keywords: ['change management', 'transformation', 'organizational change', 'adoption', 'enablement', 'training', 'readiness'],
    },
    {
      label: 'HR, people & workforce transformation', weight: 5, lane: BOTH,
      keywords: ['human resources', 'people operations', 'workforce', 'talent', 'hr transformation', 'headcount', 'resource planning', 'resourcing'],
    },
    {
      label: 'Supply chain, manufacturing & logistics', weight: 5, lane: BOTH,
      keywords: ['supply chain', 'manufacturing', 'logistics', 'inventory', 'production', 'fulfillment', 'warehouse', 'distribution'],
    },
    {
      label: 'Federal, public sector & government contracting', weight: 7, lane: BOTH,
      keywords: ['federal', 'government', 'gsa', 'public sector', 'far ', 'contract vehicle', 'dod', 'agency', 'state government', 'municipal', 'public health'],
    },
    {
      label: 'Consulting & professional services delivery', weight: 6, lane: BOTH,
      keywords: ['consulting', 'professional services', 'client delivery', 'client services', 'billable', 'engagement', 'advisory', 'client-facing'],
    },
    {
      label: 'Nonprofit, education & grants', weight: 4, lane: BOTH,
      keywords: ['nonprofit', 'foundation', 'grant', 'university', 'higher education', 'education', 'mission-driven', 'philanthropy'],
    },
    {
      label: 'Data, KPIs & executive reporting', weight: 5, lane: BOTH,
      keywords: ['kpi', 'dashboard', 'reporting', 'metrics', 'analytics', 'smartsheet', 'tableau', 'power bi', 'executive reporting'],
    },
    {
      label: 'Agile delivery & PM tooling', weight: 5, lane: 'exec',
      keywords: ['jira', 'asana', 'ms project', 'microsoft project', 'primavera', 'p6', 'smartsheet', 'confluence', 'sharepoint', 'agile', 'waterfall', 'scrum', 'kanban', 'pmp', 'project plan'],
    },
  ],

  // Industries Jeanine's resumes speak to directly (healthcare, federal/regulated, consulting, construction,
  // energy, marketing, education, nonprofit, enterprise technology). Include, not only: others score on merit.
  highFitIndustries: /\b(health|hospital|medical|pharma\w*|biotech\w*|insurance|government|federal|defense|public sector|professional services|construction|engineering|architect\w*|energy|utilit\w*|renewable|marketing|advertis\w*|communications|public relations|consult\w*|nonprofit\w*|foundation\w*|education|universit\w*|software|technology|cloud|cyber\w*|\bai\b|financial|banking|manufactur\w*|logistics|supply chain|real estate|telecom\w*|retail)\b/i,

  gapRules: [
    { label: 'Requires an active security clearance (TS/SCI, Secret, Public Trust)', re: /\b(active|current)\s+(?:top secret|ts\/sci|secret|public trust)\b|security clearance|\bts\/sci\b|\bsecret clearance\b/i },
    { label: 'Requires a clinical licence (RN / NP / MD)', re: /\bregistered nurse\b|\brn\b(?![a-z])|nursing licence|nursing license|nurse practitioner|physician|medical doctor|\bmd\b required/i },
    { label: 'Requires a CPA / public accounting credential', re: /\bcpa\b|chartered accountant|certified public accountant/i },
    { label: 'Requires a law degree / bar admission', re: /\bjuris doctor\b|\bjd\b|bar admission|licensed attorney|law degree/i },
    { label: 'Requires a PE (professional engineer) licence', re: /\bpe\b licence|\bpe\b license|professional engineer(?:ing)? (?:licence|license|stamp)/i },
    { label: 'Requires a doctorate / PhD', re: /\bph\.?d\.?\b.{0,20}(required|preferred)|\bdoctorate\b.{0,15}required/i },
    { label: 'Requires Spanish fluency', re: /bilingual|fluent in spanish|spanish fluency|habla espa\u00f1ol/i },
    { label: 'Quota-carrying sales role', re: /quota[- ]carrying|sales quota|carry a quota|commission plan/i },
    { label: 'Requires hands-on coding as the primary duty', re: /(write|writing|ship|develop)\s+(production\s+)?code|hands-on (?:coding|development) (?:required|expected)|proficient in (?:python|java|golang|typescript)\b/i },
  ],

  scoring: {
    base: 35, span: 60, coverageTarget: 0.55,
    seniorityBonus: 4, juniorPenalty: 8, industryBonus: 3,
    gapPenalty: 4, gapPenaltyCap: 12,
    floor: 22, ceiling: 96,
  },

  category: {
    technical: [
      'software', 'engineering', 'engineer', 'it ', 'information technology', 'cloud', 'data platform',
      'api', 'platform', 'saas', 'cybersecurity', 'cyber security', 'infrastructure', 'erp', 'workday',
      'salesforce', 'servicenow', 'peoplesoft', 'oracle', 'sap', 'epic', 'ehr', 'electronic health record',
      'artificial intelligence', 'ai ', 'machine learning', 'automation', 'devops', 'systems integration',
      'technical program', 'technical project', 'architecture', 'database', 'network', 'telecom',
      'digital transformation', 'product development', 'scrum', 'agile', 'sprint', 'jira', 'qa',
    ],
    nontechnical: [
      'marketing', 'campaign', 'creative', 'brand', 'advertising', 'agency', 'communications',
      'public relations', 'operations', 'procurement', 'vendor', 'contract', 'sourcing', 'human resources',
      'people operations', 'talent', 'workforce', 'finance', 'accounting', 'compliance', 'regulatory',
      'grants', 'nonprofit', 'foundation', 'clinical operations', 'patient', 'construction', 'facilities',
      'supply chain', 'logistics', 'manufacturing', 'events', 'customer success', 'professional services',
      'client services', 'change management', 'process improvement', 'lean', 'six sigma', 'governance',
      'budget', 'stakeholder', 'administrative', 'scheduling', 'training', 'onboarding', 'community',
    ],
    technicalTitle: /\b(technical|it|engineering|platform|software|data|cloud|cyber|systems|infrastructure|digital|ai|erp|implementation)\b/i,
  },

  employerIndustries: [
    'AI', 'Software', 'Technology', 'Financial Services', 'Defense', 'Energy', 'Manufacturing',
    'Healthcare', 'Hospital', 'Insurance', 'Construction', 'Engineering', 'Consulting',
    'Nonprofit', 'Education', 'Government', 'Public Sector', 'Retail', 'Logistics', 'Telecom',
    'Real Estate', 'Media', 'Staffing', 'Pharmaceutical', 'Biotechnology', 'Utilities',
  ],
};
