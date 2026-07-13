const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');

const TOKEN    = process.env.TELEGRAM_BOT_TOKEN;
const PIX_KEY  = 'mundocornovip2026@gmail.com';
const ADMIN_ID = 8825551172;

const PLANS = {
  week:  { label: '1 Semana', price: 'R$ 9,99',  days: 7  },
  month: { label: '1 Mes',    price: 'R$ 19,99', days: 30 },
};

if (!TOKEN) { console.error('TELEGRAM_BOT_TOKEN nao definido!'); process.exit(1); }

const bot = new TelegramBot(TOKEN, { polling: true });

let userData = {}, pendingUsers = {}, userStates = {}, config = {};

function load() {
  const read = (f, fb) => { try { return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf-8')) : fb; } catch { return fb; } };
  userData = read('userData.json', {}); pendingUsers = read('pendingUsers.json', {}); config = read('botConfig.json', {});
}
function save() {
  fs.writeFileSync('userData.json', JSON.stringify(userData, null, 2));
  fs.writeFileSync('pendingUsers.json', JSON.stringify(pendingUsers, null, 2));
  fs.writeFileSync('botConfig.json', JSON.stringify(config, null, 2));
}
load();

const isAdmin = id => id === ADMIN_ID;
const uName   = u  => u.username ? '@' + u.username : (u.first_name || String(u.id));
const fmtDate = iso => new Date(iso).toLocaleDateString('pt-BR');
const calcExp = plan => { const d = new Date(); d.setDate(d.getDate() + (PLANS[plan]?.days || 7)); return d.toISOString(); };

async function sendWelcome(chatId) {
  await bot.sendMessage(chatId,
    '<b>🔥 Bem-vindo ao MUNDO CORNO 2026!</b>\n\nEscolha seu plano para entrar no grupo VIP 👇',
    { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[
      { text: '📅 1 Semana — R$ 9,99', callback_data: 'plan_week' },
      { text: '📆 1 Mes — R$ 19,99',   callback_data: 'plan_month' },
    ]] } }
  );
}

bot.onText(/\/start/, async msg => {
  const uid = String(msg.from.id), user = userData[uid];
  if (user?.status === 'banned')  return bot.sendMessage(msg.chat.id, '🚫 Voce foi banido.');
  if (user?.status === 'active')  return bot.sendMessage(msg.chat.id, `✅ Acesso ativo ate <b>${fmtDate(user.expiresAt)}</b>.\nLink: ${user.inviteLink || '(aguardando)'}`, { parse_mode: 'HTML' });
  if (user?.status === 'pending') return bot.sendMessage(msg.chat.id, '⏳ Comprovante ja enviado. Aguarde aprovacao.');
  await sendWelcome(msg.chat.id);
});

bot.on('callback_query', async query => {
  const chatId = query.message.chat.id, uid = String(query.from.id), data = query.data || '';
  await bot.answerCallbackQuery(query.id).catch(() => {});
  if (data === 'plan_week' || data === 'plan_month') {
    const plan = data === 'plan_week' ? 'week' : 'month';
    userStates[uid] = 'awaiting_proof_' + plan;
    const p = PLANS[plan];
    return bot.sendMessage(chatId,
      `💳 <b>Plano: ${p.label} — ${p.price}</b>\n\nFaca o PIX:\n\n🔑 <code>${PIX_KEY}</code>\n\nApos pagar, <b>envie o comprovante (foto)</b> aqui. ✅`,
      { parse_mode: 'HTML' });
  }
  if ((data.startsWith('approve_') || data.startsWith('reject_')) && isAdmin(query.from.id)) {
    const parts = data.split('_');
    if (parts[0] === 'approve') await handleApprove(chatId, parts[1]);
    if (parts[0] === 'reject')  await handleReject(chatId, parts[1]);
  }
});

