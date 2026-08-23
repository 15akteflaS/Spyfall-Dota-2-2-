const https = require('https');
const crypto = require('crypto');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const PUBLIC_URL = process.env.PUBLIC_URL || '';
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || '';

const HEROES = [
  'Abaddon','Alchemist','Ancient Apparition','Anti-Mage','Arc Warden','Axe','Bane','Batrider','Beastmaster','Bloodseeker','Bounty Hunter','Brewmaster','Bristleback','Broodmother','Centaur Warrunner','Chaos Knight','Chen','Clinkz','Clockwerk','Crystal Maiden','Dark Seer','Dark Willow','Dawnbreaker','Dazzle','Death Prophet','Disruptor','Doom','Dragon Knight','Drow Ranger','Earthshaker','Earth Spirit','Elder Titan','Ember Spirit','Enchantress','Enigma','Faceless Void','Grimstroke','Gyrocopter','Hoodwink','Huskar','Invoker','Jakiro','Juggernaut','Keeper of the Light','Kez','Kunkka','Legion Commander','Leshrac','Lich','Lifestealer','Lina','Lion','Lone Druid','Luna','Lycan','Marci','Magnus','Mars','Medusa','Meepo','Mirana','Monkey King','Morphling','Muerta','Naga Siren','Nature\'s Prophet','Necrophos','Night Stalker','Nyx Assassin','Ogre Magi','Omniknight','Oracle','Outworld Destroyer','Pangolier','Phantom Assassin','Phantom Lancer','Phoenix','Primal Beast','Puck','Pudge','Pugna','Queen of Pain','Razor','Riki','Ringmaster','Rubick','Sand King','Shadow Demon','Shadow Fiend','Shadow Shaman','Silencer','Skywrath Mage','Slardar','Slark','Snapfire','Sniper','Spectre','Spirit Breaker','Storm Spirit','Sven','Techies','Templar Assassin','Terrorblade','Tidehunter','Timbersaw','Tinker','Tiny','Treant Protector','Troll Warlord','Tusk','Underlord','Undying','Ursa','Vengeful Spirit','Venomancer','Viper','Visage','Void Spirit','Warlock','Weaver','Windranger','Winter Wyvern','Witch Doctor','Wraith King','Zeus'
];

const rooms = new Map();

