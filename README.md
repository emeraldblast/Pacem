# Pacemock

NUET-style mock tests with accounts, marks and worked solutions. Live at https://jskskamd.github.io/Pace/

Pacemock is an independent study site, not connected to Nazarbayev University.

## Run it locally

```
python3 -m http.server 8000
```

Then open http://localhost:8000/. Local logins use the live Supabase project, so they create real data.

## Add or change content

- Mock tests are in `questions.js`. The comment at the top shows every field, and each `image` needs an `alt`.
- List new mocks in `SUBJECTS` in `index.html`.
- Maths solutions are images in `solutions/`, linked by `solutionImage`. The `solution` text stays as their alt text, so keep the two in step.
- After changing a file, raise the `?v=` number in the HTML pages so browsers load the new version.
- If the Supabase project changes, update `config.js` and the `connect-src` address in each page's Content-Security-Policy.
- If the Supabase library version changes, update its `integrity` hash in each page.

## Payments

An exclusive mock costs 1 290 ₸. Buyers transfer it by Kaspi and send the receipt from the mock's payment window. The price, phone number and recipient are in `PAYMENT` in `config.js`.

1. Run `supabase/payments.sql`, then `supabase/admin-payments.sql`, once in the Supabase SQL Editor.
2. New receipts show under Payments in the admin panel (`admin.html`), with the receipt, the buyer's email, the mock and their Kaspi name.
3. Check the transfer in Kaspi, then press Approve to unlock the mock, or Reject to ask the buyer for a new receipt. Unlocking the mock with the Telegram bot or the Accounts switches also approves its payment.
