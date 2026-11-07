import { BOTH, type RoleFamily } from '../types';

/**
 * Software engineering.
 *
 * Matches the individual-contributor and lead ladder (backend, frontend, full
 * stack, platform, SRE, mobile, security engineering) plus engineering
 * management. Two lanes split product engineering from platform/infrastructure,
 * because those two tracks interview and interview-prep differently.
 */

const ENG_LEAD = String.raw`(?:software|backend|back[- ]end|frontend|front[- ]end|full[- ]stack|fullstack|platform|infrastructure|devops|sre|site reliability|cloud|security|mobile|ios|android|embedded|systems|application|api|data|machine learning|ml|qa|test automation|web|ui|distributed systems)`;
const ENG_RANK = String.raw`(?:engineer|engineering|developer|architect|scientist|programmer|manager|director|lead|head|principal|staff|specialist|consultant|analyst)`;

export const ENGINEERING: RoleFamily = {
  id: 'engineering',
  label: 'Software Engineering',
  shortLabel: 'Eng',
  jobNoun: 'engineering roles',
  defaultBoardName: 'Remote Engineering Radar',
  defaultRoleFamily: 'Remote software engineering roles in the United States',

  searchTerms: ['software engineer', 'backend engineer', 'platform engineer'],

  titlePatterns: [
    // "Software Engineer", "Senior Backend Engineer", "Staff Platform Engineering"
    new RegExp(String.raw`\b${ENG_LEAD}\b[\s,\-/]+(?:[a-z&,\- ]{0,28}?)\b${ENG_RANK}\b`, 'i'),
    // "Engineer, Platform", "Director of Engineering", "Head of Software Engineering"
    new RegExp(String.raw`\b${ENG_RANK}\b[\s,\-]*(?:of\s+)?(?:[a-z&,\- ]{0,20}?)\b${ENG_LEAD}\b`, 'i'),
    /\bsoftware engineer\b/i,
    /\bengineering manager\b/i,
    /\bdeveloper\b/i,
    /\bsre\b/i,
    /\bsite reliability engineer\b/i,
    /\btechnical lead\b/i,
    /\btech lead\b/i,
  ],

  disqualifiers: [
    /\b(civil|mechanical|electrical|chemical|structural|industrial|field|site|construction|hardware|manufacturing) engineer\b/i,
    /\b(nurse|physician|therapist|pharmacist|electrician|plumber|welder|carpenter|estimator|superintendent|technician|recruiter|sourcer|account executive|sales representative|accountant|bookkeeper|attorney|lawyer|paralegal)\b/i,
    /\b(intern|apprentice)\b/i,
    /\b(sales|support|solutions) engineer\b/i,
  ],

  disqualifiedAllow: /\b(software engineer|backend engineer|frontend engineer|full[- ]stack engineer|platform engineer|engineering manager|site reliability engineer)\b/i,

  juniorPattern: /\b(associate|junior|jr\.?|entry[- ]level|intern|trainee|apprentice|new grad)\b/i,

  titleFamilies: [
    { label: 'Engineering Management', patterns: [/engineering manager|director of engineering|head of engineering|vp of engineering|tech lead|technical lead|engineering lead/] },
    { label: 'Site Reliability / DevOps', patterns: [/sre|site reliability|devops|platform engineer|infrastructure|cloud engineer|kubernetes/] },
    { label: 'Security Engineering', patterns: [/security engineer|appsec|application security|infosec|penetration/] },
    { label: 'Data / ML Engineering', patterns: [/data engineer|machine learning engineer|\bml engineer|mlops|analytics engineer/] },
    { label: 'Mobile', patterns: [/\bios\b|\bandroid\b|mobile engineer|react native|flutter/] },
    { label: 'Frontend', patterns: [/frontend|front[- ]end|\bui engineer|web engineer|react|javascript/] },
    { label: 'Backend', patterns: [/backend|back[- ]end|api engineer|server|distributed systems|golang|java engineer/] },
    { label: 'Full Stack', patterns: [/full[- ]?stack/] },
    { label: 'QA / Test Automation', patterns: [/\bqa\b|test automation|sdet|quality engineer/] },
    { label: 'Software Engineering', patterns: [/engineer|developer|programmer/] },
  ],
  defaultTitleFamily: 'Software Engineering',

  lanes: [
    { id: 'product', label: 'Product Engineering', resume: 'Resume_Software_Engineering.pdf' },
    { id: 'platform', label: 'Platform / Infrastructure', resume: 'Resume_Platform_Engineering.pdf' },
  ],
  defaultLane: 'product',

  competencies: [
    {
      label: 'Core language proficiency', weight: 10, lane: BOTH,
      keywords: ['typescript', 'javascript', 'python', 'java', 'golang', 'go ', 'rust', 'c++', 'c#', 'ruby', 'kotlin', 'swift', 'scala', 'php'],
    },
    {
      label: 'System design & architecture', weight: 10, lane: BOTH,
      keywords: ['system design', 'architecture', 'distributed system', 'microservice', 'scalability', 'high availability', 'design review', 'api design', 'event-driven'],
    },
    {
      label: 'Product & feature delivery', weight: 9, lane: 'product',
      keywords: ['feature', 'product roadmap', 'ship', 'user-facing', 'customer', 'a/b test', 'product engineering', 'end-to-end', 'iteration'],
    },
    {
      label: 'Cloud & infrastructure', weight: 9, lane: 'platform',
      keywords: ['aws', 'gcp', 'azure', 'kubernetes', 'docker', 'terraform', 'infrastructure as code', 'helm', 'cloud', 'serverless', 'lambda'],
    },
    {
      label: 'CI/CD & developer experience', weight: 8, lane: 'platform',
      keywords: ['ci/cd', 'github actions', 'jenkins', 'build pipeline', 'developer experience', 'devex', 'release engineering', 'observability', 'monitoring', 'datadog'],
    },
    {
      label: 'Databases & data storage', weight: 8, lane: BOTH,
      keywords: ['postgres', 'mysql', 'mongodb', 'redis', 'dynamodb', 'sql', 'database', 'schema design', 'caching', 'kafka', 'queue'],
    },
    {
      label: 'Testing & code quality', weight: 7, lane: BOTH,
      keywords: ['unit test', 'integration test', 'tdd', 'code review', 'testing', 'playwright', 'cypress', 'jest', 'coverage', 'lint'],
    },
    {
      label: 'Performance & reliability', weight: 8, lane: 'platform',
      keywords: ['performance', 'latency', 'throughput', 'reliability', 'sla', 'incident', 'on-call', 'postmortem', 'load test', 'capacity'],
    },
    {
      label: 'Security & compliance engineering', weight: 7, lane: BOTH,
      keywords: ['security', 'authentication', 'oauth', 'encryption', 'soc 2', 'hipaa', 'gdpr', 'vulnerability', 'appsec', 'secrets'],
    },
    {
      label: 'Frontend & UX engineering', weight: 7, lane: 'product',
      keywords: ['react', 'next.js', 'vue', 'angular', 'css', 'accessibility', 'design system', 'responsive', 'redux', 'frontend performance'],
    },
    {
      label: 'Agile collaboration & mentoring', weight: 6, lane: BOTH,
      keywords: ['agile', 'scrum', 'sprint', 'mentor', 'pair programming', 'cross-functional', 'code review', 'technical leadership', 'onboarding'],
    },
    {
      label: 'AI / LLM application work', weight: 6, lane: 'product',
      keywords: ['llm', 'genai', 'openai', 'rag', 'prompt', 'vector database', 'machine learning', 'ai feature', 'embeddings'],
    },
    {
      label: 'Mobile development', weight: 5, lane: 'product',
      keywords: ['ios', 'android', 'swift', 'kotlin', 'react native', 'flutter', 'mobile app', 'app store'],
    },
    {
      label: 'Data & analytics engineering', weight: 6, lane: 'platform',
      keywords: ['etl', 'pipeline', 'spark', 'airflow', 'dbt', 'data platform', 'warehouse', 'streaming', 'analytics engineering'],
    },
  ],

  highFitIndustries: /\b(software|technology|saas|cloud|ai|fintech|financial|health|hospital|insurance|e-?commerce|marketplace|security|developer tools|media|telecom|logistics|defense)\b/i,

  gapRules: [
    { label: 'Requires an active security clearance (TS/SCI, Secret, Public Trust)', re: /\b(active|current)\s+(?:top secret|ts\/sci|secret|public trust)\b|security clearance|\bts\/sci\b|\bsecret clearance\b/i },
    { label: 'Requires a doctorate / PhD', re: /\bph\.?d\.?\b.{0,25}(required|preferred|degree)|\bdoctorate\b.{0,20}(required|preferred)/i },
    { label: 'Requires 8+ years of professional engineering experience', re: /(?:8|9|10|12|15)\+?\s*years?.{0,30}(?:software|engineering|development)/i },
    { label: 'Requires a niche language not on the resume (Rust, C++, Scala, Elixir)', re: /\b(?:rust|c\+\+|scala|elixir|erlang|haskell|clojure)\b.{0,30}(?:required|must|strong)/i },
    { label: 'Requires hands-on people management as the primary duty', re: /(?:manage|lead)\s+(?:a\s+)?team\s+of\s+\d+|direct reports|people management (?:required|experience)/i },
    { label: 'Requires on-call production support rotation', re: /on-?call rotation|24\/7 on-?call|pager duty/i },
    { label: 'Requires Spanish fluency', re: /bilingual|fluent in spanish|spanish fluency|habla espa\u00f1ol/i },
  ],

  scoring: {
    base: 34, span: 60, coverageTarget: 0.5,
    seniorityBonus: 4, juniorPenalty: 8, industryBonus: 3,
    gapPenalty: 5, gapPenaltyCap: 15,
    floor: 20, ceiling: 96,
  },

  category: {
    technical: [
      'engineer', 'engineering', 'software', 'developer', 'code', 'api', 'backend', 'frontend',
      'full stack', 'kubernetes', 'docker', 'aws', 'cloud', 'database', 'sql', 'typescript',
      'python', 'java', 'golang', 'rust', 'react', 'microservice', 'distributed', 'devops',
      'ci/cd', 'infrastructure', 'security', 'architecture', 'platform',
    ],
    nontechnical: [
      'marketing', 'sales', 'customer success', 'recruiting', 'human resources', 'finance',
      'accounting', 'operations', 'support', 'stakeholder', 'project management', 'product management',
      'compliance', 'training', 'documentation', 'vendor', 'procurement',
    ],
    technicalTitle: /\b(engineer|engineering|developer|software|backend|frontend|platform|sre|devops|architect|data)\b/i,
  },

  employerIndustries: [
    'AI', 'Software', 'Technology', 'Financial Services', 'Fintech', 'Defense', 'Healthcare',
    'Insurance', 'Retail', 'E-commerce', 'Media', 'Telecom', 'Logistics', 'Consulting',
    'Manufacturing', 'Staffing', 'Security', 'Education',
  ],
};
