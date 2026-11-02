/**
 * Validate all prompt content files.  Usage: pnpm content:validate
 * Exit code 1 if any file is invalid.
 */
import { loadPromptFiles, PROMPTS_DIR } from "./content-files";

const { files, errors } = loadPromptFiles();
const byStatus = files.reduce<Record<string, number>>((acc, f) => {
  acc[f.status] = (acc[f.status] ?? 0) + 1;
  return acc;
}, {});

console.log(`Content dir: ${PROMPTS_DIR}`);
console.log(`Valid prompt files: ${files.length} ${JSON.stringify(byStatus)}`);
if (errors.length > 0) {
  console.error(`\n${errors.length} problem(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
