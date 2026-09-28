# Facebook sign-in preparation — September 24, 2026

The website preparation release is deployed and verified. Facebook sign-in remains hidden while Meta setup and review are completed. Google sign-in and unrelated service settings were preserved.

## Completed

- Created the Layu Market Meta app (`1792226545308281`) in the Layu business portfolio (`2195882661273021`) with the owner's explicit approval.
- Added only `email` and `public_profile`. The Graph API Explorer permission test succeeded for both after the owner privately generated a token and completed consent.
- Saved and validated the exact production callback, enabled web OAuth, and retained HTTPS and strict URI matching.
- Saved website, domain, privacy, terms, deletion-instructions URL, Shopping category and the owner's app contact.
- Confirmed app-specific Graph API version `v26.0` in Meta's console.
- Updated the live site's support contact to the owner's supplied `FredLayaou3@Gmail.com`. A guarded one-off ECS task completed successfully, and the live deletion page was checked over verified HTTPS.
- Deployed a Facebook logo button beside Google using Meta's unmodified official primary PNG. Both buttons have accessible names and 44px touch targets; disabled providers stay hidden.
- Applied the two explicitly approved Facebook IAM inline policies through the AWS Console and verified their saved JSON. The deployer can create/check only the Facebook secret with overwrite denied; the website execution role can read only that secret. Existing policies were preserved.
- The owner subsequently saved the Facebook app secret directly in AWS. Its SecureString metadata and runtime retrieval were verified without exposing the value. The isolated ECS check stopped successfully with exit 0; deployment configuration and existing Google availability passed, and the live service configuration was verified unchanged.
- Meta now shows the Layu business verification as **In review**.
- Deployed the app ID, confirmed Graph version and encrypted-secret reference with `FACEBOOK_LOGIN_ENABLED=false`. The rollout completed at **2026-09-24T23:55:51.838Z**, with 100% production traffic and zero reported failures.
- Saved the owner's data-handling draft: Layu Group, LLC; no national-security disclosures; attorney review of the legality of government requests. The owner explicitly confirmed the United States and AWS as the only outside company handling Facebook sign-in data; AWS is listed for IT/cloud processing in the United States. The review has not been submitted.
- Accepted and saved Meta's `email` and `public_profile` allowed-usage agreements after the owner explicitly approved both. Both permissions now show their saved **Edit** state in the review workflow.
- Created a transparent app icon after the owner reported Facebook's background requirement. Its real alpha channel was verified, and the owner subsequently confirmed **Uploaded and Saved**. The review checklist now independently shows **App settings** complete.

## Validation

`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm deploy:check`, and `pnpm build` passed. Tests: 1110 passed, 11 opt-in PostgreSQL integration tests skipped. These results do not constitute a real Facebook login test.

After the owner started Docker, the no-cache production-image build passed. Complete source hashes matched the reviewed workspace, and fifteen checks passed against the compiled image in isolated, read-only containers using fake configuration, no network and no host ports. The exact tested archive was uploaded and its registry digest verified.

The completed live rollout matched the expected image and configuration. Fourteen HTTPS checks passed across the hostname's two current IPv4 addresses, covering login/registration, required registration terms, both exact provider assets, safe callback errors and the public support contact. Google remains available; Facebook remains hidden and its disabled callback rejects attempts safely. No database migration or change to unrelated service settings was needed.

Meta's Graph API Explorer returned nonempty ID, name and email fields without an error for `GET me?fields=id,name,email` using app `1792226545308281`, version `v26.0`, and only the two requested login permissions. No access token or actual profile values were recorded. Testing counters had not updated immediately afterward; Meta says results may take up to 24 hours. This verifies the permission request, not review approval or a real website sign-in.

## Remaining

- Meta business-verification approval, App Review and public publishing approval. Business verification is in review; the separate app-review draft has not been submitted.
- The owner is now signed into Meta in the in-app browser. The saved review checklist still disables submission. Revisit the permission-testing status after Meta processes the successful call; do not repeat the icon upload or accepted usage agreements.
- Complete the working reviewer-access path and reviewer instructions, and submit the prepared review when it is ready. Data-handling facts and both usage agreements are saved.
- Activate Facebook only after the remaining readiness work, preserving Google settings, then complete a real account-linking and login check. The current flag is deliberately false.

The earlier Windows preview-server launch was blocked by automatic approval review with only **blocked by policy** and was not retried. Isolated compiled-image checks subsequently passed; no real Facebook OAuth connection or browser visual preview is claimed.

Operational notes and scoped policy drafts are in `.codex-work/facebook-login-20260924/`. Release receipts are in `D:/CodexTaskTemp/LayuMarket/facebook-login-20260924/`.

Current live image: `sha256:66f428500d425cd156b85074dc0cefab9c942d92cebb560f054e5045d9910d71`.

Current service revision: `arn:aws:ecs:us-east-1:816344830615:service-revision/default/layu-auction-web-beta/5379498207231397493`.
