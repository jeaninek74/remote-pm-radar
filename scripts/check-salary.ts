import { classifySalary } from '../server/engine/salary';

const cases: { label: string; min: number; max: number | null; want: string }[] = [
  { label: '$95K–$120K', min: 95_000, max: 120_000, want: 'tab0' },
  { label: '$90K–$100K', min: 90_000, max: 100_000, want: 'tab0' },
  { label: '$85K–$120K', min: 85_000, max: 120_000, want: 'none' },
  { label: '$115K–$125K', min: 115_000, max: 125_000, want: 'tab1' },
  { label: '$125K–$150K', min: 125_000, max: 150_000, want: 'tab1' },
  { label: '$130K–$170K', min: 130_000, max: 170_000, want: 'tab1' },
  { label: '$140K–$180K', min: 140_000, max: 180_000, want: 'none' },
  { label: '$150K–$200K', min: 150_000, max: 200_000, want: 'tab2' },
  { label: '$175K–$250K', min: 175_000, max: 250_000, want: 'tab2' },
  { label: '$200K–$300K', min: 200_000, max: 300_000, want: 'tab2' },
  { label: 'boundary $130,001', min: 130_001, max: 160_000, want: 'none' },
  { label: 'boundary $149,999', min: 149_999, max: 190_000, want: 'none' },
  { label: 'boundary $109,999', min: 109_999, max: 130_000, want: 'tab0' },
  { label: 'boundary $150,000', min: 150_000, max: 150_000, want: 'tab2' },
  { label: 'no salary', min: Number.NaN, max: null, want: 'none' },
];

let failures = 0;
for (const item of cases) {
  const got = classifySalary(Number.isNaN(item.min) ? null : item.min, item.max, 'year');
  const ok = got.bucket === item.want;
  if (!ok) failures += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${item.label.padEnd(18)} -> ${got.bucket.padEnd(5)} (want ${item.want})`);
}

const hourlyBand = classifySalary(Math.round(60 * 2080), null, 'hour', 60);
const hourlyGap = classifySalary(Math.round(68 * 2080), null, 'hour', 68);
console.log(`${hourlyBand.bucket === 'tab1' ? 'ok  ' : 'FAIL'}  $60/hr -> ${hourlyBand.bucket} : ${hourlyBand.reason}`);
console.log(`${hourlyGap.bucket === 'none' ? 'ok  ' : 'FAIL'}  $68/hr -> ${hourlyGap.bucket} : ${hourlyGap.reason}`);
if (hourlyBand.bucket !== 'tab1' || hourlyGap.bucket !== 'none') failures += 1;

console.log(failures === 0 ? '\nall salary cases pass' : `\n${failures} failing`);
process.exitCode = failures === 0 ? 0 : 1;
