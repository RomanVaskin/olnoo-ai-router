import closeWithGrace from 'close-with-grace';
import { buildApp } from './app.js';
import { env } from './config/env.js';

const app = await buildApp();

closeWithGrace({ delay: 10_000 }, async ({ err }) => {
  if (err) {
    app.log.error({ err }, 'closing application due to error');
  }
  await app.close();
});

try {
  await app.listen({ host: env.HOST, port: env.PORT });
} catch (error) {
  app.log.error({ err: error }, 'failed to start server');
  process.exit(1);
}
