import { BOTH, type RoleFamily } from '../types';

/**
 * Data, analytics and business intelligence.
 *
 * Covers the analyst-to-scientist ladder: reporting/BI analysts, analytics
 * engineers, data scientists and data engineers. Two lanes separate the
 * stakeholder-facing analytics track from the modelling/ML track so a candidate
 * with two different resumes gets the right one recommended.
 */

const DATA_LEAD = String.raw`(?:data|analytics|analytic|business intelligence|bi|insights|reporting|research|quantitative|decision science|machine learning|ml|applied scientist|statistic)`;
const DATA_RANK = String.raw`(?:analyst|analytics|engineer|engineering|scientist|developer|architect|manager|director|lead|head|specialist|consultant|strategist|officer)`;

export const DATA_ANALYTICS: RoleFamily = {
  id: 'data-analytics',
  label: 'Data & Analytics',
  shortLabel: 'Data',
  jobNoun: 'data roles',
  defaultBoardName: 'Remote Data Radar',
  defaultRoleFamily: 'Remote analytics, business intelligence and data roles in the United States',

  searchTerms: ['data analyst', 'business intelligence analyst', 'data engineer'],

  titlePatterns: [
    // "Data Analyst", "Senior Business Intelligence Analyst", "Analytics Engineer"
    new RegExp(String.raw`\b${DATA_LEAD}\b[\s,\-/]+(?:[a-z&,\- ]{0,28}?)\b${DATA_RANK}\b`, 'i'),
    // "Analyst, Data & Insights", "Director of Analytics", "Head of Data Science"
    new RegExp(String.raw`\b${DATA_RANK}\b[\s,\-]*(?:of\s+)?(?:[a-z&,\- ]{0,20}?)\b${DATA_LEAD}\b`, 'i'),
    /\bdata science\b/i,
    /\bdata engineering\b/i,
    /\bbusiness intelligence\b/i,
    /\banalytics engineer\b/i,
    /\bdecision scientist\b/i,
    /\bproduct analyst\b/i,
    /\bgrowth analyst\b/i,
    /\bfinancial analyst\b/i,
    /\bmarketing analyst\b/i,
    /\boperations analyst\b/i,
  ],

  disqualifiers: [
    /\b(software|backend|frontend|full[- ]stack|platform|infrastructure|network|security|cloud|devops|qa|test|systems|hardware|electrical|mechanical|civil|field|site|construction) engineer\b/i,
    /\b(developer|programmer|nurse|physician|therapist|pharmacist|electrician|plumber|welder|carpenter|estimator|superintendent|technician|recruiter|sourcer|account executive|sales representative|sales manager|business development representative|customer support representative|service desk|help desk|attorney|lawyer|paralegal)\b/i,
    /\b(intern|apprentice)\b/i,
  ],

  disqualifiedAllow: /\b(data (?:analyst|engineer|scientist)|analytics engineer|business intelligence|bi analyst|machine learning engineer)\b/i,

  juniorPattern: /\b(associate|junior|jr\.?|assistant|entry[- ]level|intern|trainee|apprentice)\b/i,

  titleFamilies: [
    { label: 'Data Science / ML', patterns: [/data scien|machine learning|\bml\b|decision scien|applied scientist|statistic/] },
    { label: 'Data Engineering', patterns: [/data engineer|analytics engineer|etl|data platform|data architect|data warehouse/] },
    { label: 'Business Intelligence', patterns: [/business intelligence|\bbi\b|reporting|dashboard|tableau|power bi|insights/] },
    { label: 'Product / Growth Analytics', patterns: [/product analyst|growth analyst|experimentation|a\/b/] },
    { label: 'Functional Analytics', patterns: [/financial analyst|marketing analyst|operations analyst|risk analyst|supply chain analyst/] },
    { label: 'Data Analyst', patterns: [/analyst|analytics/] },
  ],
  defaultTitleFamily: 'Data Analyst',

  lanes: [
    { id: 'analytics', label: 'Analytics / BI', resume: 'Resume_Data_Analytics.pdf' },
    { id: 'science', label: 'Data Science / ML', resume: 'Resume_Data_Science.pdf' },
  ],
  defaultLane: 'analytics',

  competencies: [
    {
      label: 'SQL & data modelling', weight: 10, lane: BOTH,
      keywords: ['sql', 'data model', 'dimensional model', 'star schema', 'joins', 'query optimization', 'data warehouse', 'dbt', 'snowflake', 'bigquery', 'redshift', 'databricks', 'postgres'],
    },
    {
      label: 'Dashboards & BI tooling', weight: 9, lane: 'analytics',
      keywords: ['tableau', 'power bi', 'looker', 'metabase', 'superset', 'qlik', 'dashboard', 'reporting', 'visualization', 'data studio', 'mode analytics'],
    },
    {
      label: 'Python / R analysis', weight: 8, lane: BOTH,
      keywords: ['python', 'pandas', 'numpy', 'r studio', 'tidyverse', 'jupyter', 'scikit-learn', 'scipy', 'notebook'],
    },
    {
      label: 'Statistics & experimentation', weight: 8, lane: 'science',
      keywords: ['statistic', 'regression', 'hypothesis test', 'a/b test', 'experimentation', 'confidence interval', 'significance', 'causal inference', 'bayesian'],
    },
    {
      label: 'Machine learning & modelling', weight: 8, lane: 'science',
      keywords: ['machine learning', 'model training', 'feature engineering', 'xgboost', 'random forest', 'neural network', 'mlops', 'model deployment', 'llm', 'deep learning'],
    },
    {
      label: 'ETL / pipelines & orchestration', weight: 8, lane: 'analytics',
      keywords: ['etl', 'elt', 'pipeline', 'airflow', 'dagster', 'prefect', 'kafka', 'ingestion', 'data quality', 'orchestration', 'spark', 'dbt'],
    },
    {
      label: 'Stakeholder communication & storytelling', weight: 8, lane: BOTH,
      keywords: ['stakeholder', 'storytelling', 'executive presentation', 'cross-functional', 'business partner', 'insight', 'narrative', 'communicate findings', 'translate'],
    },
    {
      label: 'KPI definition & business metrics', weight: 7, lane: BOTH,
      keywords: ['kpi', 'metric', 'north star', 'okr', 'funnel', 'cohort', 'retention', 'churn', 'revenue', 'unit economics'],
    },
    {
      label: 'Data governance & quality', weight: 6, lane: BOTH,
      keywords: ['data governance', 'data quality', 'lineage', 'catalog', 'metadata', 'privacy', 'gdpr', 'pii', 'documentation'],
    },
    {
      label: 'Spreadsheets & ad-hoc analysis', weight: 6, lane: 'analytics',
      keywords: ['excel', 'google sheets', 'pivot table', 'vlookup', 'financial model', 'ad-hoc analysis'],
    },
    {
      label: 'Cloud & infrastructure', weight: 5, lane: BOTH,
      keywords: ['aws', 'gcp', 'azure', 's3', 'lambda', 'cloud', 'terraform', 'docker', 'kubernetes', 'git'],
    },
    {
      label: 'Healthcare & payer analytics', weight: 6, lane: 'analytics',
      keywords: ['healthcare', 'health plan', 'payer', 'claims', 'medicare', 'medicaid', 'clinical data', 'ehr', 'epic', 'hipaa'],
    },
    {
      label: 'Finance, marketing & product domains', weight: 5, lane: BOTH,
      keywords: ['financial analysis', 'forecast', 'marketing analytics', 'attribution', 'product analytics', 'pricing', 'saas metrics'],
    },
    {
      label: 'Automation & AI-assisted analysis', weight: 5, lane: BOTH,
      keywords: ['automation', 'artificial intelligence', 'genai', 'prompt', 'workflow automation', 'copilot'],
    },
  ],

  highFitIndustries: /\b(health|hospital|medical|insurance|financial|banking|fintech|software|technology|retail|e-?commerce|consult|marketplace|advertis|media|telecom|logistics|education|government|pharma|biotech)\b/i,

  gapRules: [
    { label: 'Requires an active security clearance (TS/SCI, Secret, Public Trust)', re: /\b(active|current)\s+(?:top secret|ts\/sci|secret|public trust)\b|security clearance|\bts\/sci\b|\bsecret clearance\b/i },
    { label: 'Requires a doctorate / PhD', re: /\bph\.?d\.?\b.{0,25}(required|preferred|degree)|\bdoctorate\b.{0,20}(required|preferred)/i },
    { label: 'Requires a clinical licence (RN / NP / MD)', re: /\bregistered nurse\b|\bnurse practitioner\b|physician|medical doctor/i },
    { label: 'Requires a CPA / public accounting credential', re: /\bcpa\b|certified public accountant/i },
    { label: 'Requires 5+ years of production software engineering', re: /(?:5|6|7|8|10)\+?\s*years?.{0,30}(?:software|backend|frontend|full[- ]stack)\s*engineer/i },
    { label: 'Requires Spanish fluency', re: /bilingual|fluent in spanish|spanish fluency|habla espa\u00f1ol/i },
    { label: 'Requires on-call production support rotation', re: /on-?call rotation|24\/7 on-?call|pager duty/i },
  ],

  scoring: {
    base: 34, span: 60, coverageTarget: 0.52,
    seniorityBonus: 4, juniorPenalty: 8, industryBonus: 3,
    gapPenalty: 5, gapPenaltyCap: 15,
    floor: 20, ceiling: 96,
  },

  category: {
    technical: [
      'sql', 'python', 'data', 'analytics', 'machine learning', 'ml', 'etl', 'pipeline', 'airflow',
      'dbt', 'snowflake', 'databricks', 'bigquery', 'tableau', 'power bi', 'looker', 'spark', 'kafka',
      'aws', 'gcp', 'azure', 'statistic', 'model', 'api', 'database', 'cloud', 'engineering',
    ],
    nontechnical: [
      'marketing', 'finance', 'accounting', 'operations', 'sales', 'customer', 'product',
      'stakeholder', 'reporting', 'presentation', 'business partner', 'strategy', 'governance',
      'compliance', 'human resources', 'recruiting', 'supply chain', 'clinical', 'patient',
      'communications', 'training', 'process improvement',
    ],
    technicalTitle: /\b(data|analytics|sql|python|engineer|scientist|machine learning|bi|etl|pipeline)\b/i,
  },

  employerIndustries: [
    'AI', 'Software', 'Technology', 'Financial Services', 'Fintech', 'Insurance', 'Healthcare',
    'Hospital', 'Retail', 'E-commerce', 'Marketing', 'Media', 'Consulting', 'Logistics',
    'Telecom', 'Education', 'Government', 'Pharmaceutical', 'Biotechnology', 'Manufacturing',
  ],
};
