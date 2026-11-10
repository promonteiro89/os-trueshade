// Prints the length and checksum of Source/JS/TrueShade.js as it is stored in an OutSystems module
// (no trailing newline, LF line endings). Compare the output with the same numbers computed
// from the module's script to confirm that O11, ODC and this repository hold identical code.
//
// Usage: node scripts/checksum.mjs [path]   (defaults to Source/JS/TrueShade.js)
//
// Algorithm, so it can be reproduced anywhere (e.g. in an O11 Model API probe):
//   h = 0; for each UTF-16 code unit c: h = (h * 31 + c) mod 2147483647
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const path = process.argv[2] ?? fileURLToPath(new URL('../Source/JS/TrueShade.js', import.meta.url));
const text = readFileSync(path, 'utf8').replace(/\r\n/g, '\n').replace(/\n$/, '');

const M = 2147483647n;
let h = 0n;
for (let i = 0; i < text.length; i++) h = (h * 31n + BigInt(text.charCodeAt(i))) % M;

console.log(`length=${text.length} checksum=${h}`);
