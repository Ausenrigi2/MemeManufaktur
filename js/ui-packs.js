// ============ Pakete-Seite ============
import { el, t, toast, applyI18n } from './lib.js';
import { Packs, ServerAPI } from './packs.js';

// ---------- Modale (statt prompt/confirm) ----------
function openModal(title, buildBody, onClose) {
  const body = el('div', { class: 'modal-body' });
  const closeBtn = el('button', { class: 'btn btn-icon btn-sm', type: 'button', 'aria-label': 'Schließen' }, '✕');
  const backdrop = el('div', { class: 'modal-backdrop' },
    el('div', { class: 'modal' },
      el('div', { class: 'modal-head' }, el('h3', { style: 'margin:0' }, title), closeBtn),
      body,
    ),
  );
  const close = (val) => {
    document.removeEventListener('keydown', onKey);
    backdrop.remove();
    onClose(val);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(null); };
  closeBtn.addEventListener('click', () => close(null));
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(null); });
  document.addEventListener('keydown', onKey);
  document.body.append(backdrop);
  body.append(buildBody(close));
  return backdrop;
}

function promptModal({ title, value = '', placeholder = '', okLabel = t('ui.create') }) {
  return new Promise((resolve) => {
    let input;
    openModal(title, (close) => {
      input = el('input', { type: 'text', value, placeholder, maxlength: 60 });
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') close(input.value); });
      return el('div', {},
        input,
        el('div', { style: 'display:flex;gap:10px;justify-content:flex-end;margin-top:16px' },
          el('button', { class: 'btn', type: 'button', onclick: () => close(null) }, t('ui.cancel')),
          el('button', { class: 'btn btn-primary', type: 'button', onclick: () => close(input.value) }, okLabel),
        ),
      );
    }, (val) => resolve(val && String(val).trim() ? String(val).trim() : null));
    queueMicrotask(() => { input?.focus(); input?.select(); });
  });
}

function confirmModal(message, okLabel = t('ui.delete')) {
  return new Promise((resolve) => {
    openModal('⚠️', (close) => el('div', {},
      el('p', { style: 'margin-top:0' }, message),
      el('div', { style: 'display:flex;gap:10px;justify-content:flex-end' },
        el('button', { class: 'btn', type: 'button', onclick: () => close(false) }, t('ui.cancel')),
        el('button', { class: 'btn btn-red', type: 'button', onclick: () => close(true) }, okLabel),
      ),
    ), (val) => resolve(!!val));
  });
}

