/* =============================================================
   Shared electronic-signature pads (used by the admin appraisal
   form AND the manager evaluation-link page).

   Each signatory can either DRAW a signature (mouse / finger) or
   UPLOAD an image of their signature — both land in the same
   signature box. Signatures are downscaled and stored as a small
   PNG data URL inside the appraisal record (a few KB each), so the
   database stays light and the site never hangs.

   A live status shows who has signed and who is still pending,
   e.g. "بانتظار توقيع: المدير المباشر، مدير الفندق".

   Public API (window.SigPad):
     card({ signatories, signatures, t, lang })  -> HTML string
     init(root, signatures, onChange)            -> wire pads in `root`
     statusHTML({ signatories, signatures, lang })
     pending(signatories, signatures)            -> [signatory,…] not yet signed
   ============================================================= */
(function () {
  const MAXW = 500; // stored signature max width in px (keeps each image small)
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // Downscale any PNG/JPEG data URL to a compact signature image.
  function shrink(dataUrl, cb) {
    try {
      const im = new Image();
      im.onload = function () {
        let w = im.width, h = im.height;
        if (!w || !h) return cb(dataUrl);
        if (w > MAXW) { h = Math.round(h * MAXW / w); w = MAXW; }
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(im, 0, 0, w, h);
        cb(c.toDataURL('image/png'));
      };
      im.onerror = function () { cb(dataUrl); };
      im.src = dataUrl;
    } catch (e) { cb(dataUrl); }
  }

  // Draw a stored signature image (drawn or uploaded) into a pad canvas,
  // fitted and centered so it appears in the same signature box.
  function paint(canvas, dataUrl) {
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const im = new Image();
    im.onload = function () {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const cw = rect.width, ch = rect.height;
      const scale = Math.min(cw / im.width, ch / im.height);
      const w = im.width * scale, h = im.height * scale;
      ctx.drawImage(im, (cw - w) / 2, (ch - h) / 2, w, h);
    };
    im.src = dataUrl;
  }

  const roleName = (sg, lang) => (lang === 'en' ? (sg.en || sg.ar) : (sg.ar || sg.en));

  function badge(sig, t) {
    const signed = sig && sig.img;
    const label = signed ? (t('sigSigned') || '✔ تم التوقيع') : (t('sigPending') || 'بانتظار التوقيع');
    return `<span class="sig-badge ${signed ? 'ok' : 'wait'}">${esc(label)}</span>`;
  }

  function card(opts) {
    const { signatories, signatures, t, lang } = opts;
    const pads = signatories.map((sg) => {
      const sig = (signatures || {})[sg.id] || {};
      return `<div class="sig-pad-card" data-sig-block="${sg.id}">
        <div class="sp-role">${esc(roleName(sg, lang))} <span class="ar">${esc(lang === 'en' ? sg.ar : sg.en)}</span>
          <span data-sig-badge="${sg.id}">${badge(sig, t)}</span></div>
        <div class="sig-canvas-wrap">
          <canvas class="sig-canvas" data-sig-canvas="${sg.id}"></canvas>
          <div class="sig-hint" data-sig-hint="${sg.id}" ${sig.img ? 'style="display:none"' : ''}>${esc(t('signHere'))}</div>
        </div>
        <div class="sig-pad-actions">
          <input data-sig-name="${sg.id}" value="${esc(sig.name || '')}" placeholder="${esc(t('signName'))}">
          <label class="btn btn-sm btn-outline sig-upload" title="${esc(t('sigUpload') || 'رفع صورة التوقيع')}">
            ${esc(t('sigUpload') || 'رفع صورة')}
            <input type="file" accept="image/*" data-sig-upload="${sg.id}" hidden>
          </label>
          <button type="button" class="btn btn-sm btn-outline" data-sig-clear="${sg.id}">${esc(t('clearSig'))}</button>
        </div>
      </div>`;
    }).join('');
    return `<div class="sig-pads">${pads}</div>`;
  }

  function init(root, signatures, onChange, t) {
    const tt = t || ((k) => k);
    const $$ = (s) => Array.from(root.querySelectorAll(s));
    const fire = () => { try { onChange && onChange(); } catch (e) {} };
    const setBadge = (id) => {
      const el = root.querySelector(`[data-sig-badge="${id}"]`);
      if (el) el.innerHTML = badge(signatures[id] || {}, tt);
    };

    $$('[data-sig-canvas]').forEach((canvas) => {
      const id = canvas.dataset.sigCanvas;
      const hint = root.querySelector(`[data-sig-hint="${id}"]`);
      const ctx = canvas.getContext('2d');

      function resize() {
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const prev = signatures[id] && signatures[id].img;
        canvas.width = Math.max(1, Math.round(rect.width * dpr));
        canvas.height = Math.max(1, Math.round(rect.height * dpr));
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = '#12211f';
        if (prev) paint(canvas, prev);
      }
      requestAnimationFrame(resize);

      let drawing = false, last = null, dirty = false;
      const pos = (e) => {
        const rect = canvas.getBoundingClientRect();
        const cx = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
        const cy = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
        return { x: cx, y: cy };
      };
      const start = (e) => { e.preventDefault(); drawing = true; dirty = true; last = pos(e); if (hint) hint.style.display = 'none'; };
      const move = (e) => {
        if (!drawing) return; e.preventDefault();
        const p = pos(e);
        ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke();
        last = p;
      };
      const end = () => {
        if (!drawing) return; drawing = false;
        if (!dirty) return;
        signatures[id] = signatures[id] || {};
        signatures[id].method = 'draw';
        shrink(canvas.toDataURL('image/png'), (url) => { signatures[id].img = url; setBadge(id); fire(); });
      };
      canvas.addEventListener('pointerdown', start);
      canvas.addEventListener('pointermove', move);
      window.addEventListener('pointerup', end);
      canvas.addEventListener('touchstart', start, { passive: false });
      canvas.addEventListener('touchmove', move, { passive: false });
      canvas.addEventListener('touchend', end);

      // Upload an image of the signature (compressed, dropped into the same box).
      const upload = root.querySelector(`[data-sig-upload="${id}"]`);
      if (upload) upload.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const r = new FileReader();
        r.onload = () => shrink(r.result, (url) => {
          signatures[id] = signatures[id] || {};
          signatures[id].img = url; signatures[id].method = 'upload';
          paint(canvas, url);
          if (hint) hint.style.display = 'none';
          setBadge(id); fire();
        });
        r.readAsDataURL(file);
        e.target.value = '';
      });

      const clearBtn = root.querySelector(`[data-sig-clear="${id}"]`);
      if (clearBtn) clearBtn.addEventListener('click', () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (signatures[id]) { signatures[id].img = ''; signatures[id].method = null; }
        if (hint) hint.style.display = 'flex';
        setBadge(id); fire();
      });

      const nameInp = root.querySelector(`[data-sig-name="${id}"]`);
      if (nameInp) nameInp.addEventListener('input', (e) => {
        signatures[id] = signatures[id] || {};
        signatures[id].name = e.target.value;
        fire();
      });
    });
  }

  function pending(signatories, signatures) {
    return signatories.filter((sg) => !((signatures || {})[sg.id] || {}).img);
  }

  function statusHTML(opts) {
    const { signatories, signatures, lang, t } = opts;
    const tt = t || ((k) => k);
    const left = pending(signatories, signatures);
    if (!left.length) {
      return `<div class="sig-status ok">${esc(tt('sigAllDone') || '✔ اكتملت جميع التواقيع')}</div>`;
    }
    const names = left.map((sg) => roleName(sg, lang)).join('، ');
    const label = (tt('sigWaitingFor') || 'بانتظار توقيع') + ': ' + names;
    return `<div class="sig-status wait">${esc(label)}</div>`;
  }

  window.SigPad = { card, init, pending, statusHTML, shrink };
})();
