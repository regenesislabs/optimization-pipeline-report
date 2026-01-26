import { runReportGeneration } from './report-runner';

async function main() {
  const result = await runReportGeneration();
  if (!result.success) {
    process.exit(1);
  }
}

main().catch(console.error);
