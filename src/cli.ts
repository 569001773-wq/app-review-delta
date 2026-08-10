import { runCli } from './cli/main';

if (require.main === module) {
  runCli().catch((err) => {
    console.error(`app-review-delta: ${(err as Error).message}`);
    process.exitCode = 2;
  });
}

export { runCli };