bot.on('photo', async msg => {
  const uid = String(msg.from.id), state = userStates[uid] || '';
  if (!state.startsWith('awaiting_proof_'))
    return bot.sendMessage(msg.chat.id, '⚠️ Use /start para escolher um plano antes de enviar o comprovante.');
  const plan = state.replace('awaiting_proof_', ''), fileId = msg.photo[msg.photo.length - 1].file_id, from = msg.from;
  pendingUsers[uid] = { id: from.id, username: from.username, first_name: from.first_name, plan, proofFileId: fileId, at: new Date().toISOString() };
  userData[uid] = { ...(userData[uid] || {}), id: from.id, username: from.username, first_name: from.first_name, plan, status: 'pending', joinedAt: userData[uid]?.joinedAt || new Date().toISOString() };
  userStates[uid] = 'pending_approval';
  save();
  await bot.sendMessage(msg.chat.id, '✅ Comprovante recebido! Aguarde confirmacao do admin.');
  const p = PLANS[plan] || PLANS.week;
  await bot.sendPhoto(ADMIN_ID, fileId, {
    caption: `📥 <b>Novo comprovante!</b>\n\n👤 ${uName(from)} (ID: <code>${from.id}</code>)\n📅 ${p.label} — ${p.price}\n🕐 ${new Date().toLocaleString('pt-BR')}`,
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: [[
      { text: '✅ Aprovar', callback_data: 'approve_' + uid },
      { text: '❌ Recusar', callback_data: 'reject_' + uid },
    ]] },
  }).catch(e => console.error('Erro admin:', e.message));
});

async function handleApprove(adminChatId, targetId) {
  if (!targetId) return bot.sendMessage(adminChatId, '⚠️ Use: /aprovar ID');
  const pending = pendingUsers[targetId];
  if (!pending) return bot.sendMessage(adminChatId, `❌ <code>${targetId}</code> nao encontrado.`, { parse_mode: 'HTML' });
  const plan = PLANS[pending.plan] || PLANS.week;
  let inviteLink = 'https://t.me/+72yoBuubirc1MmJh';
  if (config.groupChatId) {
    try { const obj = await bot.createChatInviteLink(config.groupChatId, { member_limit: 1, name: 'VIP-' + targetId }); inviteLink = obj.invite_link; }
    catch (e) { console.warn('Link unico falhou:', e.message); }
  }
  userData[targetId] = { ...(userData[targetId] || {}), id: pending.id, username: pending.username, first_name: pending.first_name, status: 'active', plan: pending.plan, expiresAt: calcExp(pending.plan), inviteLink, joinedAt: userData[targetId]?.joinedAt || new Date().toISOString() };
  delete pendingUsers[targetId];
  save();
  await bot.sendMessage(adminChatId, `✅ <code>${targetId}</code> aprovado!`, { parse_mode: 'HTML' });
  await bot.sendMessage(pending.id, `🎉 <b>Acesso liberado!</b>\n\n📅 Plano: <b>${plan.label}</b>\n📆 Valido ate: <b>${fmtDate(userData[targetId].expiresAt)}</b>\n\n👇 Seu link:\n${inviteLink}`, { parse_mode: 'HTML' }).catch(() => {});
}

async function handleReject(adminChatId, targetId) {
  if (!targetId) return bot.sendMessage(adminChatId, '⚠️ Use: /recusar ID');
  const pending = pendingUsers[targetId];
  delete pendingUsers[targetId];
  if (userData[targetId]) userData[targetId].status = 'expired';
  save();
  await bot.sendMessage(adminChatId, `❌ <code>${targetId}</code> recusado.`, { parse_mode: 'HTML' });
  if (pending) await bot.sendMessage(pending.id, '❌ Comprovante recusado. Envie novamente se achar que e erro.').catch(() => {});
}

