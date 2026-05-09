/* eslint-disable no-undef */
/*
 * ePoint.az ↔ Tilda integration
 * Hosting: served from your Vercel deployment as /tilda-epoint.js
 * Inject on the Tilda page via T123 (HTML block):
 *   <script>window.EPOINT_API_BASE = 'https://your-project.vercel.app';</script>
 *   <script src="https://your-project.vercel.app/tilda-epoint.js" defer></script>
 *
 * What it does:
 *   - Hooks the standard Tilda cart checkout button (.t706__order-button)
 *   - Reads cart data from window.tcart (products, total, customer fields)
 *   - Sends a server request to /api/create-payment
 *   - Redirects the browser to the ePoint payment page
 */

(function () {
  'use strict';

  var DEFAULT_BASE = 'https://epoint-tilda.vercel.app';
  var API_BASE = (window.EPOINT_API_BASE || DEFAULT_BASE).replace(/\/+$/, '');
  var CREATE_PAYMENT_URL = API_BASE + '/api/create-payment';

  function log() {
    if (window.EPOINT_DEBUG) {
      try {
        console.log.apply(console, ['[epoint-tilda]'].concat([].slice.call(arguments)));
      } catch (_) {}
    }
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

  function readCustomerFromForm(form) {
    var data = { name: '', email: '', phone: '' };
    if (!form) return data;
    try {
      var inputs = form.querySelectorAll('input, textarea, select');
      for (var i = 0; i < inputs.length; i++) {
        var el = inputs[i];
        var name = (el.getAttribute('name') || '').toLowerCase();
        var type = (el.getAttribute('type') || '').toLowerCase();
        var value = (el.value || '').trim();
        if (!value) continue;
        if (!data.email && (type === 'email' || /email/.test(name))) data.email = value;
        else if (!data.phone && (type === 'tel' || /phone|tel/.test(name))) data.phone = value;
        else if (!data.name && /name|имя|ad/.test(name)) data.name = value;
      }
    } catch (e) {
      log('form read error', e);
    }
    return data;
  }

  function buildOrderId() {
    var rand = Math.random().toString(36).slice(2, 8).toUpperCase();
    return 'TILDA-' + Date.now() + '-' + rand;
  }

  function buildDescription(cart) {
    if (!cart || !Array.isArray(cart.products) || !cart.products.length) {
      return 'Заказ you-lush.com';
    }
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
    var raw =
      cart.prodamount ||
      cart.amount ||
      (cart.amount && cart.amount.total) ||
      0;
    var n = Number(String(raw).replace(/[^0-9.,-]/g, '').replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  function showError(msg) {
    try {
      alert(msg);
    } catch (_) {}
  }

  async function startPayment(triggerEl) {
    var form = triggerEl ? triggerEl.closest('form') : null;
    var cart = getTildaCart();

    if (!cart || !Array.isArray(cart.products) || !cart.products.length) {
      showError('Корзина пуста.');
      return;
    }

    var amount = getCartAmount(cart);
    if (!amount || amount <= 0) {
      showError('Не удалось определить сумму заказа.');
      return;
    }

    var customer = readCustomerFromForm(form);
    var orderId = buildOrderId();
    var description = buildDescription(cart);

    var payload = {
      amount: amount,
      order_id: orderId,
      description: description,
      customer_name: customer.name,
      customer_email: customer.email,
      customer_phone: customer.phone,
      cart: cart.products.map(function (p) {
        return {
          name: p.name,
          quantity: p.quantity,
          amount: p.amount,
          price: p.price,
        };
      }),
    };

    log('payload', payload);

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

  function bind() {
    document.addEventListener(
      'click',
      function (event) {
        var el = event.target.closest('.t706__order-button, [data-epoint-pay]');
        if (!el) return;

        event.preventDefault();
        event.stopPropagation();
        startPayment(el);
      },
      true
    );
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }

  window.epointTilda = { startPayment: startPayment, getTildaCart: getTildaCart };
})();
