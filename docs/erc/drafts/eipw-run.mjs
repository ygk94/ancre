import { createRequire } from 'module';
const require = createRequire(process.env.PKG + '/package.json');
const eipw = require('eipw-lint-js');
import fs from 'fs';
const opts = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const files = process.argv.slice(3);
const res = await eipw.lint(files, opts);
let errs = 0;
for (const r of res) {
  const lvl = r.formatted ? r.formatted.split('[')[0] : '';
  if ((r.formatted||'').startsWith('error')) errs++;
  console.log(eipw.format(r));
}
console.log(`RESULT ${res.length} diagnostics, ${errs} errors`);
process.exit(errs ? 1 : 0);
