/* eslint-disable no-undef */

(function () {

  'use strict';

  var API_BASE = 'https://epoint-tilda.vercel.app';

  async function createPayment(button) {

    try {

      var cart = window.tcart;

      if (!cart || !cart.products || !cart.products.length) {
        alert('Корзина пуста');
        return;
      }

      var amount = 0;

      cart.products.forEach(function (item) {

        amount +=
          Number(item.price || 0) *
          Number(item.quantity || 1);

      });

      var payload = {

        amount: Number(amount.toFixed(2)),

        order_id: 'ORDER-' + Date.now(),

        description: 'YouLush Order',

        cart: cart.products.map(function (p) {

          return {
            name: p.name,
            quantity: p.quantity,
            price: p.price
          };

        })

      };

      console.log('PAYMENT PAYLOAD', payload);

      button.disabled = true;

      button.innerHTML = 'Redirecting...';

      var response = await fetch(
        API_BASE + '/api/create-payment',
        {

          method: 'POST',

          headers: {
            'Content-Type': 'application/json'
          },

          body: JSON.stringify(payload)

        }
      );

      var data = await response.json();

      console.log('PAYMENT RESPONSE', data);

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

    }

  }

  function bindCheckout() {

    document.addEventListener(
      'click',
      function (event) {

        var button = event.target.closest(
          '.t-submit.t-btnflex'
        );

        if (!button) return;

        console.log('CHECKOUT CLICK');

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        createPayment(button);

        return false;

      },
      true
    );

  }

  if (document.readyState === 'loading') {

    document.addEventListener(
      'DOMContentLoaded',
      bindCheckout
    );

  } else {

    bindCheckout();

  }

})();
