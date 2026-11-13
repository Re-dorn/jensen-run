// 《皮衣求生记》引擎：日程行动 + 数值 + 事件弹窗
(() => {
  const SAVE_KEY = 'jensen_run_save_v2';
  const ENDING_KEY = 'jensen_run_endings_v2';
  const TYPE_SPEED = window.FAST_MODE ? 0 : 26;   // 每字毫秒数；测试时可设 FAST_MODE
  const RANDOM_EVENT_CHANCE = 0.5;
  const TYPE_LABEL = { good: '好结局', normal: '普通结局', hidden: '隐藏结局', bad: '坏结局', dead: '死亡结局' };
  const CAT_FLAG = { cn: 'cnOpen', tw: 'twOpen', biz: 'bizOpen', dc: 'dcOpen' };
  const WEEKDAYS = ['周五', '周六', '周日', '周一', '周二', '周三', '周四']; // 2026-11-13 是周五

  const $ = id => document.getElementById(id);
  const resolve = (v, s) => (typeof v === 'function' ? v(s) : v);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  const snd = (m, ...a) => window.Sound && window.Sound[m](...a);

  let S = null;          // 当前状态
  let feed = [];         // 动态记录
  let ended = false;

  // ───── 存档 ─────
  const loadEndings = () => { try { return JSON.parse(localStorage.getItem(ENDING_KEY)) || []; } catch { return []; } };
  const saveEndings = l => localStorage.setItem(ENDING_KEY, JSON.stringify(l));
  const saveGame = () => localStorage.setItem(SAVE_KEY, JSON.stringify({ S, feed: feed.slice(0, 60) }));
  const loadSave = () => { try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch { return null; } };
  const clearSave = () => localStorage.removeItem(SAVE_KEY);

  // ───── 工具 ─────
  const dateOf = d => (d <= 18 ? `11月${12 + d}日` : `12月${d - 18}日`);
  const fmtCash = v => (Math.abs(v) >= 10000 ? (v / 10000).toFixed(2) + ' 亿' : v + ' 万');

  function showScreen(id) { document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id)); }
  function openOverlay(id) { $(id).classList.add('show'); }
  function closeOverlay(id) {
    $(id).classList.remove('show');
    if (id === 'event-overlay') snd('duck', false);
  }

  function toast(msg, neg) {
    const el = document.createElement('div');
    el.className = 'toast' + (neg ? ' neg' : '');
    el.textContent = msg;
    $('toasts').appendChild(el);
    setTimeout(() => el.remove(), 2700);
  }

  // 应用数值变化，返回实际变化量
  function applyFx(fx) {
    const deltas = {};
    if (!fx) return deltas;
    for (const [k, d] of Object.entries(fx)) {
      if (!d) continue;
      const before = S[k];
      let v = before + d;
      if (['mood', 'rep', 'heat', 'cn', 'tw', 'biz', 'pol'].includes(k)) v = clamp(v, 0, 100);
      else if (k === 'law') v = clamp(v, 0, 3);
      else if (k === 'cook') v = clamp(v, 0, 8);
      else if (k === 'jacket') v = Math.max(0, v);
      S[k] = v;
      const real = v - before;
      if (real) {
        deltas[k] = real;
        const bad = k === 'heat' ? real > 0 : real < 0;
        toast(`${STAT_INFO[k].name} ${real > 0 ? '+' : ''}${k === 'cash' ? fmtCash(real) : real}`, bad);
      }
    }
    const keys = Object.keys(deltas);
    if (keys.length) {
      const bad = keys.some(k => (k === 'heat' ? deltas[k] > 0 : deltas[k] < 0));
      snd('sfx', bad ? 'down' : deltas.cash > 0 ? 'cash' : 'up');
      if (deltas.heat > 0 && S.heat >= 80 && S.heat - deltas.heat < 80) snd('sfx', 'alarm');
    }
    return deltas;
  }

  function deltaHtml(deltas) {
    const parts = Object.entries(deltas).map(([k, d]) => {
      const bad = k === 'heat' ? d > 0 : d < 0;
      return `<span class="${bad ? 'n' : 'p'}">${STAT_INFO[k].name} ${d > 0 ? '+' : ''}${k === 'cash' ? fmtCash(d) : d}</span>`;
    });
    return parts.length ? `<span class="dl">${parts.join('')}</span>` : '';
  }

  function moveNvda(pct) {
    S.prevNvda = S.nvda;
    S.nvda = Math.max(1, +(S.nvda * (1 + pct)).toFixed(2));
  }

  // ───── 手记（动态） ─────
  function addFeed(html, cls = '') {
    feed.unshift({ html, cls });
    if (feed.length > 120) feed.length = 120;
    renderFeed();
  }
  function renderFeed() {
    const item = f => `<div class="fd ${f.cls}">${f.html}</div>`;
    const empty = '<p class="fd-empty">还什么都没发生。先挑一件事做吧。</p>';
    $('feed').innerHTML = feed.length ? feed.map(item).join('') : empty;
    $('recent-list').innerHTML = feed.length ? feed.slice(0, 3).map(item).join('') : empty;
  }
  const whenTag = () => `<span class="when">${dateOf(S.day)} · ${S.slot ? '晚上' : '白天'}</span>`;

  // ───── 渲染 ─────
  const KEY_ACTIONS = ['cn_go', 'tw_go', 'pitch', 'gift', 'sell'];
  const ITEM_NAME = { jacket: '第 47 号皮衣', chip: '工程样片', oven: '烤箱', mug: '最佳 CEO 马克杯' };
  const catLabel = cat => CATEGORIES[cat].replace(/^\S+\s+/, '');
  let activeTab = 'life';

  function render() {
    $('date-text').textContent = `${dateOf(S.day)} ${WEEKDAYS[(S.day - 1) % 7]}`;
    const slot = $('slot-text');
    slot.textContent = S.slot ? '晚上' : '白天';
    slot.classList.toggle('night', !!S.slot);
    $('day-count').textContent = `第 ${S.day} / ${TOTAL_DAYS} 天`;
    $('b-days').style.width = (S.day / TOTAL_DAYS * 100) + '%';
    const prev = S.prevNvda || S.nvda;
    const up = S.nvda >= prev;
    const pct = Math.abs((S.nvda - prev) / prev * 100).toFixed(2);
    $('s-nvda').innerHTML = `NVDA<b>${S.nvda.toFixed(2)}</b><span class="${up ? 'up' : 'down'}">${up ? '+' : '−'}${pct}%</span>`;
    renderStats();
    renderActions();
    snd('setTension', S.heat >= 80);
  }

  const pctOf = (v, max) => clamp(v / max * 100, 0, 100);

  function meter(k, val, max, cls = '') {
    return `<div class="meter ${cls}"><span class="lb">${STAT_INFO[k].name}</span>
      <span class="bar"><i style="width:${pctOf(val, max)}%"></i></span><span class="v">${max === 100 ? val : val + '/' + max}</span></div>`;
  }

  function cashParts(v) {
    return Math.abs(v) >= 10000 ? [(v / 10000).toFixed(2), '亿美元'] : [String(v), '万美元'];
  }

  function renderStats() {
    const danger = { cash: S.cash < 500, jacket: S.jacket <= 1, mood: S.mood <= 20, heat: S.heat >= 80 };
    const [cv, cu] = cashParts(S.cash);

    // 账页（桌面左栏 / 手机“状态”页）
    let h = `<div class="ledger-big">
      <div class="${danger.cash ? 'danger' : ''}"><div class="lb">可动用资金</div><div class="v">${cv}<span class="u">${cu}</span></div></div>
      <div class="right ${danger.jacket ? 'danger' : ''}"><div class="lb">皮衣</div><div class="v">${S.jacket}<span class="u">件</span></div></div>
    </div>`;
    h += '<h4 class="sec-title">基本状况</h4>';
    h += meter('mood', S.mood, 100, danger.mood ? 'danger' : '');
    h += meter('rep', S.rep, 100);
    h += meter('heat', S.heat, 100, 'heat' + (danger.heat ? ' danger' : ''));

    const routes = ['cn', 'tw', 'biz', 'pol'].filter(k => S.flags[STAT_INFO[k].flag]);
    h += '<h4 class="sec-title">路线进度</h4>';
    if (routes.length || S.cook || S.law) {
      routes.forEach(k => { h += meter(k, S[k], 100, 'route'); });
      if (S.cook) h += meter('cook', S.cook, 8, 'route');
      if (S.law) h += meter('law', S.law, 3, 'route');
    } else {
      h += '<p class="hint-text">还没有找到出路。翻翻手机里的未读消息，也许有人在等你回复。</p>';
    }

    const tags = [];
    if (ITEM_NAME[S.flags.item]) tags.push(ITEM_NAME[S.flags.item]);
    if (S.flags.guard) tags.push('保镖大卫');
    if (S.flags.pitchCat) tags.push('猫猫赛道');
    else if (S.flags.pitched) tags.push('已路演');
    if (S.flags.hearingGood) tags.push('国会讲解员');
    if (S.flags.leatherBoom) tags.push('皮衣热');
    if (tags.length) h += `<h4 class="sec-title">随身</h4><div class="tags">${tags.map(t => `<span>${t}</span>`).join('')}</div>`;
    h += `<div class="cost"><span>每日开销</span><b>${DAILY_COST + (S.flags.guard ? GUARD_COST : 0)} 万美元</b></div>`;
    $('stats').innerHTML = h;

    // 手机顶部数值条
    const chip = (lb, v, cls, bar) => `<div class="chip ${cls}"><div class="lb">${lb}</div><div class="v">${v}</div>${bar != null ? `<span class="bar"><i style="width:${bar}%"></i></span>` : ''}</div>`;
    $('strip').innerHTML =
      chip('资金', `${cv}<small>${cu.replace('美元', '')}</small>`, danger.cash ? 'danger' : '') +
      chip('皮衣', `${S.jacket}<small>件</small>`, danger.jacket ? 'danger' : '') +
      chip('精神', S.mood, danger.mood ? 'danger' : '', S.mood) +
      chip('声望', S.rep, '', S.rep) +
      chip('热度', S.heat, 'heat' + (danger.heat ? ' danger' : ''), S.heat);
  }

  function renderActions() {
    const cats = Object.keys(CATEGORIES).filter(c => !CAT_FLAG[c] || S.flags[CAT_FLAG[c]]);
    if (!cats.includes(activeTab)) activeTab = 'life';

    $('tabs').innerHTML = cats.map(c =>
      `<button role="tab" data-cat="${c}" class="${c === activeTab ? 'active' : ''}" aria-selected="${c === activeTab}">${catLabel(c)}</button>`).join('');
    $('tabs').querySelectorAll('button').forEach(b => {
      b.onclick = () => { activeTab = b.dataset.cat; renderActions(); };
    });

    let html = '';
    for (const cat of cats) {
      const list = ACTIONS.filter(a => a.cat === cat);
      const avail = a => !a.if || a.if(S);
      const keys = list.filter(a => KEY_ACTIONS.includes(a.id) && avail(a));
      const normal = list.filter(a => !keys.includes(a) && avail(a));
      const locked = list.filter(a => !avail(a) && a.need);
      if (!keys.length && !normal.length && !locked.length) continue;

      html += `<section class="cat ${cat === activeTab ? 'show' : ''}"><div class="cat-title"><h3>${catLabel(cat)}</h3></div>`;
      html += keys.map(a => `<button class="key-act" data-id="${a.id}"><span class="tag">关键一步</span><span class="nm">${a.name}</span><span class="ht">${a.hint}</span></button>`).join('');
      html += '<div class="acts">';
      html += normal.map(a => `<button class="act" data-id="${a.id}"><span class="nm">${a.name}</span><span class="ht">${a.hint}</span></button>`).join('');
      html += locked.map(a => `<button class="act locked" disabled><span class="nm">${a.name}</span><span class="ht">需要 ${a.need}</span></button>`).join('');
      html += '</div></section>';
    }
    $('actions').innerHTML = html;
    $('actions').querySelectorAll('[data-id]').forEach(b => { b.onclick = () => doAction(b.dataset.id); });
  }

  const setBusy = v => $('main').classList.toggle('busy', v);

  function showPage(p) {
    document.querySelectorAll('#layout .page').forEach(el => el.classList.toggle('active', el.dataset.page === p));
    document.querySelectorAll('#bottom-nav button').forEach(b => b.classList.toggle('active', b.dataset.page === p));
    const el = document.querySelector(`#layout .page[data-page="${p}"]`);
    if (el) el.scrollTop = 0;
  }

  // ───── 对话播放 ─────
  let advanceResolver = null;
  let typingTimer = null;
  let typingFull = '';

  function typeLine(line) {
    return new Promise(res => {
      const [who, text] = Array.isArray(line) ? line : ['', line];
      const sp = $('speaker');
      sp.textContent = who;
      sp.classList.toggle('player', who === '黄仁勋');
      $('text').classList.toggle('narration', !who);
      $('next-hint').classList.remove('show');
      typingFull = text;
      const el = $('text');
      if (!TYPE_SPEED) { el.textContent = text; $('next-hint').classList.add('show'); advanceResolver = res; return; }
      el.textContent = '';
      let i = 0;
      clearInterval(typingTimer);
      typingTimer = setInterval(() => {
        el.textContent = text.slice(0, ++i);
        snd('sfx', 'type');
        if (i >= text.length) { clearInterval(typingTimer); typingTimer = null; $('next-hint').classList.add('show'); }
      }, TYPE_SPEED);
      advanceResolver = res;
    });
  }

  function onAdvance() {
    if (!advanceResolver) return;
    if (typingTimer) {
      clearInterval(typingTimer); typingTimer = null;
      $('text').textContent = typingFull;
      $('next-hint').classList.add('show');
      return;
    }
    const r = advanceResolver; advanceResolver = null; r();
  }

  async function playLines(lines) {
    for (const raw of lines || []) {
      const line = resolve(raw, S);
      if (line) await typeLine(line);
    }
  }

  function askChoice(choices) {
    return new Promise(res => {
      const box = $('event-choices');
      box.innerHTML = '';
      $('next-hint').classList.remove('show');
      choices.forEach((c, i) => {
        const b = document.createElement('button');
        b.innerHTML = `<span class="no">${i + 1}</span><span class="ct"></span>${typeof c.ending === 'string' ? '<span class="end-tag">直接进入结局</span>' : ''}`;
        b.querySelector('.ct').textContent = c.t;
        b.style.animationDelay = i * 70 + 'ms';
        b.onclick = e => { e.stopPropagation(); snd('sfx', 'confirm'); box.classList.remove('show'); $('event-box').classList.remove('choosing'); res(c); };
        box.appendChild(b);
      });
      box.classList.add('show');
      snd('sfx', 'pop');
      $('event-box').classList.add('choosing');
    });
  }

  function setEventScene(ev) {
    $('event-box').className = 'bg-' + (ev.bg || 'hq');
    $('event-title').textContent = ev.title || '';
    const art = $('event-art');
    art.textContent = ev.art || '';
    art.classList.remove('pop'); void art.offsetWidth; art.classList.add('pop');
  }

  // 播放事件；返回 true 表示游戏结束
  async function playEvent(id) {
    const ev = EVENTS[id];
    if (!ev) { console.error('未找到事件', id); return false; }
    S.flags['seen_' + id] = true;
    snd('sfx', 'event');
    snd('duck', true);
    openOverlay('event-overlay');
    setEventScene(ev);
    if (ev.nvda) { moveNvda(ev.nvda); render(); }
    await playLines(ev.lines);

    const choices = (ev.choices || []).filter(c => !c.if || c.if(S));
    let c = choices.length ? await askChoice(choices) : { fx: {} };
    // 先用选择前的状态解析全部字段，再统一生效
    const o = c.run ? { ...c, ...c.run(S) } : c;
    const r = { fx: resolve(o.fx, S), set: resolve(o.set, S), res: resolve(o.res, S), next: resolve(o.next, S), ending: resolve(o.ending, S), skip: resolve(o.skip, S) };
    if (r.set) Object.assign(S.flags, r.set);
    const deltas = applyFx(r.fx);
    render();
    if (c.t) addFeed(`${whenTag()}<span class="what">${ev.title}</span>${c.t}${deltaHtml(deltas)}`);
    if (r.res) await playLines(r.res);
    if (r.skip) skipDays(r.skip);

    if (r.ending) { await playEnding(r.ending); return true; }
    if (r.next) return playEvent(r.next);
    closeOverlay('event-overlay');
    return false;
  }

  // ───── 结局 ─────
  async function playEnding(id) {
    ended = true;
    const e = ENDINGS[id];
    openOverlay('event-overlay');
    setEventScene({ ...e, title: '结局 · ' + e.title });
    await playLines(e.lines);
    closeOverlay('event-overlay');

    const got = loadEndings();
    const isNew = !got.includes(id);
    if (isNew) { got.push(id); saveEndings(got); }
    clearSave();

    $('ending-type').innerHTML = `<span class="badge ${e.type}">${TYPE_LABEL[e.type]}</span>`;
    $('ending-title').textContent = `「${e.title}」`;
    $('ending-desc').textContent = e.desc;
    $('ending-stats').innerHTML = `坚持到 ${dateOf(S.day)}（第 ${S.day} 天）<br>
      资金 ${fmtCash(S.cash)}美元 · 皮衣 ${S.jacket} 件 · 精神 ${S.mood} · 声望 ${S.rep} · 热度 ${S.heat}`;
    $('ending-count').innerHTML = `${isNew ? '<b>新结局</b> · ' : ''}已解锁 ${got.length} / ${Object.keys(ENDINGS).length} 个结局`;
    snd('ending', e.type);
    openOverlay('ending-overlay');
    window.__lastEnding = id; // 供自动化测试读取
  }

  // 危机检查；返回 true 表示游戏结束
  async function critical() {
    for (let guard = 0; guard < 5; guard++) {
      if (S.heat >= 100) { snd('sfx', 'alarm'); if (await playEvent('overheat')) return true; continue; }
      if (S.mood <= 0) { await playEnding('collapse'); return true; }
      if (S.cash <= 0) { await playEnding('dishwasher'); return true; }
      if (S.jacket <= 0) { await playEnding('nojacket'); return true; }
      return false;
    }
    return false;
  }

  function pickRandomEvent() {
    const pool = [];
    for (const [id, ev] of Object.entries(EVENTS)) {
      const isContact = CONTACT_EVENTS.includes(id);
      if (!ev.weight && !isContact) continue;
      if (ev.once && S.flags['seen_' + id]) continue;
      if (ev.cond && !ev.cond(S)) continue;
      pool.push([id, ev.weight || 1]);
    }
    const total = pool.reduce((a, [, w]) => a + w, 0);
    let r = Math.random() * total;
    for (const [id, w] of pool) { if ((r -= w) < 0) return id; }
    return null;
  }

  // ───── 主循环 ─────
  async function startSlot() {
    const fixed = FIXED_EVENTS[S.day];
    if (S.slot === 0 && fixed && !S.flags['fixed_' + S.day]) {
      S.flags['fixed_' + S.day] = true;
      render();
      if (await playEvent(fixed)) return;
    }
    if (await critical()) return;
    render();
    saveGame();
    setBusy(false);
  }

  async function doAction(id) {
    if (ended) return;
    const a = ACTIONS.find(x => x.id === id);
    if (!a || (a.if && !a.if(S))) return;
    setBusy(true);
    const r = a.run(S);
    if (r.set) Object.assign(S.flags, r.set);
    if (r.nvda) moveNvda(r.nvda);
    const deltas = applyFx(r.fx);
    addFeed(`${whenTag()}<span class="what">${a.name}</span>${r.text || ''}${deltaHtml(deltas)}`);
    render();
    if (r.event && await playEvent(r.event)) return;
    if (await critical()) return;
    await endSlot();
  }

  function skipDays(n) {
    const days = Math.min(n, TOTAL_DAYS - S.day);
    if (days <= 0) return;
    const cost = (DAILY_COST + (S.flags.guard ? GUARD_COST : 0)) * days;
    const deltas = applyFx({ cash: -cost, heat: -3 * days });
    S.day += days;
    addFeed(`离开了 ${days} 天，回来时已是${dateOf(S.day)}。这几天的开销照常扣除。${deltaHtml(deltas)}`, 'sys');
    render();
  }

  async function endSlot() {
    if (S.slot === 0) { S.slot = 1; return startSlot(); }

    // 一天结束：开销与自然变化
    const cost = DAILY_COST + (S.flags.guard ? GUARD_COST : 0);
    const deltas = applyFx({ cash: -cost, heat: -3, mood: -4 });
    moveNvda((Math.random() * 5 - 2.6) / 100);
    addFeed(`${dateOf(S.day)} 结束。律师费、生活费${S.flags.guard ? '、保镖费' : ''}照常扣除。${deltaHtml(deltas)}`, 'sys');
    snd('sfx', 'day');
    if (S.cash < 800 && S.law < 3) addFeed('管家提醒：现金快见底了。多见几次律师，股票解冻后就能抛售一部分。', 'sys');
    render();
    if (await critical()) return;

    if (Math.random() < RANDOM_EVENT_CHANCE) {
      const ev = pickRandomEvent();
      if (ev && await playEvent(ev)) return;
      if (await critical()) return;
    }

    S.day++;
    S.slot = 0;
    if (S.day > TOTAL_DAYS) {
      S.day = TOTAL_DAYS;
      await playEvent('final');
      return;
    }
    await startSlot();
  }

  // ───── 开始 / 菜单 ─────
  function newGame() {
    S = JSON.parse(JSON.stringify(INITIAL_STATE));
    feed = [];
    ended = false;
    snd('startMusic');
    document.querySelectorAll('.overlay').forEach(o => o.classList.remove('show'));
    showScreen('game-screen');
    showPage('actions');
    renderFeed();
    render();
    setBusy(true);
    startSlot();
  }

  function continueGame() {
    const sv = loadSave();
    if (!sv) return;
    S = sv.S;
    feed = sv.feed || [];
    ended = false;
    snd('startMusic');
    showScreen('game-screen');
    showPage('actions');
    renderFeed();
    render();
    setBusy(false);
  }

  function toTitle() {
    clearInterval(typingTimer); typingTimer = null; advanceResolver = null;
    document.querySelectorAll('.overlay').forEach(o => o.classList.remove('show'));
    $('btn-continue').disabled = !loadSave();
    showScreen('title-screen');
  }

  function renderGallery() {
    const got = loadEndings();
    const all = Object.entries(ENDINGS);
    $('gallery-count').textContent = `${got.length} / ${all.length}`;
    $('gallery-list').innerHTML = all.map(([id, e]) => {
      const ok = got.includes(id);
      return `<div class="g-item ${ok ? '' : 'locked'}"><span class="badge ${ok ? e.type : 'lock'}">${ok ? TYPE_LABEL[e.type] : '？？？'}</span>
        <div class="name">${ok ? e.title : '尚未解锁'}</div></div>`;
    }).join('');
    openOverlay('gallery-overlay');
  }

  $('btn-new').onclick = newGame;
  $('btn-continue').onclick = continueGame;
  $('btn-gallery').onclick = renderGallery;
  $('btn-about').onclick = () => openOverlay('about-overlay');

  function openSound() {
    const c = window.Sound ? window.Sound.cfg : { music: false, sfx: false, volume: 0.7 };
    $('opt-music').checked = c.music;
    $('opt-sfx').checked = c.sfx;
    $('opt-volume').value = Math.round(c.volume * 100);
    openOverlay('sound-overlay');
  }
  document.querySelectorAll('.btn-sound').forEach(b => { b.onclick = openSound; });
  $('opt-music').onchange = e => snd('setMusic', e.target.checked);
  $('opt-sfx').onchange = e => snd('setSfx', e.target.checked);
  $('opt-volume').oninput = e => snd('setVolume', e.target.value / 100);
  $('btn-again').onclick = newGame;
  $('btn-ending-gallery').onclick = renderGallery;
  $('btn-ending-title').onclick = toTitle;
  $('btn-menu').onclick = () => { if (ended || confirm('返回标题？当前进度已自动保存在本时段开始时。')) toTitle(); };
  $('btn-gallery-reset').onclick = () => { if (confirm('确定要清空所有结局记录吗？')) { saveEndings([]); renderGallery(); } };
  document.querySelectorAll('.close-btn').forEach(b => { b.onclick = () => b.closest('.overlay').classList.remove('show'); });
  $('event-box').onclick = onAdvance;
  document.querySelectorAll('#bottom-nav button').forEach(b => { b.onclick = () => showPage(b.dataset.page); });
  $('btn-more-feed').onclick = () => showPage('feed');
  document.addEventListener('keydown', e => {
    if (!$('event-overlay').classList.contains('show')) return;
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onAdvance(); }
    if (/^[1-9]$/.test(e.key) && $('event-choices').classList.contains('show')) {
      const b = $('event-choices').querySelectorAll('button')[+e.key - 1];
      if (b) b.click();
    }
  });

  toTitle();
})();
