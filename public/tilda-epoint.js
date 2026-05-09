/* eslint-disable no-undef */

(function () {

  'use strict';

  var API_BASE = 'https://epoint-tilda.vercel.app';
  var CREATE_PAYMENT_URL = API_BASE + '/api/create-payment';

  function getCart() {

    try {

      if (window.tcart && Array.isArray(window.tcart.products)) {
        return window.tcart;
      }

      var raw = localStorage.getItem('tcart');

      if (!raw) return null;

      return JSON.parse(raw);

    } catch (e) {

      console.error(e);
      return null;

    }

  }

  function getAmount(cart) {

    var total = 0;

    if (!cart || !Array.isArray(cart.products)) {
      return 0;
    }

    cart.products.forEach(function (item) {

      total +=
        Number(item.price || 0) *
        Number(item.quantity || 1);

    });

    return Number(total.toFixed(2));

  }

  async function createPayment(button) {

    try {

      var cart = getCart();

      if (!cart || !cart.products || !cart.products.length) {
        alert('Корзина пуста');
        return;
      }

      var amount = getAmount(cart);

      var payload = {

        amount: amount,

        order_id: 'ORDER-' + Date.now(),

        description: 'YouLush order',

        cart: cart.products.map(function (p) {

          return {
            name: p.name,
            quantity: p.quantity,
            price: p.price
          };

        })

      };

      console.log('PAYLOAD', payload);

      button.disabled = true;
      button.innerHTML = 'Переход к оплате...';

      var response = await fetch(CREATE_PAYMENT_URL, {

        method: 'POST',

        headers: {
          'Content-Type': 'application/json'
        },

        body: JSON.stringify(payload)

      });

      var data = await response.json();

      console.log('RESPONSE', data);

      if (
        data &&
        data.success &&
        data.redirect_url
      ) {

        window.location.href = data.redirect_url;
        return;

      }

      alert(data.error || 'Ошибка оплаты');

    } catch (e) {

      console.error(e);

      alert('Ошибка подключения');

    } finally {

      button.disabled = false;
      button.innerHTML = 'Checkout';

    }

  }

  function interceptCheckout() {

    document.body.addEventListener(
      'click',
      function (event) {

        var button = event.target.closest(
          '.t706__cartwin-prodamount-btn'
        );

        if (!button) return;

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        console.log('CHECKOUT INTERCEPTED');

        createPayment(button);

        return false;

      },
      true
    );

  }

  if (document.readyState === 'loading') {

    document.addEventListener(
      'DOMContentLoaded',
      interceptCheckout
    );

  } else {

    interceptCheckout();

  }

})();