function api(method, data = {}) {
  return new Promise((resolve, reject) => {
    if (!TOKEN) return reject(new Error('TELEGRAM_BOT_TOKEN is not set'));
    const body = JSON.stringify(data);
    const req = https.request(`https://api.telegram.org/bot${TOKEN}/${method}`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body)}
    }, res => {
      let out = '';
      res.on('data', d => out += d);
      res.on('end', () => {
        try {
          const result = JSON.parse(out);
          if (result.ok) resolve(result.result);
          else reject(new Error(result.description || 'Telegram API error'));
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

const send = (chat_id, text, extra = {}) => api('sendMessage', {chat_id, text, ...extra});
const keyboard = rows => ({reply_markup: {inline_keyboard: rows}});
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const nameOf = u => [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || `Игрок ${u.id}`;
const menu = () => keyboard([
  [{text: '🎮 Создать игру', callback_data: 'create'}],
  [{text: '🔑 Войти по коду', callback_data: 'join'}]
]);
const makeCode = () => { let c; do c = crypto.randomBytes(3).toString('hex').toUpperCase(); while (rooms.has(c)); return c; };

function lobby(r) {
  const list = r.players.map((p, i) => `${i + 1}. ${esc(p.name)}`).join('\n');
  return `🎮 <b>DOTA SPYFALL</b>\n\nКомната: <code>${r.code}</code>\nИгроков: ${r.players.length}/20\n\n${list}\n\nПередай код друзьям. Каждый должен открыть бота и нажать «Войти по коду».`;
}

async function showLobby(r) {
  const canStart = r.players.length >= 3;
  const rows = [[{text: '🔑 Войти по коду', callback_data: 'join'}]];
  rows.push([{text: canStart ? '▶️ Начать раунд' : '⏳ Нужно минимум 3 игрока', callback_data: canStart ? 'start' : 'noop'}]);
  for (const p of r.players) {
    try { await send(p.id, lobby(r), {parse_mode: 'HTML', ...keyboard(rows)}); } catch (e) { console.error('lobby send:', e.message); }
  }
}

async function startRound(r) {
  if (r.players.length < 3) return;
  const spy = crypto.randomInt(r.players.length);
  const hero = HEROES[crypto.randomInt(HEROES.length)];
  r.round += 1;
  r.started = true;
  r.players.forEach((p, i) => p.role = i === spy ? 'spy' : 'civilian');

  for (const p of r.players) {
    const text = p.role === 'spy'
      ? '🕵️ <b>ТЫ ШПИОН</b>\n\nГерой тебе неизвестен. Слушай подсказки и попробуй вычислить героя.'
      : `⚔️ <b>ТЫ ИГРОК</b>\n\nТвой герой:\n<b>${esc(hero)}</b>\n\nНе называй его напрямую — давай аккуратные подсказки.`;
    try { await send(p.id, text, {parse_mode: 'HTML'}); } catch (e) { console.error('role send:', e.message); }
  }

  for (const p of r.players) {
    try { await send(p.id, `🔥 Раунд ${r.round} начался!\n\nРоли отправлены каждому игроку в личку.\nОбсуждайте подсказки в группе Telegram.`); } catch (e) {}
  }
}

async function handleUpdate(update) {
  if (update.callback_query) {
    const q = update.callback_query;
    const id = q.from.id;
    await api('answerCallbackQuery', {callback_query_id: q.id});

    if (q.data === 'noop') return;
    if (q.data === 'create') {
      const code = makeCode();
      const room = {code, players: [], started: false, round: 0, creator: id};
      rooms.set(code, room);
      room.players.push({id, name: nameOf(q.from)});
      return send(id, lobby(room), {parse_mode: 'HTML', ...keyboard([
        [{text: '🔑 Войти по коду', callback_data: 'join'}],
        [{text: '▶️ Начать раунд', callback_data: 'start'}]
      ])});
    }
    if (q.data === 'join') return send(id, 'Введи код комнаты сообщением.\n\nНапример: <code>AB12CD</code>', {parse_mode: 'HTML'});
    if (q.data === 'start') {
      const room = [...rooms.values()].find(r => r.creator === id && !r.started);
      if (!room) return send(id, '❌ Комната не найдена или раунд уже начался.');
      return startRound(room);
    }
    return;
  }

  if (!update.message) return;
  const m = update.message;
  const id = m.from.id;
  const text = (m.text || '').trim();

  if (text === '/start') {
    return send(id, '🎮 <b>DOTA SPYFALL</b>\n\nШпионская игра по героям Dota 2.\nМинимум 3 игрока. Роли приходят в личку.\n\nАвтор: Salfetka51', {parse_mode: 'HTML', ...menu()});
  }

  if (/^[A-Z0-9]{6}$/i.test(text)) {
    const room = rooms.get(text.toUpperCase());
    if (!room) return send(id, '❌ Комната не найдена. Проверь код.');
    if (room.started) return send(id, '❌ Этот раунд уже начался.');
    if (room.players.some(p => p.id === id)) return send(id, 'Ты уже в этой комнате.');
    if (room.players.length >= 20) return send(id, '❌ В комнате уже 20 игроков.');
    room.players.push({id, name: nameOf(m.from)});
    await send(id, '✅ Ты присоединился!');
    return showLobby(room);
  }

  if (text === '/new' || text === '/newgame') return send(id, 'Нажми кнопку ниже, чтобы создать комнату.', menu());
  return send(id, 'Не понял команду. Используй меню:', menu());
}

async function setup() {
  if (!TOKEN) { console.log('Telegram bot disabled: TELEGRAM_BOT_TOKEN is not set'); return; }
  if (!PUBLIC_URL) { console.log('Telegram bot disabled: PUBLIC_URL is not set'); return; }
  const url = PUBLIC_URL.replace(/\/$/, '') + '/telegram/webhook';
  const data = {url, allowed_updates: ['message', 'callback_query'], drop_pending_updates: true};
  if (WEBHOOK_SECRET) data.secret_token = WEBHOOK_SECRET;
  try {
    await api('setWebhook', data);
    console.log('Telegram webhook set:', url);
  } catch (e) { console.error('Telegram webhook setup error:', e.message); }
}

module.exports = {handleUpdate, setup, WEBHOOK_SECRET, enabled: !!TOKEN};
