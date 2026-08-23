const https = require('https');
const crypto = require('crypto');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TOKEN) {
  console.log('Telegram bot disabled: TELEGRAM_BOT_TOKEN is not set');
  module.exports = {};
} else {
  const API = `https://api.telegram.org/bot${TOKEN}/`;
  const HEROES = ["Abaddon","Alchemist","Ancient Apparition","Anti-Mage","Arc Warden","Axe","Bane","Batrider","Beastmaster","Bloodseeker","Bounty Hunter","Brewmaster","Bristleback","Broodmother","Centaur Warrunner","Chaos Knight","Chen","Clinkz","Clockwerk","Crystal Maiden","Dark Seer","Dark Willow","Dawnbreaker","Dazzle","Death Prophet","Disruptor","Doom","Dragon Knight","Drow Ranger","Earthshaker","Earth Spirit","Elder Titan","Ember Spirit","Enchantress","Enigma","Faceless Void","Grimstroke","Gyrocopter","Hoodwink","Huskar","Invoker","Jakiro","Juggernaut","Keeper of the Light","Kez","Kunkka","Legion Commander","Leshrac","Lich","Lifestealer","Lina","Lion","Lone Druid","Luna","Lycan","Marci","Magnus","Mars","Medusa","Meepo","Mirana","Monkey King","Morphling","Muerta","Naga Siren","Nature's Prophet","Necrophos","Night Stalker","Nyx Assassin","Ogre Magi","Omniknight","Oracle","Outworld Destroyer","Pangolier","Phantom Assassin","Phantom Lancer","Phoenix","Primal Beast","Puck","Pudge","Pugna","Queen of Pain","Razor","Riki","Ringmaster","Rubick","Sand King","Shadow Demon","Shadow Fiend","Shadow Shaman","Silencer","Skywrath Mage","Slardar","Slark","Snapfire","Sniper","Spectre","Spirit Breaker","Storm Spirit","Sven","Techies","Templar Assassin","Terrorblade","Tidehunter","Timbersaw","Tinker","Tiny","Treant Protector","Troll Warlord","Tusk","Underlord","Undying","Ursa","Vengeful Spirit","Venomancer","Viper","Visage","Void Spirit","Warlock","Weaver","Windranger","Winter Wyvern","Witch Doctor","Wraith King","Zeus"];
  const rooms = new Map();
  let offset = 0;

  function api(method, data = {}) {
    return new Promise((resolve, reject) => {
      const body = JSON.stringify(data);
      const req = https.request(API + method, { method:'POST', headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)} }, res => {
        let out=''; res.on('data', d=>out+=d); res.on('end',()=>{ try { const j=JSON.parse(out); j.ok ? resolve(j.result) : reject(new Error(j.description||'Telegram API error')); } catch(e){reject(e);} });
      });
      req.on('error', reject); req.write(body); req.end();
    });
  }
  const send = (chat_id, text, extra={}) => api('sendMessage',{chat_id,text,...extra});
  const kb = rows => ({ reply_markup:{inline_keyboard:rows} });
  const code = () => { let c; do c=crypto.randomBytes(3).toString('hex').toUpperCase(); while(rooms.has(c)); return c; };
  const nameOf = u => [u.first_name,u.last_name].filter(Boolean).join(' ') || u.username || `Игрок ${u.id}`;
  function mainMenu() { return kb([[{text:'🎮 Создать игру',callback_data:'create'}],[{text:'🔑 Войти по коду',callback_data:'join'}]]); }
  function lobby(r) { return `🎮 <b>DOTA SPYFALL</b>\n\nКомната: <code>${r.code}</code>\nИгроков: ${r.players.length}/20\n\n${r.players.map((p,i)=>`${i+1}. ${escapeHtml(p.name)}`).join('\n')}\n\nПередай код друзьям. Каждый должен открыть бота и нажать «Войти по коду».`; }
  const escapeHtml=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  async function showStart(r) { const can=r.players.length>=3; for(const p of r.players) await send(p.id,lobby(r),{parse_mode:'HTML',...kb([[{text:can?'▶️ Начать раунд':'⏳ Нужно минимум 3 игрока',callback_data:can?'start':'noop'}]])}); }
  async function start(r) {
    if(r.players.length<3) return;
    const spy=crypto.randomInt(r.players.length), hero=HEROES[crypto.randomInt(HEROES.length)];
    r.round++; r.started=true; r.players.forEach((p,i)=>p.role=i===spy?'spy':'civilian');
    for(const p of r.players) await send(p.id,p.role==='spy'?'🕵️ <b>ТЫ ШПИОН</b>\n\nГерой тебе неизвестен. Слушай подсказки и попробуй вычислить героя.':'⚔️ <b>ТЫ ИГРОК</b>\n\nТвой герой:\n<b>'+escapeHtml(hero)+'</b>\n\nНе называй его напрямую — давай аккуратные подсказки.',{parse_mode:'HTML'});
    await broadcast(r,`🔥 Раунд ${r.round} начался!\n\nРоли отправлены каждому игроку в личку.\nОбсуждайте подсказки в своей группе Telegram.`);
  }
  async function broadcast(r,text) { for(const p of r.players) await send(p.id,text); }

  async function handleUpdate(u) {
    if(u.callback_query) {
      const q=u.callback_query, id=q.from.id, data=q.data;
      await api('answerCallbackQuery',{callback_query_id:q.id});
      if(data==='create') {
        const c=code(), r={code:c,players:[],started:false,round:0,creator:id,waiting:false}; rooms.set(c,r);
        r.players.push({id,name:nameOf(q.from)});
        return send(id,lobby(r),{parse_mode:'HTML',...kb([[{text:'🔑 Добавить игрока по коду',callback_data:'join'}],[{text:'▶️ Начать раунд',callback_data:'start'}]])});
      }
      if(data==='join') return send(id,'Введи код комнаты сообщением.\n\nНапример: <code>AB12CD</code>',{parse_mode:'HTML'});
      if(data==='start') { const r=[...rooms.values()].find(x=>x.creator===id && x.players.some(p=>p.id===id)); if(r) await start(r); return; }
      return;
    }
    if(!u.message) return;
    const m=u.message, id=m.from.id, text=(m.text||'').trim();
    if(text.startsWith('/start')) return send(id,'🎮 <b>DOTA SPYFALL</b>\n\nШпионская игра по героям Dota 2.\nМинимум 3 игрока. Роли приходят в личку.\n\nАвтор: Salfetka51',{parse_mode:'HTML',...mainMenu()});
    if(/^[A-Z0-9]{6}$/i.test(text)) {
      const r=rooms.get(text.toUpperCase());
      if(!r) return send(id,'❌ Комната не найдена. Проверь код.');
      if(r.started) return send(id,'❌ Этот раунд уже начался.');
      if(r.players.some(p=>p.id===id)) return send(id,'Ты уже в этой комнате.');
      if(r.players.length>=20) return send(id,'❌ В комнате уже 20 игроков.');
      r.players.push({id,name:nameOf(m.from)}); await send(id,'✅ Ты присоединился!'); return showStart(r);
    }
    if(text==='/new' || text==='/newgame') return send(id,'Нажми кнопку ниже, чтобы создать комнату.',mainMenu());
    return send(id,'Не понял команду. Используй меню:',mainMenu());
  }

  async function poll() {
    try {
      const updates=await api('getUpdates',{offset,timeout:25,allowed_updates:['message','callback_query']});
      for(const u of updates){offset=u.update_id+1; try{await handleUpdate(u)}catch(e){console.error('Telegram update error',e)}}
    } catch(e) { console.error('Telegram polling error:',e.message); await new Promise(r=>setTimeout(r,3000)); }
    setImmediate(poll);
  }
  api('deleteWebhook',{drop_pending_updates:true}).then(()=>{ console.log('Telegram Dota Spyfall bot started'); poll(); }).catch(e=>console.error('Telegram bot start error:',e.message));
}
