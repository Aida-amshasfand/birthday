import { cp, mkdir, rm, copyFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const output = new URL('../dist/', import.meta.url);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await copyFile(new URL('../index.html', import.meta.url), new URL('index.html', output));
await cp(new URL('../src/', import.meta.url), new URL('src/', output), { recursive: true });
await cp(new URL('../public/', import.meta.url), output, { recursive: true });
console.log(`Built static website from ${root.pathname} to ${output.pathname}`);
