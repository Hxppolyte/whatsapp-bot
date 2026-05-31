const express = require('express');
const axios = require('axios');
const twilio = require('twilio');

const app = express();
app.use(express.urlencoded({ extended: false }));

// ============================================================
// CONFIG
// ============================================================
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_WHATSAPP_NUMBER = process.env.TWILIO_WHATSAPP_NUMBER;
const APIFY_TOKEN = process.env.APIFY_TOKEN;

const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

// ============================================================
// VA LIST - Maelys Instagram
// ============================================================
const VA_LIST = [
  { name: "OTHELLO", accounts: [
    { username: "maelys.tonbb", compte: "Compte 1" },
    { username: "maelys_tafemme", compte: "Compte 2" },
  ]},
  { name: "NICOLAS", accounts: [
    { username: "maelyss.pdv", compte: "Compte 1" },
    { username: "maelys.dtt_", compte: "Compte 2" },
  ]},
  { name: "MAXIME", accounts: [
    { username: "maelyss.tameuf", compte: "Compte 1" },
  ]},
  { name: "GODFRED", accounts: [
    { username: "maelyss.tavie", compte: "Compte 1" },
    { username: "maelyss.tagirls", compte: "Compte 2" },
  ]},
  { name: "AZIZ", accounts: [
    { username: "maelys.ada", compte: "Compte 1" },
    { username: "maelys_diane", compte: "Compte 2" },
    { username: "maelys.fiona", compte: "Compte 3" },
  ]},
  { name: "OZIRUS", accounts: [
    { username: "maelys.tagirl", compte: "Compte 1" },
    { username: "maelys_tameuf", compte: "Compte 2" },
    { username: "maelys_sexygirl", compte: "Compte 3" },
  ]},
  { name: "MOHAMED", accounts: [
    { username: "maelyss_offfi", compte: "Compte 1" },
    { username: "maely_stavie", compte: "Compte 2" },
    { username: "maelyswife", compte: "Compte 3" },
  ]},
];

const RESTRICTED = ["maelyss.tameuf"];

// ============================================================
// HELPERS
// ============================================================
function fmt(n) {
  if (!n) return '—';
  if (n >= 1000000) return (n/1000000).toFixed(1)+'M';
  if (n >= 1000) return (n/1000).toFixed(1)+'k';
  return n.toString();
}

function timeAgo(hoursAgo) {
  if (hoursAgo === null || hoursAgo === undefined) return '—';
  if (hoursAgo < 1) return '< 1h';
  if (hoursAgo < 24) return hoursAgo+'h ago';
  return Math.floor(hoursAgo/24)+'j';
}

async function fetchAccount(username) {
  if (RESTRICTED.includes(username)) return { username, status: 'restricted' };
  try {
    const res = await axios.post(
      `https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?token=${APIFY_TOKEN}&timeout=60&memory=256`,
      {
        directUrls: [`https://www.instagram.com/${username}/`],
        resultsType: 'posts',
        resultsLimit: 5,
        addParentData: true,
      },
      { timeout: 90000 }
    );

    const items = res.data;
    if (!items?.length) return { username, status: 'ban' };

    const sorted = [...items].sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
    const last = sorted[0];
    const followers = items.find(i => i.followersCount)?.followersCount || 0;
    const lastPostTimestamp = last?.timestamp ? new Date(last.timestamp).getTime() : null;
    const lastPostLikes = last?.likesCount || 0;
    const lastPostViews = last?.videoViewCount || 0;
    const hoursAgo = lastPostTimestamp ? Math.floor((Date.now() - lastPostTimestamp) / 3600000) : null;

    return {
      username,
      status: hoursAgo !== null && hoursAgo <= 24 ? 'ok' : 'warn',
      followers, lastPostLikes, lastPostViews, hoursAgo,
    };
  } catch(e) {
    return { username, status: 'error' };
  }
}

