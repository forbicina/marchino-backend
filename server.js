import express from 'express';
import webpush from 'web-push';
import { Redis } from '@upstash/redis';
import cron from 'node-cron';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

// Configura VAPID
webpush.setVapidDetails(
    'mailto:sompet@proton.me',
    process.env.VAPID_PUBLIC,
    process.env.VAPID_PRIVATE
);

// Connessione Upstash Redis
const redis = new Redis({
    url: process.env.UPSTASH_URL,
    token: process.env.UPSTASH_TOKEN,
});

// Endpoint per salvare subscription
app.post('/subscribe', async (req, res) => {
    const subscription = req.body;
    const key = `sub:${subscription.endpoint}`;

    await redis.set(key, JSON.stringify(subscription));
    res.json({ success: true });
});

// Endpoint per rimuovere subscription
app.post('/unsubscribe', async (req, res) => {
    const { endpoint } = req.body;
    await redis.del(`sub:${endpoint}`);
    res.json({ success: true });
});

// Funzione per inviare notifiche a tutti
async function sendToAll() {
    const keys = await redis.keys('sub:*');
    console.log(`Invio notifiche a ${keys.length} utenti...`);

    for (const key of keys) {
        const sub = await redis.get(key);
        const subscription = typeof sub === 'string' ? JSON.parse(sub) : sub;

        try {
            await webpush.sendNotification(subscription, JSON.stringify({
                title: 'Marchino',
                body: 'È il momento della dose quotidiana di stoicismo.',
                url: '/marchino/'
            }));
        } catch (err) {
            if (err.statusCode === 410 || err.statusCode === 404) {
                // Subscription scaduta, rimuovi
                await redis.del(key);
                console.log('Rimossa subscription scaduta');
            }
        }
    }
}

// Cron job: ogni giorno alle 9:00 (ora server)
cron.schedule('0 9 * * *', () => {
    console.log('Cron triggered: invio notifiche');
    sendToAll();
}, {
    timezone: "Europe/Rome"
});

// Endpoint per test manuale
app.post('/test-push', async (req, res) => {
    await sendToAll();
    res.json({ success: true });
});

// Health check
app.get('/', (req, res) => {
    res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server su porta ${PORT}`));
