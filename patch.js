const fs = require('fs');
const path = require('path');

function walk(dir) {
  const results = [];
  fs.readdirSync(dir).forEach((f) => {
    const p = path.join(dir, f);
    const stat = fs.statSync(p);
    if (stat && stat.isDirectory()) results.push(...walk(p));
    else results.push(p);
  });
  return results;
}

function fixFile(file) {
  const src = fs.readFileSync(file, 'utf8');
  // Detect the problematic character class containing literal unicode spaces
  const problematic = /\[\^ \f\n\r\t\v[\u1680\u180E\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]*\]/;
  if (/\u1680|\u180E|\u2000/.test(src) && src.indexOf('[^ \f\n\r\t\v') !== -1) {
    const replaced = src.replace(/\[\^ \f\n\r\t\v[^\]]*\]/g, '[^ \\f\\n\\r\\t\\v\\u1680\\u180E\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000\\uFEFF]');
    if (replaced !== src) {
      fs.writeFileSync(file, replaced, 'utf8');
      console.log('Patched', file);
      return true;
    }
  }
  return false;
}

try {
  const nm = path.join(__dirname, 'node_modules');
  if (!fs.existsSync(nm)) {
    console.log('node_modules not present; skipping patch');
    process.exit(0);
  }
  const files = walk(nm).filter(f => f.endsWith('.js'));
  let count = 0;
  for (const f of files) {
    if (fixFile(f)) count++;
  }
  console.log('Patched files count:', count);
} catch (err) {
  console.error('Patch failed:', err);
  process.exit(1);
}