// ============================================================
// GÉNÉRATION DU RAPPORT
// ============================================================
async function generateReport() {
  const allAccounts = VA_LIST.flatMap(va =>
    va.accounts.map(acc => ({ ...acc, vaName: va.name }))
  );

  const results = [];
  for (const acc of allAccounts) {
    const r = await fetchAccount(acc.username);
    results.push({ ...acc, ...r });
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  // Stats globales
  const ok = results.filter(r => r.status === 'ok').length;
  const warn = results.filter(r => r.status === 'warn').length;
  const ban = results.filter(r => ['ban','error'].includes(r.status)).length;

  let msg = `📊 *RAPPORT VA MAELYS INSTAGRAM*\n`;
  msg += `🕐 ${new Date().toLocaleString('fr-FR')}\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `✅ Ont posté: *${ok}* comptes\n`;
  msg += `⚠️ N'ont pas posté: *${warn}* comptes\n`;
  msg += `🚫 Alertes ban: *${ban}* comptes\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;

  // Par VA
  for (const va of VA_LIST) {
    const vaResults = results.filter(r => r.vaName === va.name);
    const allOk = vaResults.every(r => r.status === 'ok');
    const hasBan = vaResults.some(r => ['ban','error'].includes(r.status));
    const emoji = hasBan ? '🚫' : allOk ? '✅' : '⚠️';

    msg += `${emoji} *${va.name}*\n`;
    for (const r of vaResults) {
      const statusEmoji = r.status === 'ok' ? '🟢' : r.status === 'restricted' ? '🟡' : ['ban','error'].includes(r.status) ? '🔴' : '🟠';
      const timeText = r.status === 'restricted' ? 'Restreint' : ['ban','error'].includes(r.status) ? 'BANNI/INACCESSIBLE' : r.hoursAgo !== null ? `Il y a ${timeAgo(r.hoursAgo)}` : '—';
      msg += `  ${statusEmoji} @${r.username} (${r.compte})\n`;
      msg += `     ⏱ ${timeText} | ❤️ ${fmt(r.lastPostLikes)} | 👥 ${fmt(r.followers)}\n`;
    }
    msg += '\n';
  }

  // Comptes pas postés
  const notPosted = results.filter(r => r.status === 'warn');
  if (notPosted.length > 0) {
    msg += `━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `⚠️ *N'ont PAS posté aujourd'hui:*\n`;
    for (const r of notPosted) {
      msg += `  • ${r.vaName} - @${r.username} (${r.hoursAgo ? r.hoursAgo+'h' : '?'})\n`;
    }
  }

  return msg;
}

// ============================================================
// WEBHOOK WHATSAPP
// ============================================================
let isGenerating = false;

app.post('/webhook', async (req, res) => {
  const from = req.body.From;
  const body = req.body.Body?.trim().toLowerCase();

  res.sendStatus(200);

  if (body === 'rapport' || body === 'report' || body === 'stats') {
    if (isGenerating) {
      await client.messages.create({
        from: TWILIO_WHATSAPP_NUMBER,
        to: from,
        body: '⏳ Un rapport est déjà en cours de génération, patiente 2-3 minutes...',
      });
      return;
    }

    isGenerating = true;
    await client.messages.create({
      from: TWILIO_WHATSAPP_NUMBER,
      to: from,
      body: '⏳ Génération du rapport en cours... (~2-3 minutes)',
    });

    try {
      const report = await generateReport();
      // Twilio limite à 1600 chars par message — on coupe si besoin
      const chunks = report.match(/[\s\S]{1,1500}/g) || [report];
      for (const chunk of chunks) {
        await client.messages.create({
          from: TWILIO_WHATSAPP_NUMBER,
          to: from,
          body: chunk,
        });
        await new Promise(r => setTimeout(r, 500));
      }
    } catch(e) {
      await client.messages.create({
        from: TWILIO_WHATSAPP_NUMBER,
        to: from,
        body: '❌ Erreur lors de la génération du rapport: ' + e.message,
      });
    } finally {
      isGenerating = false;
    }
  } else {
    await client.messages.create({
      from: TWILIO_WHATSAPP_NUMBER,
      to: from,
      body: '👋 Salut ! Envoie *rapport* pour recevoir le compte rendu des VA Maelys Instagram.',
    });
  }
});

app.listen(3000, () => {
  console.log('✅ Bot WhatsApp démarré sur le port 3000');
  console.log('📱 En attente de messages WhatsApp...');
});
