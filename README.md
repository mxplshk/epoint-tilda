# ePoint.az ↔ Tilda — Production Integration for [you-lush.com](https://you-lush.com)

Production-ready интеграция платёжной системы **ePoint.az** с **Tilda** через **Vercel Serverless Functions**.

Endpoints:

- `POST /api/create-payment` — создаёт платёжную сессию в ePoint, возвращает `redirect_url`.
- `POST /api/callback` — принимает webhook от ePoint, проверяет подпись, логирует результат.
- `GET  /tilda-epoint.js` — статический клиентский скрипт, подключаемый на странице Tilda.

---

## Содержание

1. [Архитектура](#архитектура)
2. [Структура проекта](#структура-проекта)
3. [Установка](#установка)
4. [Локальный запуск](#локальный-запуск)
5. [Deploy на Vercel](#deploy-на-vercel)
6. [Environment variables](#environment-variables)
7. [Настройка ePoint](#настройка-epoint)
8. [Подключение к Tilda](#подключение-к-tilda)
9. [Test payment flow](#test-payment-flow)
10. [Логи Vercel](#логи-vercel)
11. [Безопасность](#безопасность)
12. [Troubleshooting](#troubleshooting)

---

## Архитектура

```
[Tilda you-lush.com]
       │  click .t706__order-button
       ▼
 tilda-epoint.js (читает window.tcart)
       │  POST { amount, order_id, cart, customer_* }
       ▼
[Vercel] /api/create-payment
       │  base64(json) + sha1 signature
       ▼
[ePoint] https://epoint.az/api/1/request
       │  → redirect_url
       ▼
Браузер пользователя ──► страница оплаты ePoint
                                   │
                ┌──────────────────┴──────────────────┐
                ▼                                     ▼
   SUCCESS_URL = /success                 ERROR_URL = /error
                ▲
                │ независимо от пользователя:
                │ webhook POST data + signature
[Vercel] /api/callback ── валидирует sha1, парсит base64, логирует
```

---

## Структура проекта

```
epoint-tilda/
├── api/
│   ├── create-payment.js     # POST /api/create-payment
│   └── callback.js           # POST /api/callback (webhook)
├── public/
│   └── tilda-epoint.js       # клиентский JS для встраивания на Tilda
├── .env.example
├── .gitignore
├── package.json
├── vercel.json
└── README.md
```

---

## Установка

```bash
git clone <ваш-репозиторий> epoint-tilda
cd epoint-tilda
npm install
cp .env.example .env
```

Отредактируйте `.env`.

Требования:

- Node.js **18+**
- Vercel CLI: `npm i -g vercel`
- Аккаунт на [Vercel](https://vercel.com) и [ePoint.az](https://epoint.az)

---

## Локальный запуск

```bash
vercel dev
```

Сервер поднимется на `http://localhost:3000`.

Smoke-test:

```bash
curl -X POST http://localhost:3000/api/create-payment \
  -H "Content-Type: application/json" \
  -d '{"amount": 1.00, "order_id": "TEST-1", "description": "Local test"}'
```

Ожидаемый ответ:

```json
{
  "success": true,
  "redirect_url": "https://epoint.az/redirect/te_...",
  "transaction": "te_...",
  "status": "success"
}
```

---

## Deploy на Vercel

### Через CLI

```bash
vercel login
vercel
vercel --prod
```

### Через Dashboard

1. Запушьте проект в GitHub.
2. [vercel.com/new](https://vercel.com/new) → Import.
3. Framework Preset: **Other** (Vercel автоматически распознает `/api`).
4. Deploy.

После деплоя вы получите URL вида `https://your-project.vercel.app`.

---

## Environment variables

В Vercel: **Project → Settings → Environment Variables**. Добавьте для **Production / Preview / Development**:

| Variable             | Значение                                                |
| -------------------- | ------------------------------------------------------- |
| `EPOINT_PUBLIC_KEY`  | `i000201454`                                            |
| `EPOINT_PRIVATE_KEY` | `epq7of5tjxaZL1UqJZycYoLB`                              |
| `SUCCESS_URL`        | `https://you-lush.com/success`                          |
| `ERROR_URL`          | `https://you-lush.com/error`                            |
| `RESULT_URL`         | `https://your-project.vercel.app/api/callback`          |

> После добавления переменных сделайте **Redeploy** проекта.

---

## Настройка ePoint

В личном кабинете [epoint.az](https://epoint.az):

1. **API → Настройки** → укажите **Result URL**:
   ```
   https://your-project.vercel.app/api/callback
   ```
2. Убедитесь, что **Public key** и **Private key** совпадают с теми, что добавлены в Vercel.
3. Активируйте API (если требуется модерация — подождите подтверждения).

---

## Подключение к Tilda

### Шаг 1. Создайте на you-lush.com страницы:

- `/success` — страница «Спасибо за заказ»
- `/error` — страница «Ошибка оплаты»

### Шаг 2. На странице с корзиной добавьте блок T123 (HTML).

Вставьте:

```html
<script>
  window.EPOINT_API_BASE = 'https://your-project.vercel.app';
</script>
<script src="https://your-project.vercel.app/tilda-epoint.js" defer></script>
```

Замените `your-project.vercel.app` на ваш домен Vercel.

Скрипт автоматически:

- ловит клик по стандартной кнопке Tilda `.t706__order-button`;
- читает `window.tcart` (товары, количество, сумма);
- читает имя/телефон/email из формы Tilda;
- отправляет данные на `/api/create-payment`;
- редиректит браузер на платёжную страницу ePoint.

### Шаг 3. Ручная кнопка оплаты (опционально)

Если нужна отдельная кнопка вне корзины, добавьте атрибут `data-epoint-pay`:

```html
<button data-epoint-pay class="my-pay">
  Оплатить
</button>
```

### Шаг 4. Включить debug-логи (по желанию)

```html
<script>
  window.EPOINT_DEBUG = true;
  window.EPOINT_API_BASE = 'https://your-project.vercel.app';
</script>
<script src="https://your-project.vercel.app/tilda-epoint.js" defer></script>
```

### Альтернатива — самостоятельный fetch на Tilda

Если корзина не используется, можно отправить запрос вручную:

```html
<script>
  async function payNow(amount) {
    const res = await fetch('https://your-project.vercel.app/api/create-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount,
        order_id: 'YL-' + Date.now(),
        description: 'Заказ you-lush.com',
      }),
    });
    const data = await res.json();
    if (data.success && data.redirect_url) {
      window.location.href = data.redirect_url;
    } else {
      alert(data.error || 'Ошибка оплаты');
    }
  }
</script>
```

---

## Test payment flow

1. Откройте https://you-lush.com.
2. Положите товар в корзину, нажмите checkout.
3. После клика по `.t706__order-button` браузер уйдёт на `epoint.az/redirect/...`.
4. Используйте тестовую карту от ePoint (выдаётся в личном кабинете).
5. После оплаты — редирект на `/success` или `/error`.
6. В Vercel Logs появятся события:
   - `[CREATE PAYMENT]`
   - `[PAYMENT SUCCESS]`
   - `[CALLBACK RECEIVED]`
   - `SUCCESS PAYMENT`

### Пример успешного response от `/api/create-payment`

```json
{
  "success": true,
  "redirect_url": "https://epoint.az/redirect/te_VR5XKSK6C7",
  "transaction": "te_VR5XKSK6C7",
  "status": "success"
}
```

### Пример ошибки

```json
{
  "success": false,
  "error": "Field \"amount\" is required and must be a positive number."
}
```

---

## Логи Vercel

### Web

**Project → Logs** → фильтр по функции `api/create-payment` или `api/callback`.

### CLI

```bash
vercel logs https://your-project.vercel.app --follow
```

Помеченные события:

| Лог                     | Когда                                          |
| ----------------------- | ---------------------------------------------- |
| `[CREATE PAYMENT]`      | Запрос на создание платежа принят              |
| `[PAYMENT SUCCESS]`     | ePoint успешно вернул `redirect_url`           |
| `[PAYMENT ERROR]`       | Ошибка валидации, сети или ePoint              |
| `[CALLBACK RECEIVED]`   | Webhook от ePoint получен                      |
| `[INVALID SIGNATURE]`   | Подпись webhook не совпала (потенциальная атака) |
| `SUCCESS PAYMENT`       | Платёж завершён успешно (status === "success") |
| `[PAYMENT FAILED]`      | ePoint вернул статус failed/error              |

---

## Безопасность

- `EPOINT_PRIVATE_KEY` хранится **только** в Vercel Env Vars и `.env` (в `.gitignore`).
- Приватный ключ **никогда не отправляется** во frontend и не логируется.
- CORS настроен только на `https://you-lush.com`, `https://www.you-lush.com` и `*.tilda.ws` — другие домены не смогут вызывать API из браузера.
- Webhook подпись проверяется через `crypto.timingSafeEqual` для защиты от timing-атак.
- Все ошибки логируются без раскрытия секретов клиенту.
- `.env` исключён из git через `.gitignore`.

---

## Troubleshooting

| Проблема                                  | Что проверить                                                                                            |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `Server configuration error`              | Не заданы `EPOINT_PUBLIC_KEY` / `EPOINT_PRIVATE_KEY` в Vercel. Сделайте Redeploy после добавления.        |
| `Invalid signature` в callback            | `EPOINT_PRIVATE_KEY` в env должен **точно** совпадать с ключом из ЛК ePoint, без пробелов и переносов.   |
| CORS ошибка на Tilda                      | Origin запроса должен быть `https://you-lush.com`. Откройте сайт через https и без www-редиректа.        |
| ePoint вернул `Invalid public_key`        | Проверьте `EPOINT_PUBLIC_KEY`. Скопируйте из ЛК ePoint один в один.                                      |
| Сумма уходит как `0` / `NaN`              | Tilda иногда хранит цену с запятой. Скрипт нормализует, но проверьте `window.tcart.prodamount`.          |
| Callback не приходит                      | Проверьте Result URL в ЛК ePoint — обязательно HTTPS и публично доступен. Тестируйте `curl`-ом.          |
| Кнопка не реагирует                       | Убедитесь, что `tilda-epoint.js` подключён на странице. Откройте DevTools → Network → должен быть `200`. |
| Возвращает `502` от ePoint                | Включите `window.EPOINT_DEBUG = true`, проверьте Vercel Logs `[PAYMENT ERROR]` для текста от ePoint.     |
| Двойные платежи                           | На стороне you-lush.com проверяйте уникальность `order_id` перед списанием товара со склада.             |

### Проверить webhook вручную

```bash
curl -X POST https://your-project.vercel.app/api/callback \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data "data=ZXlKemRHRjBkWE1pT2lKemRXTmpaWE56SW4wPQ==&signature=invalid"
# ожидаем: 403 Invalid signature
```

---

## Лицензия

MIT
