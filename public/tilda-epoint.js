/* eslint-disable no-undef */

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
      if (window.tcart && Array.isArray(window.tcart.products)) {
        return window.tcart;
      }

      var raw = localStorage.getItem('tcart');

      if (!raw) return null;

      var parsed = JSON.parse(raw);

      if (parsed && Array.isArray(parsed.products)) {
        return parsed;
      }

      return null;
    } catch (e) {
      log('cart parse error', e);
      return null;
    }
  }

  function readCustomerFromForm(form) {
    var data = {
      name: '',
      email: '',
      phone: '',
    };

    try {
      var root = form || document;

      var inputs = root.querySelectorAll('input, textarea, select');

      for (var i = 0; i < inputs.length; i++) {
        var el = inputs[i];

        var name = (el.getAttribute('name') || '').toLowerCase();
        var placeholder = (el.getAttribute('placeholder') || '').toLowerCase();
        var type = (el.getAttribute('type') || '').toLowerCase();

        var value = (el.value || '').trim();

        if (!value) continue;

        if (
          !data.email &&
          (type === 'email' || /email|почта/.test(name + placeholder))
        ) {
          data.email = value;
        }

        else if (
          !data.phone &&
          (type === 'tel' || /phone|tel|телефон/.test(name + placeholder))
        ) {
          data.phone = value;
        }

        else if (
          !data.name &&
          /name|имя/.test(name + placeholder)
        ) {
          data.name = value;
        }
      }

    } catch (e) {
      log('form read error', e);
    }

    return data;
  }

  function buildOrderId() {
    return 'ORDER-' + Date.now();
  }

  function buildDescription(cart) {
    if (!cart || !Array.isArray(cart.products)) {
      return 'Заказ you-lush.com';
    }

    return cart.products
      .map(function (p) {
        return (p.name || 'Товар') + ' x' + (p.quantity || 1);
      })
      .join(', ')
      .slice(0, 480);
  }

  function getCartAmount(cart) {
    if (!cart) return 0;

    var total = 0;

    if (Array.isArray(cart.products)) {

      cart.products.forEach(function (p) {

        var price = Number(p.price || p.amount || 0);
        var qty = Number(p.quantity || 1);

        total += price * qty;

      });

    }

    return Number(total.toFixed(2));
  }

  function showError(message) {
    alert(message);
  }

  async function startPayment(triggerEl) {

    var cart = getTildaCart();

    log('cart', cart);

    if (!cart || !Array.isArray(cart.products) || !cart.products.length) {
      showError('Корзина пуста');
      return;
    }

    var amount = getCartAmount(cart);

    if (!amount || amount <= 0) {
      showError('Ошибка суммы заказа');
      return;
    }

    var customer = readCustomerFromForm(document);

    var payload = {

      amount: amount,

      order_id: buildOrderId(),

      description: buildDescription(cart),

      customer_name: customer.name,

      customer_email: customer.email,

      customer_phone: customer.phone,

      cart: cart.products.map(function (p) {

        return {
          name: p.name,
          quantity: p.quantity,
          price: p.price,
        };

      }),

    };

    log('payload', payload);

    try {

      if (triggerEl) {

        triggerEl.disabled = true;

        if (!triggerEl.dataset.originalText) {
          triggerEl.dataset.originalText = triggerEl.innerHTML;
        }

        triggerEl.innerHTML = 'Переход к оплате...';

      }

      var response = await fetch(CREATE_PAYMENT_URL, {

        method: 'POST',

        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },

        body: JSON.stringify(payload),

      });

      var data = await response.json();

      log('response', data);

      if (
        response.ok &&
        data &&
        data.success &&
        data.redirect_url
      ) {

        window.location.href = data.redirect_url;
        return;

      }

      showError(
        (data && data.error)
          ? data.error
          : 'Ошибка создания платежа'
      );

    } catch (error) {

      console.error(error);

      showError('Ошибка подключения к оплате');

    } finally {

      if (triggerEl) {

        triggerEl.disabled = false;

        if (triggerEl.dataset.originalText) {
          triggerEl.innerHTML = triggerEl.dataset.originalText;
        }

      }

    }

  }

  function bindCheckoutButtons() {

    document.addEventListener(
      'click',
      function (event) {

        var button = event.target.closest(
          '.t706__cartwin-prodamount-btn, .t706__order-button, [data-epoint-pay]'
        );

        if (!button) return;

        log('checkout click detected');

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        startPayment(button);

        return false;

      },
      true
    );

    log('checkout binding active');

  }

  if (document.readyState === 'loading') {

    document.addEventListener(
      'DOMContentLoaded',
      bindCheckoutButtons
    );

  } else {

    bindCheckoutButtons();

  }

  window.epointTilda = {
    startPayment: startPayment,
  };

})();
