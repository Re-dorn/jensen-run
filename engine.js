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
  function closeOverlay(id) { $(id).classList.remove('show'); }

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
      else if (k === 'jacket' || k === 'cook') v = Math.max(0, v);
      S[k] = v;
      const real = v - before;
      if (real) {
        deltas[k] = real;
        const info = STAT_INFO[k];
        const bad = k === 'heat' ? real > 0 : real < 0;
        toast(`${info.icon} ${info.name} ${real > 0 ? '+' : ''}${k === 'cash' ? fmtCash(real) : real}`, bad);
      }
    }
    return deltas;
  }

  function deltaHtml(deltas) {
    const parts = Object.entries(deltas).map(([k, d]) => {
      const info = STAT_INFO[k];
      const bad = k === 'heat' ? d > 0 : d < 0;
      return `<span class="${bad ? 'n' : 'p'}">${info.icon}${d > 0 ? '+' : ''}${k === 'cash' ? fmtCash(d) : d}</span>`;
    });
    return parts.length ? `<span class="dl">${parts.join('')}</span>` : '';
  }

  function moveNvda(pct) {
    S.prevNvda = S.nvda;
    S.nvda = Math.max(1, +(S.nvda * (1 + pct)).toFixed(2));
  }

  // ───── 动态 ─────
  function addFeed(html, cls = '') {
    feed.unshift({ html, cls });
    if (feed.length > 120) feed.length = 120;
    renderFeed();
  }
  function renderFeed() {
    $('feed').innerHTML = feed.map(f => `<div class="fd ${f.cls}">${f.html}</div>`).join('');
  }
  const whenTag = () => `<span class="when">${dateOf(S.day)} ${S.slot ? '晚上' : '白天'}</span><br>`;

  // ───── 渲染 ─────
  function render() {
    $('date-text').textContent = `${dateOf(S.day)} ${WEEKDAYS[(S.day - 1) % 7]}`;
    $('slot-text').textContent = S.slot ? '🌙 晚上' : '☀️ 白天';
    $('day-count').textContent = `第 ${S.day}/${TOTAL_DAYS} 天`;
    $('b-days').style.width = (S.day / TOTAL_DAYS * 100) + '%';
    const prev = S.prevNvda || S.nvda;
    const up = S.nvda >= prev;
    const pct = Math.abs((S.nvda - prev) / prev * 100).toFixed(2);
    $('s-nvda').innerHTML = `$${S.nvda.toFixed(2)} <span class="${up ? 'up' : 'down'}">${up ? '▲' : '▼'}${pct}%</span>`;
    renderStats();
    renderActions();
  }

  function statRow(k, val, max, extra = '') {
    const info = STAT_INFO[k];
    return `<div class="st ${extra}"><span class="lb">${info.icon} ${info.name}</span>
      <span class="bar"><i style="width:${clamp(val / max * 100, 0, 100)}%"></i></span><span class="val">${val}</span></div>`;
  }

  function renderStats() {
    let h = '<h4>基本状况</h4>';
    h += `<div class="st big ${S.cash < 500 ? 'danger' : ''}"><span class="lb">💵 资金</span><span class="val">${fmtCash(S.cash)}美元</span></div>`;
    h += `<div class="st big ${S.jacket <= 1 ? 'danger' : ''}"><span class="lb">🧥 皮衣</span><span class="val">${S.jacket} 件</span></div>`;
    h += statRow('mood', S.mood, 100, S.mood <= 20 ? 'danger' : '');
    h += statRow('rep', S.rep, 100);
    h += statRow('heat', S.heat, 100, 'heat' + (S.heat >= 80 ? ' danger' : ''));

    const routes = ['cn', 'tw', 'biz', 'pol'].filter(k => S.flags[STAT_INFO[k].flag]);
    if (routes.length || S.cook || S.law) {
      h += '<h4>进度</h4>';
      routes.forEach(k => { h += statRow(k, S[k], 100, 'route'); });
      if (S.cook) h += statRow('cook', S.cook, 8, 'route');
      if (S.law) h += statRow('law', S.law, 3, 'route');
    }

    const tags = [];
    const itemName = { jacket: '🧥 第 47 号皮衣', chip: '💾 工程样片', oven: '🔥 烤箱', mug: '☕ 最佳 CEO 马克杯' }[S.flags.item];
    if (itemName) tags.push(itemName);
    if (S.flags.guard) tags.push('🛡️ 保镖大卫');
    if (S.flags.pitchCat) tags.push('🐱 猫猫赛道');
    else if (S.flags.pitched) tags.push('💼 已路演');
    if (S.flags.hearingGood) tags.push('⚖️ 国会讲解员');
    if (S.flags.leatherBoom) tags.push('📈 皮衣热');
    if (tags.length) h += `<h4>状态</h4><div class="status-tags">${tags.map(t => `<span class="tag">${t}</span>`).join('')}</div>`;
    h += `<h4>每日开销</h4><div class="st"><span class="lb" style="width:auto;color:var(--muted)">${DAILY_COST + (S.flags.guard ? GUARD_COST : 0)} 万美元 / 天</span></div>`;
    $('stats').innerHTML = h;
  }

  function renderActions() {
    const box = $('actions');
    box.innerHTML = '';
    for (const [cat, label] of Object.entries(CATEGORIES)) {
      if (CAT_FLAG[cat] && !S.flags[CAT_FLAG[cat]]) continue;
      const list = ACTIONS.filter(a => a.cat === cat);
      const items = list.map(a => {
        const ok = !a.if || a.if(S);
        if (!ok && !a.need) return '';
        return `<button class="act ${ok ? '' : 'locked'}" data-id="${a.id}" ${ok ? '' : 'disabled'}>
          <span class="nm">${a.icon} ${a.name}</span><span class="ht">${ok ? a.hint : '🔒 需要 ' + a.need}</span></button>`;
      }).join('');
      if (items.trim()) box.insertAdjacentHTML('beforeend', `<div class="cat"><h3>${label}</h3><div class="acts">${items}</div></div>`);
    }
    box.querySelectorAll('.act:not(:disabled)').forEach(b => { b.onclick = () => doAction(b.dataset.id); });
  }

  const setBusy = v => $('actions').classList.toggle('busy', v);

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
        b.textContent = c.t;
        b.style.animationDelay = i * 70 + 'ms';
        b.onclick = e => { e.stopPropagation(); box.classList.remove('show'); res(c); };
        box.appendChild(b);
      });
      box.classList.add('show');
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
    openOverlay('event-overlay');
    setEventScene(ev);
    if (ev.nvda) { moveNvda(ev.nvda); render(); }
    await playLines(ev.lines);

    const choices = (ev.choices || []).filter(c => !c.if || c.if(S));
    let c = choices.length ? await askChoice(choices) : { fx: {} };
    // 先用选择前的状态解析全部字段，再统一生效
    const o = c.run ? { ...c, ...c.run(S) } : c;
    const r = { fx: resolve(o.fx, S), set: resolve(o.set, S), res: resolve(o.res, S), next: resolve(o.next, S), ending: resolve(o.ending, S) };
    if (r.set) Object.assign(S.flags, r.set);
    const deltas = applyFx(r.fx);
    render();
    if (c.t) addFeed(`${whenTag()}<span class="what">【${ev.title}】</span>${c.t}${deltaHtml(deltas)}`);
    if (r.res) await playLines(r.res);

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
      💵 ${fmtCash(S.cash)}美元 · 🧥 ${S.jacket} 件 · 🧠 ${S.mood} · 🎩 ${S.rep} · 🔥 ${S.heat}`;
    $('ending-count').textContent = `${isNew ? '🆕 新结局！' : ''}已解锁 ${got.length} / ${Object.keys(ENDINGS).length} 个结局`;
    openOverlay('ending-overlay');
    window.__lastEnding = id; // 供自动化测试读取
  }

  // 危机检查；返回 true 表示游戏结束
  async function critical() {
    for (let guard = 0; guard < 5; guard++) {
      if (S.heat >= 100) { if (await playEvent('overheat')) return true; continue; }
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
    addFeed(`${whenTag()}<span class="what">${a.icon} ${a.name}</span>：${r.text || ''}${deltaHtml(deltas)}`);
    render();
    if (r.event && await playEvent(r.event)) return;
    if (await critical()) return;
    await endSlot();
  }

  async function endSlot() {
    if (S.slot === 0) { S.slot = 1; return startSlot(); }

    // 一天结束：开销与自然变化
    const cost = DAILY_COST + (S.flags.guard ? GUARD_COST : 0);
    const deltas = applyFx({ cash: -cost, heat: -3, mood: -4 });
    moveNvda((Math.random() * 5 - 2.6) / 100);
    addFeed(`🌙 ${dateOf(S.day)} 结束。律师费、生活费${S.flags.guard ? '、保镖费' : ''}照常扣除。${deltaHtml(deltas)}`, 'sys');
    if (S.cash < 800 && S.law < 3) addFeed('⚠️ 管家提醒：现金快见底了。多见几次律师，股票解冻后就能抛售一部分。', 'sys');
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
    document.querySelectorAll('.overlay').forEach(o => o.classList.remove('show'));
    showScreen('game-screen');
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
    showScreen('game-screen');
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
  $('btn-again').onclick = newGame;
  $('btn-ending-gallery').onclick = renderGallery;
  $('btn-ending-title').onclick = toTitle;
  $('btn-menu').onclick = () => { if (ended || confirm('返回标题？当前进度已自动保存在本时段开始时。')) toTitle(); };
  $('btn-gallery-reset').onclick = () => { if (confirm('确定要清空所有结局记录吗？')) { saveEndings([]); renderGallery(); } };
  document.querySelectorAll('.close-btn').forEach(b => { b.onclick = () => b.closest('.overlay').classList.remove('show'); });
  $('event-box').onclick = onAdvance;
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