export function openPacks() {
  const app = document.getElementById('app');
  app.innerHTML = '';

  // ---------- Upload-Dropzone ----------
  const dropzone = el('div', { class: 'dropzone', role: 'button', tabindex: 0 },
    '🖼️ ' + t('pakete.drop'),
  );
  const dzInput = el('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true });
  const packSelect = el('select', { 'aria-label': 'Paket' });
  const sharedCheck = el('input', { type: 'checkbox', checked: ServerAPI.available ? 'checked' : false, disabled: !ServerAPI.available });

  async function handleFiles(files) {
    if (!files?.length) return;
    const packs = await Packs.allPacks();
    if (!packs.length) { toast('Erst ein Paket anlegen …'); return; }
    const packId = packSelect.value || packs[0].id;
    const shared = !!sharedCheck.checked && ServerAPI.available;
    const res = await Packs.uploadFiles([...files], packId, { shared });
    toast(`${res.length} Bild(er) hochgeladen 🎉`);
    render();
  }

  dropzone.addEventListener('click', () => dzInput.click());
  dropzone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') dzInput.click(); });
  ['dragover', 'dragenter'].forEach((ev) => dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach((ev) => dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.remove('drag'); }));
  dropzone.addEventListener('drop', (e) => handleFiles(e.dataTransfer.files));
  dzInput.addEventListener('change', () => handleFiles(dzInput.files));

  // ---------- Aktionen ----------
  async function newPack() {
    const name = await promptModal({ title: t('pakete.newPack'), placeholder: t('pakete.namePlaceholder') });
    if (!name) return;
    await Packs.createPack(name);
    render();
  }
  async function renamePack(pack) {
    const name = await promptModal({ title: t('pakete.rename'), value: pack.name, okLabel: t('ui.save') });
    if (!name) return;
    pack.name = name;
    await Packs.updatePack(pack);
    render();
  }
  async function deletePack(pack) {
    if (!(await confirmModal(t('pakete.confirmDelPack')))) return;
    await Packs.deletePack(pack.id);
    render();
  }
  async function removeTemplate(id, pack) {
    if (!(await confirmModal(t('pakete.confirmDelTpl')))) return;
    await Packs.removeTemplateFromPack(id);
    render();
  }
  async function useTemplate(tpl) {
    location.hash = `#/studio?template=${encodeURIComponent(tpl.id)}`;
  }

  // ---------- Render ----------
  const listWrap = el('div', { class: 'pack-grid' });
  const serverWrap = el('section');

  // ---------- Account (optional – nur mit Server) ----------
  function accountSection(meInfo) {
    const card = el('div', { class: 'card account' }, el('h2', {}, '👤 ' + t('account.title')));
    if (!ServerAPI.available) { card.append(el('p', { style: 'color:var(--muted)' }, t('account.needserver'))); return card; }
    if (!meInfo) {
      const email = el('input', { type: 'email', name: 'email', autocomplete: 'email', spellcheck: false, placeholder: 'you@example.com…' });
      const pw = el('input', { type: 'password', name: 'password', autocomplete: 'new-password', minlength: 8 });
      const act = async (fn) => { try { await fn.call(ServerAPI, email.value.trim(), pw.value); render(); } catch (e) { toast('⚠️ ' + e.message); } };
      card.append(
        el('p', { style: 'color:var(--muted)' }, t('account.lead')),
        el('div', { class: 'fieldrow' },
          el('div', { class: 'grow' }, el('label', {}, t('account.email')), email),
          el('div', { class: 'grow' }, el('label', {}, t('account.password')), pw),
        ),
        el('div', { style: 'display:flex;gap:10px;flex-wrap:wrap' },
          el('button', { class: 'btn btn-primary', type: 'button', onclick: () => act(ServerAPI.register) }, t('account.register')),
          el('button', { class: 'btn', type: 'button', onclick: () => act(ServerAPI.login) }, t('account.login')),
        ),
      );
    } else {
      const pct = Math.min(100, Math.round((meInfo.used / meInfo.quota) * 100));
      const mb = (n) => (n / (1024 * 1024)).toFixed(n < 1048576 ? 1 : 0);
      card.append(
        el('p', {}, t('account.who', { email: meInfo.user.email })),
        el('div', { class: 'quota' },
          el('div', { class: 'quota-track', role: 'meter', 'aria-valuemin': 0, 'aria-valuemax': meInfo.quota, 'aria-valuenow': meInfo.used, 'aria-label': t('account.quota', { used: mb(meInfo.used), max: mb(meInfo.quota) }) },
            el('i', { style: `width:${pct}%` }),
          ),
          el('span', {}, t('account.quota', { used: mb(meInfo.used), max: mb(meInfo.quota) })),
        ),
        el('div', { style: 'display:flex;gap:10px;flex-wrap:wrap' },
          el('button', { class: 'btn btn-red', type: 'button', onclick: async () => { await ServerAPI.logout(); render(); } }, t('account.logout')),
        ),
      );
    }
    return card;
  }

  async function render() {
    let meInfo = null;
    if (ServerAPI.available) { try { meInfo = await ServerAPI.me(); } catch {} }
    const packs = await Packs.allPacks();
    packSelect.innerHTML = '';
    for (const p of packs) packSelect.append(el('option', { value: p.id }, p.name));

    listWrap.innerHTML = '';
    for (const p of packs) {
      const tpls = await Packs.templatesInPack(p.id);
      const thumbs = tpls.map((tpl) => {
        const img = el('img', { alt: tpl.name });
        img.src = URL.createObjectURL(tpl.blob);
        const open = () => useTemplate(tpl);
        return el('div', {
          class: 'pack-thumb', title: t('pakete.edit'), role: 'button', tabindex: 0,
          onclick: open,
          onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } },
        },
          img,
          tpl.builtin ? null : el('button', { type: 'button', title: t('pakete.delTpl'), onclick: (e) => { e.stopPropagation(); removeTemplate(tpl.id, p); } }, '🗑'),
          el('button', { class: 'edit', type: 'button', title: t('pakete.edit'), onclick: (e) => { e.stopPropagation(); open(); } }, '✏️'),
        );
      });
      listWrap.append(
        el('article', { class: 'card pack-card' },
          el('div', { class: 'pack-head' },
            el('h3', {}, p.name, p.builtin ? el('span', { class: 'sticker', style: 'margin-left:8px' }, 'Built-in') : null),
            el('span', { style: 'font-weight:700;color:var(--muted);font-size:0.85rem;white-space:nowrap' }, `${tpls.length} ×`),
          ),
          tpls.length
            ? el('div', { class: 'pack-thumbs' }, ...thumbs)
            : el('p', { style: 'color:var(--muted)' }, t('pakete.empty')),
          el('div', { class: 'pack-actions' },
            el('button', { class: 'btn btn-sm btn-primary', onclick: async () => { dzInput.value = ''; const before = packSelect.value; packSelect.value = p.id; dzInput.click(); } }, '＋ ' + t('pakete.addImages')),
            p.builtin ? null : el('button', { class: 'btn btn-sm', onclick: () => renamePack(p) }, t('pakete.rename')),
            p.builtin ? null : el('button', { class: 'btn btn-sm btn-red', onclick: () => deletePack(p) }, t('pakete.delete')),
          ),
        ),
      );
    }

    // Server-Bestand
    serverWrap.innerHTML = '';
    if (ServerAPI.available) {
      let items = [];
      try { items = await ServerAPI.library(); } catch { items = []; }
      if (items.length) {
        serverWrap.append(
          el('section', { style: 'padding-top:30px' },
            el('h2', {}, '🌐 ' + t('pakete.serverTitle')),
            el('p', { style: 'color:var(--muted);max-width:70ch' }, t('pakete.serverLead')),
            meInfo ? null : el('p', { style: 'color:var(--muted);max-width:70ch' }, t('vote.hint')),
            el('div', { class: 'server-list' },
              ...items.map((s) => {
                const img = el('img', { alt: s.name, loading: 'lazy' });
                img.src = ServerAPI.url(s.id);
                const n = s.votes.length;
                const voted = !!(meInfo && s.votes.includes(meInfo.user.id));
                const voteBtn = s.own ? null : el('button', { class: 'btn btn-sm vote', type: 'button', disabled: !meInfo, 'aria-pressed': String(voted), title: voted ? t('vote.undo') : t('vote.btn') }, '▲ ' + n);
                if (voteBtn) {
                  voteBtn.addEventListener('click', async () => {
                    try {
                      const d = await ServerAPI.vote(s.id);
                      const now = !voted;
                      voteBtn.setAttribute('aria-pressed', String(now));
                      voteBtn.title = now ? t('vote.undo') : t('vote.btn');
                      voteBtn.textContent = '▲ ' + d.votes;
                    } catch (e) { toast('⚠️ ' + e.message); }
                  });
                }
                return el('div', { class: 'server-tpl' },
                  img,
                  el('div', { style: 'padding:8px 10px;display:flex;justify-content:space-between;gap:6px;align-items:center;font-weight:700;font-size:0.85rem' },
                    s.name.slice(0, 24),
                    s.own ? el('span', { class: 'badge-own' }, t('pakete.own')) : null,
                    voteBtn,
                    el('button', { class: 'btn btn-icon btn-sm', title: 'Lokal entfernen', onclick: async () => { try { await ServerAPI.remove(s.id); render(); } catch { toast('⚠️ Server nicht erreichbar'); } } }, '✕'),
                  ),
                );
              }),
            ),
          ),
        );
      }
    }

    app.replaceChildren(
      el('div', { class: 'wrap' },
        el('h1', {}, t('pakete.title')),
        el('p', { style: 'color:var(--muted);max-width:70ch' }, t('pakete.lead')),
        accountSection(meInfo),
        el('div', { class: 'card', style: 'margin-bottom:8px' },
          el('div', { class: 'fieldrow' },
            el('div', { class: 'grow' }, el('label', {}, 'Ziel-Paket'), packSelect),
            el('label', { style: 'display:flex;gap:8px;align-items:center;margin:0;color:' + (ServerAPI.available ? '' : 'var(--muted)') }, sharedCheck, t('pakete.uploadShared')),
            el('button', { class: 'btn btn-primary', onclick: newPack }, '＋ ' + t('pakete.newPack')),
          ),
          dropzone, dzInput,
        ),
        listWrap,
        serverWrap,
      ),
    );
    applyI18n(app);
  }

  render();
}
