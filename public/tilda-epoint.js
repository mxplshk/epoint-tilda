/* eslint-disable no-undef */
/*
 * ePoint.az ↔ Tilda integration (two-stage checkout)
 * Hosting: served from your Vercel deployment as /tilda-epoint.js
 * Inject on the Tilda page via T123 (HTML block):
 *   <script>window.EPOINT_API_BASE = 'https://your-project.vercel.app';</script>
 *   <script src="https://your-project.vercel.app/tilda-epoint.js" defer></script>
 *
 * Flow:
 *   1. User fills the cart form and clicks the standard Tilda button ("Далее").
 *      We DO NOT block this click — Tilda validates the form and sends the order
 *      to its own data receiver (CRM / email / Sheets) as usual.
 *   2. We snapshot the cart (amount + items) BEFORE Tilda clears it.
 *   3. Once the order is detected as submitted (cart emptied / success box),
 *      the order button turns into "Перейти к оплате" (and we also inject a
 *      fallback checkout button into the cart window).
 *   4. The second click goes to /api/create-payment and redirects to ePoint.
 */

(function () {
  'use strict';

  var DEFAULT_BASE = 'https://your-project.vercel.app';
  var API_BASE = (window.EPOINT_API_BASE || DEFAULT_BASE).replace(/\/+$/, '');
  var CREATE_PAYMENT_URL = API_BASE + '/api/create-payment';

  var CHECKOUT_LABEL = 'Перейти к оплате';
  var BTN_SELECTOR = '.t706__order-button, [data-epoint-pay]';
  var WATCH_TIMEOUT_MS = 20000;
  var WATCH_INTERVAL_MS = 400;

  var stage = 'cart'; // 'cart' -> waiting for Tilda submit | 'checkout' -> ready to pay
  var pendingSnapshot = null; // snapshot taken on the first click
  var lastOrder = null; // confirmed snapshot used for payment
  var watchTimer = null;
  var transformTimer = null;

  function log() {
    if (window.EPOINT_DEBUG) {
      try {
        console.log.apply(console, ['[epoint-tilda]'].concat([].slice.call(arguments)));
      } catch (_) {}
    }
  }

  function showError(msg) {
    try {
      alert(msg);
    } catch (_) {}
  }

  function getTildaCart() {
    try {
      if (window.tcart && Array.isArray(window.tcart.products)) return window.tcart;
      var raw = localStorage.getItem('tcart');
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.products)) return parsed;
      return null;
    } catch (e) {
      log('cart parse error', e);
      return null;
    }
  }

  function cartHasProducts(cart) {
    return !!(cart && Array.isArray(cart.products) && cart.products.length);
  }

  function buildOrderId() {
    var rand = Math.random().toString(36).slice(2, 8).toUpperCase();
    return 'TILDA-' + Date.now() + '-' + rand;
  }

  function buildDescription(cart) {
    if (!cartHasProducts(cart)) return 'Заказ you-lush.com';
    var titles = cart.products
      .map(function (p) {
        var qty = p.quantity ? ' x' + p.quantity : '';
        return (p.name || 'Товар') + qty;
      })
      .join(', ');
    return ('you-lush.com: ' + titles).slice(0, 480);
  }

  function getCartAmount(cart) {
    if (!cart) return 0;
    var raw = cart.prodamount || cart.amount || 0;
    var n = Number(String(raw).replace(/[^0-9.,-]/g, '').replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  function snapshotCart() {
    var cart = getTildaCart();
    if (!cartHasProducts(cart)) return null;
    var amount = getCartAmount(cart);
    if (!amount || amount <= 0) return null;
    return {
      amount: amount,
      orderId: buildOrderId(),
      description: buildDescription(cart),
      productCount: cart.products.length,
    };
  }

  /* ---- detect that Tilda has accepted the order ---- */

  function isOrderSubmitted() {
    // Tilda clears the cart after a successful order.
    var cart = getTildaCart();
    var emptied = !cartHasProducts(cart);

    // Belt-and-suspenders: Tilda success markers, if shown.
    var successBox = document.querySelector(
      '.t706__success, .t-form__successbox, .js-successbox'
    );
    var successVisible = !!(successBox && successBox.offsetParent !== null);

    return emptied || successVisible;
  }

  function startWatching() {
    if (watchTimer) clearInterval(watchTimer);
    var started = Date.now();
    watchTimer = setInterval(function () {
      if (isOrderSubmitted()) {
        clearInterval(watchTimer);
        watchTimer = null;
        onOrderSubmitted();
      } else if (Date.now() - started > WATCH_TIMEOUT_MS) {
        clearInterval(watchTimer);
        watchTimer = null;
        log('watch timeout — order submit not detected (form invalid?)');
      }
    }, WATCH_INTERVAL_MS);
  }

  function onOrderSubmitted() {
    if (!pendingSnapshot) {
      log('order submitted but no snapshot — cannot continue to payment');
      return;
    }
    lastOrder = pendingSnapshot;
    pendingSnapshot = null;
    stage = 'checkout';
    log('order submitted, switching to checkout stage', lastOrder);

    // Tilda may re-render the cart window — keep re-applying for a few seconds.
    transformCheckoutButtons();
    if (transformTimer) clearInterval(transformTimer);
    var started = Date.now();
    transformTimer = setInterval(function () {
      transformCheckoutButtons();
      if (Date.now() - started > 6000) {
        clearInterval(transformTimer);
        transformTimer = null;
      }
    }, 500);
  }

  /* ---- turn the UI into a "pay now" state ---- */

  function transformCheckoutButtons() {
    // 1. Repurpose the standard Tilda order button if it is still around.
    var orderBtn = document.querySelector('.t706__order-button');
    if (orderBtn) {
      if (orderBtn.getAttribute('data-epoint-stage') !== 'checkout') {
        orderBtn.setAttribute('data-epoint-stage', 'checkout');
        orderBtn.textContent = CHECKOUT_LABEL;
        orderBtn.removeAttribute('disabled');
      }
    }

    // 2. Inject a fallback checkout button into the cart window,
    //    in case Tilda hid the original button on success.
    if (!document.querySelector('[data-epoint-pay]')) {
      var container =
        document.querySelector('.t706__cartwin-content') ||
        document.querySelector('.t706__cartwin') ||
        document.body;
      if (container) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 't-btn epoint-checkout-btn';
        btn.setAttribute('data-epoint-pay', '1');
        btn.textContent = CHECKOUT_LABEL;
        btn.style.cssText =
          'display:block;width:100%;margin:16px 0 0;padding:14px 20px;' +
          'font-size:16px;cursor:pointer;border:none;border-radius:6px;' +
          'background:#000;color:#fff;';
        container.appendChild(btn);
        log('fallback checkout button injected');
      }
    }
  }

  /* ---- payment ---- */

  async function startPayment(triggerEl) {
    var order = lastOrder;
    if (!order || !order.amount || order.amount <= 0) {
      showError('Не удалось определить сумму заказа. Обновите страницу и повторите.');
      return;
    }

    var payload = {
      amount: order.amount,
      order_id: order.orderId,
      description: order.description,
    };
    log('create-payment payload', payload);

    if (triggerEl) {
      triggerEl.setAttribute('disabled', 'disabled');
      triggerEl.dataset.epointOrigText = triggerEl.textContent;
      triggerEl.textContent = 'Перенаправляем на оплату...';
    }

    try {
      var res = await fetch(CREATE_PAYMENT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });

      var data = await res.json().catch(function () {
        return null;
      });

      if (res.ok && data && data.success && data.redirect_url) {
        log('redirecting', data.redirect_url);
        window.location.href = data.redirect_url;
        return;
      }

      var msg = (data && data.error) || 'Не удалось создать платёж. Попробуйте ещё раз.';
      showError(msg);
      log('payment failure', data, res.status);
    } catch (e) {
      showError('Сетевая ошибка. Проверьте соединение и попробуйте ещё раз.');
      log('network error', e);
    } finally {
      if (triggerEl) {
        triggerEl.removeAttribute('disabled');
        if (triggerEl.dataset.epointOrigText) {
          triggerEl.textContent = triggerEl.dataset.epointOrigText;
        }
      }
    }
  }

  /* ---- click routing ---- */

  function onClick(event) {
    var el = event.target.closest(BTN_SELECTOR);
    if (!el) return;

    if (stage === 'checkout') {
      // Second stage: block Tilda's own handler, go to ePoint.
      event.preventDefault();
      event.stopImmediatePropagation();
      startPayment(el);
      return;
    }

    // First stage: do NOT block — let Tilda validate + submit the order.
    // Just snapshot the cart now (before Tilda clears it) and start watching.
    var snap = snapshotCart();
    if (snap) {
      pendingSnapshot = snap;
      log('cart snapshot taken', snap);
      startWatching();
    } else {
      log('no valid cart snapshot — cart empty or amount unknown');
    }
    // intentionally no preventDefault / stopPropagation here
  }

  function bind() {
    // Capture phase so we run before Tilda's listener and can block it
    // on the checkout stage.
    document.addEventListener('click', onClick, true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }

  window.epointTilda = {
    startPayment: startPayment,
    getTildaCart: getTildaCart,
    getStage: function () {
      return stage;
    },
    getLastOrder: function () {
      return lastOrder;
    },
  };
})();
