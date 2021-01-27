const localtunnel = require('localtunnel');
const Bkper = require('bkper').Bkper;
require('dotenv').config();

const app = Bkper.setApiKey(process.env.BKPER_API_KEY);

(async () => {
  const tunnel = await localtunnel({ port: 3002 });

  await app.setWebhookUrlDev(tunnel.url).patch()
  console.log(`Listening at ${tunnel.url}`);
  tunnel.on('close', async () => {
    await exit()
  });
})();

async function exit() {
  await app.setWebhookUrlDev(null).patch();
  console.log(' \nRemoved webhook.')
  process.exit();
}

process.on('exit', exit);
process.on('SIGINT', exit);
process.on('SIGUSR1', exit);
process.on('SIGUSR2', exit);
process.on('uncaughtException', exit);