import { isPmTitle } from '../server/engine/titles';

/** The 86 nontechnical titles from Jeanine's master prompt. All must be recognised. */
const NONTECH = [
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

const TECHNICAL = [
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

const misses = NONTECH.filter((title) => !isPmTitle(title));
const techMisses = TECHNICAL.filter((title) => !isPmTitle(title));

console.log(`nontechnical recognised: ${NONTECH.length - misses.length}/${NONTECH.length}`);
if (misses.length) console.log('  MISSED:', misses.join(' | '));
console.log(`technical recognised: ${TECHNICAL.length - techMisses.length}/${TECHNICAL.length}`);
if (techMisses.length) console.log('  MISSED:', techMisses.join(' | '));

// Non-PM roles must stay out.
const mustReject = [
  'Software Engineer', 'Registered Nurse', 'Account Executive', 'Data Scientist',
  'Product Manager', 'Office Manager', 'Account Manager', 'Sales Manager', 'Engineering Manager',
];
const wrong = mustReject.filter((title) => isPmTitle(title));
console.log(`correctly rejected: ${mustReject.length - wrong.length}/${mustReject.length}`);
if (wrong.length) console.log('  WRONGLY ACCEPTED:', wrong.join(' | '));
