// ============ Pakete-Seite ============
import { el, t, toast } from './lib.js';
import { Packs, ServerAPI } from './packs.js';

// Eigene Styles, ohne styles.css anzufassen (index.html bleibt unverändert).
if (!document.querySelector('link[href="css/packs.css"]')) {
  document.head.append(el('link', { rel: 'stylesheet', href: 'css/packs.css' }));
}

const PAGE_SIZE = 60;
let thumbUrls = [];

function revokeThumbs() {
  for (const url of thumbUrls) URL.revokeObjectURL(url);
  thumbUrls = [];
}

// Verlässt man die Pakete-Seite, hängen sonst alle Thumbnail-Blobs im Speicher.
window.addEventListener('hashchange', () => {
  if (!location.hash.startsWith('#/pakete')) revokeThumbs();
});

// ---------- Modale (statt prompt/confirm) ----------
function openModal(title, buildBody, onClose) {
  const body = el('div', { class: 'modal-body' });
  const titleId = 'modal-title-' + Math.random().toString(36).slice(2, 8);
  const closeBtn = el('button', { class: 'btn btn-icon btn-sm', type: 'button', 'aria-label': t('ui.close') }, '✕');
  const modal = el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
    el('div', { class: 'modal-head' }, el('h3', { id: titleId, style: 'margin:0' }, title), closeBtn),
    body,
  );
  const backdrop = el('div', { class: 'modal-backdrop' }, modal);
  const close = (val) => {
    document.removeEventListener('keydown', onKey);
    backdrop.remove();
    onClose(val);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(null); };
  closeBtn.addEventListener('click', () => close(null));
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(null); });
  backdrop.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const focusables = [...modal.querySelectorAll('button, input, select, textarea, a[href]')]
      .filter((n) => !n.disabled && n.getClientRects().length);
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  document.addEventListener('keydown', onKey);
  document.body.append(backdrop);
  body.append(buildBody(close));
  queueMicrotask(() => modal.querySelector('button, input, select, textarea')?.focus());
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
  revokeThumbs();
  const app = document.getElementById('app');
  app.innerHTML = '';

  const state = { q: '', limit: PAGE_SIZE };
  let packs = [];
  let templatesById = new Map();
  let serverItems = [];
  let meInfo = null;
  let uploading = false;
  let ready = false;
  let serverErrorShown = false;

  // ---------- Upload ----------
  const dropzone = el('div', { class: 'dropzone', role: 'button', tabindex: 0 },
    '🖼️ ' + t('pakete.drop'),
  );
  const dzInput = el('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true });
  const packSelect = el('select', { id: 'packs-target', 'aria-label': t('pakete.targetPack') });
  // Privatsphäre-Default: erst lokal speichern; Teilen muss bewusst angehakt werden.
  const sharedCheck = el('input', { type: 'checkbox', checked: false, disabled: !ServerAPI.available });
  const newPackBtn = el('button', { class: 'btn btn-primary', type: 'button', onclick: () => newPack() }, '＋ ' + t('pakete.newPack'));

  const uploadCard = el('div', { class: 'card packs-upload' },
    el('div', { class: 'fieldrow' },
      el('div', { class: 'grow' }, el('label', { for: 'packs-target' }, t('pakete.targetPack')), packSelect),
      el('label', { class: 'packs-shared' }, sharedCheck, el('span', {}, t('pakete.uploadShared'))),
      newPackBtn,
    ),
    dropzone, dzInput,
  );

  function setBusy(busy) {
    uploading = busy;
    dropzone.classList.toggle('busy', busy);
    dropzone.setAttribute('aria-busy', String(busy));
    dropzone.setAttribute('aria-disabled', String(busy));
    dropzone.tabIndex = busy ? -1 : 0;
    dzInput.disabled = busy;
    packSelect.disabled = busy;
    sharedCheck.disabled = busy || !ServerAPI.available;
    newPackBtn.disabled = busy;
    listWrap.querySelectorAll('[data-upload]').forEach((b) => { b.disabled = busy; });
  }

  async function handleFiles(fileList) {
    if (uploading || !ready) return;
    const files = [...fileList].filter((f) => !f.type || f.type.startsWith('image/'));
    if (!files.length) { toast('⚠️ ' + t('pakete.uploadNoImages')); return; }
    if (!packs.length) { toast('⚠️ ' + t('pakete.uploadNeedPack')); return; }
    const packId = packs.some((p) => p.id === packSelect.value) ? packSelect.value : packs[0].id;
    const shared = !!sharedCheck.checked && ServerAPI.available;

    setBusy(true);
    toast(t('pakete.uploading', { n: files.length }), 60000);
    try {
      const res = await Packs.uploadFiles(files, packId, { shared });
      if (res.failed?.length) toast('⚠️ ' + t('pakete.uploadSharedFailed', { n: res.failed.length }));
      else toast(t('pakete.uploaded', { n: res.length }));
    } catch (e) {
      console.error(e);
      toast('⚠️ ' + t('pakete.uploadFailed'));
    } finally {
      setBusy(false);
      dzInput.value = '';
      await refresh();
    }
  }

  const openPicker = () => { if (!uploading) dzInput.click(); };
  dropzone.addEventListener('click', openPicker);
  dropzone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPicker(); }
  });
  ['dragover', 'dragenter'].forEach((ev) => dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach((ev) => dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.remove('drag'); }));
  dropzone.addEventListener('drop', (e) => handleFiles(e.dataTransfer.files));
  dzInput.addEventListener('change', () => {
    const files = [...dzInput.files];
    dzInput.value = '';
    handleFiles(files);
  });

  // ---------- Aktionen ----------
  async function newPack() {
    const name = await promptModal({ title: t('pakete.newPack'), placeholder: t('pakete.namePlaceholder') });
    if (!name) return;
    await Packs.createPack(name);
    await refresh();
  }
  async function renamePack(pack) {
    const name = await promptModal({ title: t('pakete.rename'), value: pack.name, okLabel: t('ui.save') });
    if (!name) return;
    pack.name = name;
    await Packs.updatePack(pack);
    await refresh();
  }
  async function deletePack(pack) {
    if (!(await confirmModal(t('pakete.confirmDelPack')))) return;
    await Packs.deletePack(pack.id);
    await refresh();
  }
  async function removeTemplate(id) {
    if (!(await confirmModal(t('pakete.confirmDelTpl')))) return;
    await Packs.removeTemplateFromPack(id);
    await refresh();
  }
  function useTemplate(tpl) {
    location.hash = `#/studio?template=${encodeURIComponent(tpl.id)}`;
  }
  function useServerTemplate(item) {
    location.hash = `#/studio?template=${encodeURIComponent('srv:' + item.id)}`;
  }
  function pickFor(pack) {
    if (uploading) return;
    packSelect.value = pack.id;
    dzInput.value = '';
    dzInput.click();
  }

  // ---------- Suche & Zähler ----------
  const searchInput = el('input', {
    type: 'search', class: 'packs-search-input', id: 'packs-search',
    placeholder: t('pakete.search'), 'aria-label': t('pakete.searchLabel'),
    autocomplete: 'off', spellcheck: 'false',
  });
  const countsEl = el('p', { class: 'packs-count', 'aria-live': 'polite' });
  const toolbar = el('div', { class: 'packs-toolbar' },
    el('div', { class: 'packs-search' }, searchInput),
    countsEl,
  );

  let searchTimer = 0;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.q = searchInput.value.trim().toLowerCase();
      state.limit = PAGE_SIZE;
      drawPacks();
      drawServer();
    }, 120);
  });

  // ---------- Render ----------
  const listWrap = el('div', { class: 'pack-grid' });
  const serverWrap = el('section', { class: 'server-section' });
  const accountHost = el('div');

  // ---------- Account (optional – nur mit Server) ----------
  function accountSection(info) {
    const card = el('div', { class: 'card account' }, el('h2', {}, '👤 ' + t('account.title')));
    if (!ServerAPI.available) { card.append(el('p', { style: 'color:var(--muted)' }, t('account.needserver'))); return card; }
    if (!info) {
      const email = el('input', { type: 'email', name: 'email', id: 'account-email', autocomplete: 'email', spellcheck: false, placeholder: 'you@example.com…' });
      const pw = el('input', { type: 'password', name: 'password', id: 'account-password', autocomplete: 'new-password', minlength: 8 });
      const act = async (fn) => {
        try { await fn.call(ServerAPI, email.value.trim(), pw.value); refresh(); }
        catch (e) {
          const raw = String(e.message || e);
          const key = raw.includes('already registered') ? 'account.emailTaken'
            : raw.includes('wrong email') ? 'account.badLogin'
              : raw.includes('password too short') ? 'account.pwShort'
                : null;
          toast('⚠️ ' + (key ? t(key) : raw));
        }
      };
      card.append(
        el('p', { style: 'color:var(--muted)' }, t('account.lead')),
        el('div', { class: 'fieldrow' },
          el('div', { class: 'grow' }, el('label', { for: 'account-email' }, t('account.email')), email),
          el('div', { class: 'grow' }, el('label', { for: 'account-password' }, t('account.password')), pw),
        ),
        el('div', { style: 'display:flex;gap:10px;flex-wrap:wrap' },
          el('button', { class: 'btn btn-primary', type: 'button', onclick: () => act(ServerAPI.register) }, t('account.register')),
          el('button', { class: 'btn', type: 'button', onclick: () => act(ServerAPI.login) }, t('account.login')),
        ),
      );
    } else {
      const pct = Math.min(100, Math.round((info.used / info.quota) * 100));
      const mb = (n) => (n / (1024 * 1024)).toFixed(n < 1048576 ? 1 : 0);
      card.append(
        el('p', {}, t('account.who', { email: info.user.email })),
        el('div', { class: 'quota' },
          el('div', { class: 'quota-track', role: 'meter', 'aria-valuemin': 0, 'aria-valuemax': info.quota, 'aria-valuenow': info.used, 'aria-label': t('account.quota', { used: mb(info.used), max: mb(info.quota) }) },
            el('i', { style: `width:${pct}%` }),
          ),
          el('span', {}, t('account.quota', { used: mb(info.used), max: mb(info.quota) })),
        ),
        el('div', { style: 'display:flex;gap:10px;flex-wrap:wrap' },
          el('button', { class: 'btn btn-red', type: 'button', onclick: async () => { await ServerAPI.logout(); refresh(); } }, t('account.logout')),
        ),
      );
    }
    return card;
  }

  function packTemplates(pack) {
    return pack.tplIds.map((id) => templatesById.get(id)).filter(Boolean);
  }

  function matches(value, q) {
    return String(value || '').toLowerCase().includes(q);
  }

  function fillPackSelect() {
    const prev = packSelect.value;
    packSelect.replaceChildren(...packs.map((p) => el('option', { value: p.id }, p.name)));
    if (packs.some((p) => p.id === prev)) packSelect.value = prev;
  }

  function drawPacks() {
    revokeThumbs();
    listWrap.replaceChildren();
    const q = state.q;
    let visiblePacks = 0;

    for (const pack of packs) {
      const allTpls = packTemplates(pack);
      const packHit = !q || matches(pack.name, q);
      const tpls = packHit ? allTpls : allTpls.filter((tpl) => matches(tpl.name, q));
      if (q && !packHit && !tpls.length) continue;
      visiblePacks++;

      const thumbs = tpls.map((tpl) => {
        const img = el('img', { alt: tpl.name, loading: 'lazy' });
        const url = URL.createObjectURL(tpl.blob);
        thumbUrls.push(url);
        img.src = url;
        const open = () => useTemplate(tpl);
        return el('div', {
          class: 'pack-thumb', title: t('pakete.edit'), role: 'button', tabindex: 0,
          onclick: open,
          onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } },
        },
          img,
          el('button', { type: 'button', title: t('pakete.delTpl'), 'aria-label': t('pakete.delTpl'), onclick: (e) => { e.stopPropagation(); removeTemplate(tpl.id); } }, '🗑'),
          el('button', { class: 'edit', type: 'button', title: t('pakete.edit'), 'aria-label': t('pakete.edit'), onclick: (e) => { e.stopPropagation(); open(); } }, '✏️'),
        );
      });

      const countLabel = q && tpls.length !== allTpls.length
        ? `${tpls.length} / ${allTpls.length} ×`
        : `${allTpls.length} ×`;

      listWrap.append(
        el('article', { class: 'card pack-card' },
          el('div', { class: 'pack-head' },
            el('h3', {}, pack.name, pack.builtin ? el('span', { class: 'sticker', style: 'margin-left:8px' }, 'Built-in') : null),
            el('span', { class: 'pack-count' }, countLabel),
          ),
          tpls.length
            ? el('div', { class: 'pack-thumbs' }, ...thumbs)
            : el('p', { class: 'packs-sub' }, q
              ? t('pakete.noLocalResults', { q: searchInput.value.trim() })
              : t('pakete.empty')),
          el('div', { class: 'pack-actions' },
            el('button', { class: 'btn btn-sm btn-primary', type: 'button', 'data-upload': true, disabled: uploading, onclick: () => pickFor(pack) }, '＋ ' + t('pakete.addImages')),
            pack.builtin ? null : el('button', { class: 'btn btn-sm', type: 'button', onclick: () => renamePack(pack) }, t('pakete.rename')),
            pack.builtin ? null : el('button', { class: 'btn btn-sm btn-red', type: 'button', onclick: () => deletePack(pack) }, t('pakete.delete')),
          ),
        ),
      );
    }

    if (!visiblePacks) {
      const message = q && packs.length
        ? t('pakete.noLocalResults', { q: searchInput.value.trim() })
        : t('pakete.emptyAll');
      listWrap.append(el('div', { class: 'packs-empty' }, message));
    }
  }

  function serverHaystack(item) {
    const votes = Array.isArray(item.votes) ? item.votes.length : 0;
    return [item.name, item.id, item.mime, item.own ? 'own meins mine' : '', votes].join(' ').toLowerCase();
  }

  function serverCard(item) {
    const img = el('img', { alt: item.name, loading: 'lazy' });
    img.src = ServerAPI.url(item.id);
    const votes = Array.isArray(item.votes) ? item.votes : [];
    let voted = !!(meInfo && votes.includes(meInfo.user.id));

    let voteBtn = null;
    if (!item.own) {
      voteBtn = el('button', {
        class: 'btn btn-sm vote', type: 'button', disabled: !meInfo,
        'aria-pressed': String(voted), title: voted ? t('vote.undo') : t('vote.btn'),
      }, '▲ ' + votes.length);
      voteBtn.addEventListener('click', async () => {
        try {
          const d = await ServerAPI.vote(item.id);
          voted = !voted;
          voteBtn.setAttribute('aria-pressed', String(voted));
          voteBtn.title = voted ? t('vote.undo') : t('vote.btn');
          voteBtn.textContent = '▲ ' + d.votes;
        } catch (e) {
          console.error(e);
          toast('⚠️ ' + t('vote.failed'));
        }
      });
    }

    const removeBtn = item.own ? el('button', {
      class: 'btn btn-sm server-del', type: 'button',
      title: t('pakete.removeServer'), 'aria-label': t('pakete.removeServer'),
      onclick: async () => {
        if (!(await confirmModal(t('pakete.confirmDelTpl')))) return;
        try { await ServerAPI.remove(item.id); await refresh(); }
        catch (e) { console.error(e); toast('⚠️ ' + t('pakete.removeFailed')); }
      },
    }, '🗑') : null;

    return el('div', { class: 'server-tpl' },
      el('button', {
        class: 'server-open', type: 'button',
        title: t('pakete.use'), 'aria-label': t('pakete.use') + ': ' + item.name,
        onclick: () => useServerTemplate(item),
      }, img),
      el('div', { class: 'server-meta' },
        el('div', { class: 'server-name', title: item.name },
          el('span', { class: 'server-name-text' }, item.name),
          item.own ? el('span', { class: 'badge-own' }, t('pakete.own')) : null,
        ),
        (voteBtn || removeBtn)
          ? el('div', { class: 'server-actions' }, voteBtn, removeBtn)
          : null,
      ),
    );
  }

  function drawServer() {
    serverWrap.replaceChildren();
    if (!ServerAPI.available) return;

    const q = state.q;
    const filtered = q ? serverItems.filter((item) => serverHaystack(item).includes(q)) : serverItems;
    const nodes = [
      el('div', { class: 'server-head' },
        el('h2', {}, '🌐 ' + t('pakete.serverTitle')),
        el('span', { class: 'server-count' }, t('pakete.serverCount', { n: filtered.length })),
      ),
      el('p', { class: 'packs-sub' }, t('pakete.serverLead')),
      meInfo ? null : el('p', { class: 'packs-sub' }, t('vote.hint')),
    ];

    if (!filtered.length) {
      nodes.push(el('div', { class: 'packs-empty' },
        q ? t('pakete.noServerResults', { q: searchInput.value.trim() }) : t('pakete.serverEmpty'),
      ));
    } else {
      const visible = filtered.slice(0, state.limit);
      nodes.push(el('div', { class: 'server-list' }, ...visible.map(serverCard)));
      if (filtered.length > visible.length) {
        nodes.push(el('div', { class: 'packs-more' },
          el('button', { class: 'btn btn-sm', type: 'button', onclick: () => { state.limit += PAGE_SIZE; drawServer(); } }, t('pakete.loadMore')),
          el('small', {}, t('pakete.showing', { shown: visible.length, total: filtered.length })),
        ));
      }
    }
    serverWrap.append(...nodes.filter(Boolean));
  }

  function updateCounts() {
    let templates = 0;
    for (const pack of packs) templates += packTemplates(pack).length;
    let text = t('pakete.counts', { packs: packs.length, templates });
    if (ServerAPI.available) text += ' · ' + t('pakete.serverCount', { n: serverItems.length });
    countsEl.textContent = text;
  }

  async function refresh() {
    try {
      packs = await Packs.allPacks();
      const all = await Packs.allTemplates();
      templatesById = new Map(all.map((tpl) => [tpl.id, tpl]));
      meInfo = null;
      if (ServerAPI.available) {
        try { meInfo = await ServerAPI.me(); } catch {}
        try {
          serverItems = await ServerAPI.library();
          window.__serverTpls = serverItems;
        } catch (e) {
          console.error(e);
          serverItems = [];
          if (!serverErrorShown) {
            serverErrorShown = true;
            toast('⚠️ ' + t('pakete.serverError'));
          }
        }
      } else {
        serverItems = [];
      }
      ready = true;
    } catch (e) {
      console.error(e);
      toast('⚠️ ' + t('pakete.loadFailed'));
    }
    fillPackSelect();
    accountHost.replaceChildren(accountSection(meInfo));
    drawPacks();
    drawServer();
    updateCounts();
  }

  app.append(
    el('div', { class: 'wrap' },
      el('h1', {}, t('pakete.title')),
      el('p', { class: 'packs-lead' }, t('pakete.lead')),
      toolbar,
      accountHost,
      uploadCard,
      listWrap,
      serverWrap,
    ),
  );

  refresh();
}
