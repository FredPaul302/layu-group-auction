# Facebook sign-in review page — September 25, 2026

Facebook can now be tested through `/auth/facebook-review` while its buttons remain hidden on the normal login and registration pages. The page supports linking an existing verified Layu account, registration with accepted terms, and returning sign-in. It uses the existing OAuth state, browser binding, provider validation and email-confirmation rules.

The new `FACEBOOK_LOGIN_REVIEW_ENABLED` setting defaults to false. Enabling it with `FACEBOOK_LOGIN_ENABLED=false` makes the unlisted review page available; anyone with the URL can open it, and Meta still controls which Facebook accounts can authorize the unpublished app. Enabling public Facebook login removes the review page. The admin Connections page provides the testing link and reports review mode separately from public availability. Review-only Facebook does not count as an alternative public login method when disconnecting another provider.

Validation passed: lint, typecheck, 1125 tests (11 opt-in integration tests skipped), deployment checks, the production build, and a no-cache Docker build. All runtime source hashes matched the reviewed workspace. Twenty-eight checks passed against the compiled image across disabled, public and review modes, using isolated containers with fake credentials and no network or host ports. No database changes were required.

The guarded deployment was dispatched at `2026-09-25T03:36:44.764Z` and completed successfully at `2026-09-25T03:46:59.474Z`, with 100% traffic and zero reported failures. Eighteen live HTTPS checks passed, and the exact image and configuration were verified. Its only server-setting addition is `FACEBOOK_LOGIN_REVIEW_ENABLED=true`; public Facebook activation remains false. The existing Facebook credentials, Google settings and unrelated service configuration were preserved. Operational receipts are in `D:/CodexTaskTemp/LayuMarket/facebook-review-20260925/`.

A real website Facebook connection and returning sign-in both passed. The owner connected Facebook to the existing verified Layu account. After signing out and signing back in through Facebook, the site showed the same account and its saved Facebook connection. Private account identifiers and tokens were not recorded in the release receipt. The live review page was also visually checked.

The tested reviewer instructions were saved in Meta, including the dedicated review URL and the registration/linking/disconnection steps. Meta now marks **App settings**, **Allowed usage**, **Data handling**, and **Reviewer instructions** complete. **Verification** is the sole unchecked step: the connected Layu business portfolio still shows **In review**, and **Submit for review** remains disabled. The app is unpublished; App Review has not been submitted and customers still do not see a Facebook login button. The next external prerequisite is Meta's business-verification approval.

Live image: `sha256:24ea01e47cc0b404f382fbbecbbb99ba05bcccf1da457320b211820afaa4dd9e`.

Service revision: `arn:aws:ecs:us-east-1:816344830615:service-revision/default/layu-auction-web-beta/3795411236259234759`.
