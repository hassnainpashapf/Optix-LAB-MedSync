# Adding a product to the Optix suite

The suite works like ManageEngine / Zoho: **every product has its own website and its own backend and data**; one account hub
knows who the people are, which products a business has, and which products each person may open. Today the hub lives inside the
Lab cloud (`cloud/`, the `labpos-api` server). Everything below goes through HTTP, so the hub can be moved to its own server later
by changing one address.

## What the hub owns

| Thing | Where it is set |
|---|---|
| The product list (id, name, colour, icon, web address, roles) | Superadmin console → Plans & Settings → **Products** (`GET/PUT /api/saas/products`) |
| Which business has which product | Superadmin console → Labs → a business → **Products** (`PUT /api/saas/labs/:id {products}`) |
| Which person may open which product, and their role in it | Business admin → Settings → Users & Roles → **Can open** (`user.apps`, `user.appRoles`) |
| Sign-in, sessions, the one-time SSO ticket | `POST /api/auth/login`, `POST /api/sso/ticket`, `POST /api/sso/exchange` |
| WhatsApp, SIM SMS, Email for the business | `/api/wa/send`, `/api/sms/queue` (`kind:"message"`, `source:"<product>"`), `/api/mail/send` |

## Checklist for a new product (say `crm`)

1. **Registry.** Superadmin → Plans & Settings → Products → *Add product*: id `crm`, name, colour, icon, web address
   (`https://crm.example.pk`), optional roles (`ADMIN:Admin, AGENT:Agent`). The id is permanent.
2. **Give it to a business.** Superadmin → Labs → the business → tick *Optix CRM*. Existing people do **not** get it automatically
   (only the business admin does); the admin then ticks *Optix CRM* for each person and picks their CRM role.
3. **Landing page `/#/sso?ticket=<ticket>`** on the product's website. It must:
   - `POST {hub}/api/sso/exchange {"ticket": "<ticket>"}` (works once, 60 seconds) →
     `{ok, token, user, lab, apps, catalog, app}`;
   - check `apps` contains `crm`, otherwise show "no access";
   - remove the ticket from the address bar (`history.replaceState`) and start its own session.
4. **Sign-in page of the product (optional but recommended).** `POST {hub}/api/auth/login {username, password, lab}` gives the same
   answer as the exchange. If `apps.length > 1` show the chooser (`catalog` has name / sub / colour / icon of every app the person may
   open); to go to another product call `POST {hub}/api/sso/ticket {"app": "<id>"}` with the bearer token and open the returned `url`.
5. **The product's own backend** trusts a hub token by asking the hub: `GET {hub}/api/auth/whoami` with `Authorization: Bearer <token>` →
   `{user{id,name,username,role,appRoles}, lab{id,slug,name,status}, apps, catalog}`. Cache the answer for a minute; reject when
   `apps` lacks the product or `lab.status` is `suspended`/`expired`. Tokens are bearer tokens: send them only over HTTPS.
6. **CORS.** The product's web origin must be allowed by the hub (`CORS_ALWAYS` in `cloud/server.js` or the `CORS_ORIGINS` environment
   variable on the server).
7. **Messaging.** Use the hub endpoints above with the same bearer token; the business's linked WhatsApp number, SIM phone and mailbox
   are shared, so nothing is set up per product.

## Rules that keep it safe

- A ticket only works for a product the person is allowed into, once, within 60 seconds.
- Product roles are validated against the roles the registry lists for that product.
- A person without the `lab` product gets `403 NO_LAB_APP` on lab data; products must do the same check with `apps`.
- Removing a product from the registry hides it everywhere at once; businesses keep their data in the product's own backend.

## Moving the hub to its own server later

The apps only know `CENTRAL_API` (pharmacy: `VITE_CENTRAL_API`) and the lab site's `LABPOS_API`. Standing up a separate hub means copying
the `saas.js` registry + users/apps + SSO routes behind a new address and changing those values.

Test: `node scripts/test-central-login.js`.
