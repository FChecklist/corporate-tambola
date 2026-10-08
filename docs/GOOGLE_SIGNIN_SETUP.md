# Setting up "Continue with Google" (the owner's steps)

Plain words. About 15 minutes. It is free. You do this once. Nothing secret is needed: Google gives you a public **Client ID**, and that is all we use. No password, no "client secret" is ever put on the site.

What it does: organizers and Hosts can press **Continue with Google** to sign up or log in. Google only tells us that the e-mail address belongs to that person. We keep the e-mail and nothing else (no name, no photo).

If you never do these steps, nothing breaks: the button stays hidden and people use the e-mail code.

## The 10 steps in Google Cloud Console

1. Open **console.cloud.google.com** and sign in with the Google account that should own this (your company account is best).
2. At the top, press the project box, then **New project**. Name it `Corporate Tambola`. Press **Create** and make sure it is the selected project.
3. In the left menu open **APIs & Services**, then **OAuth consent screen** (it may be called **Google Auth Platform**, then **Branding**).
4. Choose **External**. App name: `Corporate Tambola`. Support e-mail: your own. Developer contact e-mail: your own. Save.
5. On **Data access** (or **Scopes**) add only `openid` and `.../auth/userinfo.email`. Add nothing else: we ask Google for the e-mail address only. Save.
6. Press **Publish app** (move it from Testing to In production). Without this only a few test users can sign in. For sign-in with just the e-mail, Google does not ask for a review.
7. In the left menu open **Credentials**, then **Create credentials**, then **OAuth client ID**.
8. Application type: **Web application**. Name: `Corporate Tambola website`.
9. Under **Authorised JavaScript origins** add the exact website address, for example `https://corporate-tambola.pages.dev` and, if you use one, your own domain such as `https://www.yourdomain.com`. Add `http://localhost:8788` if you test on your own computer. Leave **Authorised redirect URIs** empty: the button works without it. Press **Create**.
10. Google shows a **Client ID** that ends in `.apps.googleusercontent.com`. Copy only that. Close the box (you do not need the client secret).

## Telling the website the Client ID

The Client ID is public, so it goes in as a normal variable, not a secret.

- In Cloudflare, open the Pages project, **Settings**, **Variables and Secrets**, add a plain-text variable named `GOOGLE_CLIENT_ID` with the Client ID as its value, for the Production environment. Redeploy.
- Check it: open `https://your-site/api/auth/config`. It should show `{"google":"1234...apps.googleusercontent.com"}`. If it shows `{"google":null}` the variable is missing or has a typo, and the button stays hidden.

## What to expect

- The button appears on the sign-in page, the home page "Log in", the console sign-in and the Host's "Finish setup" screen, above "Sign in with an e-mail code".
- Google's script runs only on those pages (the site's security rules allow Google nowhere else).
- Inside some in-app browsers (for example a chat app's built-in browser) Google refuses to open. The page then says: "Open this page in your browser, or use an e-mail code."
- A Host who was added with an e-mail can only use that same Google e-mail. If it is different the page says "This link is for a***@acme.com".

## If something goes wrong

- "Error 400: origin_mismatch": the website address is not in step 9, or has a typo (check `https://` and no trailing slash).
- "Access blocked: app has not been verified" or only some people can sign in: the app is still in **Testing**; do step 6.
- The button does not show at all: the variable is not set (see above), or an ad blocker is hiding Google's script.
- To stop Google sign-in: delete the `GOOGLE_CLIENT_ID` variable and redeploy. The e-mail code keeps working.

## Privacy

Google is listed as a sign-in provider on the Sub-processors page and in the Terms. We receive only a confirmed e-mail address from Google and store only that. See `apps/edge/src/google.ts` for exactly what is checked.
