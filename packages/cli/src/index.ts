import { run } from './main.ts';

const code = await run(process.argv.slice(2), {
  out: (line) => process.stdout.write(`${line}\n`),
  err: (line) => process.stderr.write(`${line}\n`),
});
if (code !== 0) process.exitCode = code;
