# Setting up "Continue with Microsoft" (the owner's steps)

Plain words. About 15 minutes. It is free. You do this once. Nothing secret is needed: Microsoft gives you a public **Application (client) ID**, and that is all the site uses. No password and no "client secret" is ever created or put on the site.

What it does: organizers and Hosts can press **Continue with Microsoft** to sign up or log in with a work, school or personal Microsoft account (Outlook, Hotmail, Microsoft 365). Microsoft only confirms that the e-mail address belongs to that person. Only the e-mail is kept (no name, no photo, no Microsoft account id).

If these steps are never done, nothing breaks: the button stays hidden and people use the e-mail code.

## The steps in Microsoft Entra (portal.azure.com, or entra.microsoft.com)

1. Sign in with the Microsoft account that should own this (the company account is best).
2. Open **Microsoft Entra ID**, then **App registrations**, then **New registration**.
3. Name: `Corporate Games sign-in`.
4. **Supported account types**: choose **Accounts in any organizational directory (Any Microsoft Entra ID tenant - Multitenant) and personal Microsoft accounts (such as Skype, Xbox)**. Nothing narrower, or some people will be refused.
5. **Redirect URI**: choose the platform type **Single-page application (SPA)** (not "Web"), and enter the first address from the list below. Press **Register**.
6. On the app's **Overview** page copy the **Application (client) ID** (a code like `11111111-2222-3333-4444-555555555555`). That is the only value the site needs.
7. Open **Authentication**. Under **Single-page application** add every other address from the list below (one line each, the exact text, no trailing slash). Save.
8. On **Authentication**, leave "Allow public client flows" and the implicit grant boxes **off**. The site uses the code flow with PKCE, which needs neither.
9. Open **API permissions**. Keep only **Microsoft Graph, Delegated: openid, email, profile** (they are added by default as User.Read; you may remove User.Read). Add nothing else. No admin consent is needed.
10. Do not create a client secret. If one exists, delete it: it is never used.

## The exact redirect URIs to register (type: Single-page application)

Each game site and each console has its own address, and Microsoft needs each one written out. The path is always `/ms-callback.html`.

- https://housie.corporatetambola.com/ms-callback.html
- https://bingo.corporatetambola.com/ms-callback.html
- https://tictactoe.corporatetambola.com/ms-callback.html
- https://snakes.corporatetambola.com/ms-callback.html
- https://luck.corporatetambola.com/ms-callback.html
- https://luckydraw.corporatetambola.com/ms-callback.html
- https://console.corporatetambola.com/ms-callback.html
- https://home.corporatetambola.com/ms-callback.html
- https://corporatetambola.com/ms-callback.html (only if that address serves the sign-in page too)
- http://localhost:8788/ms-callback.html (only for testing on your own computer; Microsoft allows http for localhost)

Check the list against each live site address before you finish: a game that runs on another address needs that address added too (for example a `*.pages.dev` address used for testing). An address that is not in the list shows Microsoft's error **AADSTS50011** ("redirect URI does not match").

## Telling the website the client ID

The client ID is public, so it goes in as a normal variable, not a secret.

- In Cloudflare, open the Pages project, **Settings**, **Variables and Secrets**, add a plain-text variable named `MICROSOFT_CLIENT_ID` with the Application (client) ID as its value, for the Production environment. Redeploy. Do this for each game site and console that should show the button.
- Check it: open `https://your-site/api/auth/config`. It should show `{"google":null,"microsoft":"11111111-..."}`. If `microsoft` is `null` the variable is missing or has a typo, and the button stays hidden.

## What to expect

- The button **Continue with Microsoft** appears on the sign-in page, the home page "Log in" and sign-up, above "Sign in with an e-mail code".
- Microsoft's page opens in a small window only after the button is pressed. Nothing is loaded from Microsoft before that. The site's security rules allow `login.microsoftonline.com` only on those sign-in pages.
- A Host who was added with an e-mail can only use that same e-mail. If it is different the page says "This link is for a***@acme.com".
- Inside some in-app browsers the window cannot open. The page then says: "Open this page in your browser, or use an e-mail code."

## Good to know (one honest limit)

Microsoft work and school accounts can have an e-mail address typed in by that company's own administrator. The site reads the `email` field, or the sign-in name only if it looks like an e-mail address, and treats it as the person's e-mail, the same trust it gives a company mailbox. Personal Microsoft accounts verify their address. If a stricter check is wanted later, restrict sign-in to known company domains.

## If something goes wrong

- **AADSTS50011** (redirect URI mismatch): the address is not in the list above, or the platform type is not Single-page application.
- **AADSTS700016** (application not found in the directory): the supported account types in step 4 are too narrow.
- **AADSTS9002326** (cross-origin token redemption only for SPA): the redirect URI was registered as "Web". Move it under Single-page application.
- The button does not show at all: the variable is not set (see above).
- To stop Microsoft sign-in: delete the `MICROSOFT_CLIENT_ID` variable and redeploy. The e-mail code keeps working.

## Privacy

Microsoft is a sign-in provider only if a person presses the button. Only a confirmed e-mail address is received and stored. See `apps/edge/src/microsoft.ts` for exactly what is checked.