bot.onText(/\/menu/, async msg => {
  if (!isAdmin(msg.from.id)) return;
  bot.sendMessage(msg.chat.id, `👑 <b>PAINEL ADMIN</b>\n\n/pendentes\n/aprovar ID\n/recusar ID\n/ban ID\n/desbanir ID\n/users\n/setgrupo (enviar no grupo)\n\n🔑 PIX: <code>${PIX_KEY}</code>`, { parse_mode: 'HTML' });
});
bot.onText(/\/pendentes/, async msg => {
  if (!isAdmin(msg.from.id)) return;
  const list = Object.values(pendingUsers);
  if (!list.length) return bot.sendMessage(msg.chat.id, '📭 Nenhum pendente.');
  let txt = `⏳ <b>Pendentes (${list.length}):</b>\n\n`;
  list.forEach((u, i) => { txt += `${i+1}. ${uName(u)} (ID: <code>${u.id}</code>) — ${PLANS[u.plan]?.label} ${PLANS[u.plan]?.price}\n`; });
  bot.sendMessage(msg.chat.id, txt, { parse_mode: 'HTML' });
});
bot.onText(/\/aprovar(?:\s+(\d+))?/, async (msg, m) => { if (!isAdmin(msg.from.id)) return; await handleApprove(msg.chat.id, m?.[1] || ''); });
bot.onText(/\/recusar(?:\s+(\d+))?/, async (msg, m) => { if (!isAdmin(msg.from.id)) return; await handleReject(msg.chat.id, m?.[1] || ''); });
bot.onText(/\/ban(?:\s+(\d+))?/, async (msg, m) => {
  if (!isAdmin(msg.from.id)) return;
  const id = m?.[1]; if (!id) return bot.sendMessage(msg.chat.id, '⚠️ Use: /ban ID');
  if (userData[id]) userData[id].status = 'banned'; delete pendingUsers[id]; save();
  if (config.groupChatId) bot.banChatMember(config.groupChatId, Number(id)).catch(() => {});
  bot.sendMessage(msg.chat.id, `🚫 <code>${id}</code> banido.`, { parse_mode: 'HTML' });
  bot.sendMessage(Number(id), '🚫 Voce foi banido do MUNDO CORNO 2026.').catch(() => {});
});
bot.onText(/\/desbanir(?:\s+(\d+))?/, async (msg, m) => {
  if (!isAdmin(msg.from.id)) return;
  const id = m?.[1]; if (!id) return bot.sendMessage(msg.chat.id, '⚠️ Use: /desbanir ID');
  if (userData[id]) userData[id].status = 'expired';
  if (config.groupChatId) bot.unbanChatMember(config.groupChatId, Number(id)).catch(() => {}); save();
  bot.sendMessage(msg.chat.id, `✅ <code>${id}</code> desbanido.`, { parse_mode: 'HTML' });
});
bot.onText(/\/users/, async msg => {
  if (!isAdmin(msg.from.id)) return;
  const all = Object.values(userData);
  bot.sendMessage(msg.chat.id, `👥 <b>Estatisticas</b>\n\n✅ Ativos: ${all.filter(u=>u.status==='active').length}\n⏳ Pendentes: ${Object.keys(pendingUsers).length}\n🚫 Banidos: ${all.filter(u=>u.status==='banned').length}\n📊 Total: ${all.length}`, { parse_mode: 'HTML' });
});
bot.onText(/\/setgrupo/, async msg => {
  if (!isAdmin(msg.from.id)) return;
  config.groupChatId = msg.chat.id; save();
  bot.sendMessage(msg.chat.id, `✅ Grupo salvo! ID: <code>${msg.chat.id}</code>`, { parse_mode: 'HTML' });
});

setInterval(async () => {
  const now = new Date();
  for (const [id, user] of Object.entries(userData)) {
    if (user.status === 'active' && user.expiresAt && new Date(user.expiresAt) < now) {
      user.status = 'expired'; save();
      if (config.groupChatId) { bot.banChatMember(config.groupChatId, user.id).catch(()=>{}); setTimeout(()=>bot.unbanChatMember(config.groupChatId, user.id).catch(()=>{}), 3000); }
      bot.sendMessage(user.id, '⏰ Seu acesso ao <b>MUNDO CORNO 2026</b> expirou!\n\nUse /start para renovar.', { parse_mode: 'HTML' }).catch(() => {});
    }
  }
}, 60 * 60 * 1000);

bot.on('polling_error', err => console.error('Erro:', err.message));
console.log('🤖 Bot Mundo Corno 2026 rodando!');
