# Google and Facebook sign-in setup

Implemented server routes support registration, sign-in, and explicit account linking. Provider buttons stay hidden until the corresponding server settings are complete and explicitly enabled. This does not connect a Facebook Page, Shop, or Marketplace selling account. Those are separate connections and permissions.

## Google

1. In Google Cloud / Google Auth Platform, create or select the project owned by Layu. Configure the app name, audience, support contact, home page `https://market.layu.llc`, privacy page `https://market.layu.llc/privacy`, and terms page `https://market.layu.llc/terms`. Add and verify the `layu.llc` domain as required by Google.
2. Create an OAuth client for a **Web application**. Add this exact authorized redirect URI: `https://market.layu.llc/api/auth/social/google/callback`.
3. Store the client ID and secret in the application's protected server configuration as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Never place the secret in browser code, source control, screenshots, chat, or `NEXT_PUBLIC_*` variables.
4. Add the intended test users while the consent app is in testing. Set `GOOGLE_LOGIN_ENABLED=true` only when the client is ready to test. Redeploy the server configuration.
5. Test a new registration, sign-out/sign-in, declined consent, and connecting Google from an existing verified account at **Account → Sign-in methods**. A matching email does not merge accounts automatically.
6. Complete Google's required branding/audience publication steps before general availability. Only `openid email profile` is requested; no Gmail, Drive, or publishing access is requested.

## Facebook

1. Create or select the Layu-owned app in Meta for Developers and add the Facebook Login use case for a website. Use `https://market.layu.llc` as the site URL and configure the app domain, contact, privacy policy, and data-deletion instructions URL `https://market.layu.llc/auth/data-deletion`. Check the console's current eligibility and review requirements. Before submitting that URL, verify the site's `supportEmail` setting is a monitored, real address; the public instructions read that setting directly.
2. Enable web OAuth login and add this exact valid OAuth redirect URI: `https://market.layu.llc/api/auth/social/facebook/callback`.
3. Store the app ID as `FACEBOOK_CLIENT_ID` and app secret as `FACEBOOK_CLIENT_SECRET` in protected server configuration. Set `FACEBOOK_GRAPH_API_VERSION` to the supported version shown for this app, in the form `vN.N`. There is deliberately no guessed default version.
4. Add app testers/admins in Meta. Set `FACEBOOK_LOGIN_ENABLED=false` and `FACEBOOK_LOGIN_REVIEW_ENABLED=true` to enable `/auth/facebook-review` while keeping Facebook off the regular login, registration and account-connection controls. The admin Connections page links to the review page. This is an unlisted page, not an access secret: anyone with its URL can open it, but authentication still requires a Facebook account Meta permits for this app. It uses the same OAuth routes, state and identity validation as the public flow. First connect an existing verified Layu account, then sign out and return to the review page to test Facebook sign-in. Review registrations require terms and Layu email confirmation. Complete all review, business verification, data-use, and live-mode requirements shown by Meta before setting `FACEBOOK_LOGIN_ENABLED=true` and `FACEBOOK_LOGIN_REVIEW_ENABLED=false`. Public activation also disables the review page. App creation alone does not guarantee public Facebook Login access.
5. Only `public_profile,email` are requested. Facebook may not return an email; in that case the user registers with email first, confirms it, and then explicitly connects Facebook. New Facebook registrations always receive Layu email confirmation before commerce access.
6. Test decline/cancel, missing email, existing-email collision, ordinary sign-in, and explicit linking. Adding a provider must never grant an admin role or bypass account blocks/deposit rules.

## Operation and security

- Callback addresses come from `APP_URL`, not an untrusted request host. Local Google testing can use an explicitly registered `http://localhost:3000/api/auth/social/google/callback`. Use HTTPS for public deployments.
- Apply the additive migration containing `social_accounts` and `social_login_attempts` before enabling a provider.
- Every flow uses one-use database state, a separate HttpOnly browser-binding cookie, a ten-minute expiry, and same-origin initiation. Google also uses S256 PKCE, nonce, and RSA signature / issuer / audience / expiry validation. Facebook checks that its token belongs to this app and the returned user; profile requests use app-secret proof.
- Provider access/refresh tokens are not stored. The account connection stores only the provider name, stable provider user ID, owner, and creation time. Temporary attempt records expire and are removed when another flow starts.
- Google-verified Gmail/Workspace email addresses can satisfy the email requirement. Other Google email addresses still require Layu confirmation. Email matches alone never connect an existing account; first sign in with its existing method and explicitly connect the provider.
- Registration requires accepting the current terms. Social registration always creates a bidder. Existing linked accounts retain their role and enforcement rules.
- Disable a provider using its `*_LOGIN_ENABLED=false` setting if setup is incomplete or credentials must be rotated. For Facebook, also set `FACEBOOK_LOGIN_REVIEW_ENABLED=false` to disable its testing route and OAuth processing. Both flags default to disabled. Review-only Facebook is not counted as a replacement for another public sign-in method when disconnecting accounts. Existing email/password sign-in remains available. Users whose only login is the disabled provider will need it restored or an operator-assisted recovery process; do not casually disable an established provider.
- Account linking and selling-channel authorization are separate. Facebook sign-in never publishes listings or grants Page access.
- Users can disconnect a provider from **Account → Sign-in methods** after an explicit confirmation. A serializable transaction prevents removing the last usable login path, including concurrent attempts to remove both providers. Another configured provider or an existing password is required. Disconnect removes that provider's saved identifier and pending link attempts; it does not delete the user's transactions, profile, account, or existing sessions. Full deletion requests go to the site's configured support address shown on the public instructions page.
- This implementation was checked using mocked provider responses and cryptographically signed test tokens. A real Google/Meta app, secrets configuration, approval, and live sign-in smoke test remain necessary before claiming either provider is live.

## Primary references checked on September 23, 2026

- [Google OpenID Connect server flow and validation](https://developers.google.com/identity/openid-connect/openid-connect)
- [Google OpenID Connect API reference](https://developers.google.com/identity/openid-connect/reference)
- [Google backend authentication and email authority](https://developers.google.com/identity/sign-in/web/backend-auth)
- [Meta manual Facebook Login flow](https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow/)
- [Meta secure Graph requests](https://developers.facebook.com/docs/graph-api/guides/secure-requests/)

Google's public reference was readable during implementation. Meta's documentation returned HTTP 429 to the research tool; its current console requirements and supported app version must be checked during account setup before enabling public login.
