const fs = require('fs');
const path = require('path');

function walk(dir) {
  return fs.readdirSync(dir).flatMap(name => {
    const p = path.join(dir, name);
    return fs.statSync(p).isDirectory() ? walk(p) : [p];
  });
}

function escapeCodePoint(code) {
  if (code <= 0xFFFF) return '\\u' + code.toString(16).padStart(4, '0');
  const hi = Math.floor((code - 0x10000) / 0x400) + 0xD800;
  const lo = ((code - 0x10000) % 0x400) + 0xDC00;
  return '\\u' + hi.toString(16).padStart(4, '0') + '\\u' + lo.toString(16).padStart(4, '0');
}

function escapeUnicodeInString(body) {
  let out = '';
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === '\\' && i + 1 < body.length) {
      const next = body[i + 1];
      if (next === 'u' && i + 5 < body.length) {
        out += body.slice(i, i + 6);
        i += 5;
        continue;
      }
      if (next === 'x' && i + 3 < body.length) {
        out += body.slice(i, i + 4);
        i += 3;
        continue;
      }
      out += ch + next;
      i++;
      continue;
    }
    const code = body.codePointAt(i);
    if (code > 127) {
      out += escapeCodePoint(code);
      if (code > 0xFFFF) i++;
      continue;
    }
    out += ch;
  }
  return out;
}

function patchFile(file) {
  let src = fs.readFileSync(file, 'utf8');
  let changed = false;

  const regexStringPattern = /new RegExp\(\s*("((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)')(?:\s*,\s*("((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'))?\s*\)/gs;
  src = src.replace(regexStringPattern, (match, quoted, doubleBody, singleBody) => {
    const body = doubleBody !== undefined ? doubleBody : singleBody;
    const fixedBody = escapeUnicodeInString(body);
    if (fixedBody !== body) {
      changed = true;
      return match.replace(body, fixedBody);
    }
    return match;
  });

  if (changed) {
    fs.writeFileSync(file, src, 'utf8');
    console.log('Patched:', file);
  }
}

try {
  const dist = path.join(__dirname, 'dist');
  if (!fs.existsSync(dist)) {
    console.log('dist not found; skipping');
    process.exit(0);
  }
  const files = walk(dist).filter(f => f.endsWith('.js'));
  for (const f of files) patchFile(f);
  console.log('Done patching dist JS files.');
} catch (err) {
  console.error('patch_dist failed:', err);
  process.exit(1);
}
