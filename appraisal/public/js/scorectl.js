/* =============================================================
   Score control — fast, mobile-friendly criterion score entry
   with automatic capping. The value can NEVER exceed the
   criterion weight (max): a slider that physically can't pass the
   max, big +/- steppers for one-tap entry, and a numeric field
   that clamps live (typing 11 when max is 10 becomes 10).
   ============================================================= */
(function () {
  function clampInt(v, max) {
    var n = Math.floor(Number(v));
    if (!isFinite(n)) return null;
    return Math.max(0, Math.min(max, n));
  }

  // Returns the HTML for one control. `value` may be '' / null (empty).
  function html(key, weight, value) {
    var has = !(value === undefined || value === null || value === '');
    var v = has ? clampInt(value, weight) : '';
    return '' +
      '<div class="score-ctl" data-key="' + key + '" data-max="' + weight + '">' +
        '<button type="button" class="sc-btn sc-dec" tabindex="-1" aria-label="-">−</button>' +
        '<input type="range" class="sc-range" min="0" max="' + weight + '" step="1" value="' + (v === '' ? 0 : v) + '">' +
        '<input type="number" class="sc-num" inputmode="numeric" pattern="[0-9]*" min="0" max="' + weight + '" step="1" value="' + v + '" placeholder="0">' +
        '<button type="button" class="sc-btn sc-inc" tabindex="-1" aria-label="+">+</button>' +
        '<span class="sc-max">/ ' + weight + '</span>' +
      '</div>';
  }

  // Wire every control under `root`. onChange(key, value|null) fires on change.
  function bind(root, onChange) {
    Array.prototype.forEach.call(root.querySelectorAll('.score-ctl'), function (ctl) {
      var key = ctl.getAttribute('data-key');
      var max = Number(ctl.getAttribute('data-max'));
      var range = ctl.querySelector('.sc-range');
      var num = ctl.querySelector('.sc-num');
      var dec = ctl.querySelector('.sc-dec');
      var inc = ctl.querySelector('.sc-inc');

      function apply(v, opts) {
        opts = opts || {};
        if (v === '' || v === null) {
          num.value = ''; range.value = 0; ctl.classList.remove('has-val');
          onChange(key, null); return;
        }
        var c = clampInt(v, max);
        if (c === null) { num.value = ''; range.value = 0; ctl.classList.remove('has-val'); onChange(key, null); return; }
        if (!opts.keepNum) num.value = String(c);
        range.value = String(c);
        ctl.classList.add('has-val');
        onChange(key, c);
      }

      range.addEventListener('input', function () { apply(range.value); });
      num.addEventListener('input', function () {
        if (num.value === '') { apply(''); return; }
        var c = clampInt(num.value, max);
        // reflect the cap immediately so the user sees 10, not 11
        if (String(c) !== num.value) num.value = String(c);
        apply(c);
      });
      num.addEventListener('blur', function () { if (num.value !== '') apply(clampInt(num.value, max)); });
      dec.addEventListener('click', function () { var cur = num.value === '' ? 0 : clampInt(num.value, max); apply(Math.max(0, cur - 1)); });
      inc.addEventListener('click', function () { var cur = num.value === '' ? 0 : clampInt(num.value, max); apply(Math.min(max, cur + 1)); });
      if (num.value !== '') ctl.classList.add('has-val');
    });
  }

  window.ScoreCtl = { html: html, bind: bind, clamp: clampInt };
})();
