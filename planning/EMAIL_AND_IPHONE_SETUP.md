# Email and iPhone setup — October 4, 2026

Instructions only: no domain purchase, SMTP configuration, device registration or new build has been performed.

## What to buy

Recommend **canyouguessapp.com**, one year, through Cloudflare Registrar, with auto-renew and account 2FA. The public .com registry returned no registered record for this name (HTTP 404) on October 4; the registrar checkout is the definitive availability check, and availability can change. Backup candidate: canyouguessgame.com, also no registered record at that check. Do not buy an aftermarket/premium name just to unblock email.

Cloudflare's published standard .com registration and renewal price is currently **US$10.46/year**, before applicable checkout taxes. You need only the domain/free DNS; no website hosting package, paid Cloudflare plan, Google Workspace or dedicated IP is needed for this beta. Cloudflare Registrar requires its own nameservers; that is acceptable for this setup. Confirm renewal price and registrant email verification. [Pricing](https://pricing.registrar.cloudflare.com/), [registration](https://developers.cloudflare.com/registrar/get-started/register-domain/)

Create a Resend account and begin on Free: currently 3,000 emails/month with a 100/day limit. Signup, resend, recovery and email-change messages all consume capacity. Also review the independent Supabase Auth sending/rate limits. Do not run an open signup campaign against a tiny free email budget. [Resend pricing](https://resend.com/pricing)

## Sender and DNS

Add **auth.canyouguessapp.com** as a Resend sending domain. Suggested sender: **Can You Guess? <noreply@auth.canyouguessapp.com>**. Use canyouguessapp@gmail.com for support. Keep auth email tracking disabled. Select a sending/data region after reviewing the backend/provider data-region choices. [Sending domains](https://resend.com/docs/dashboard/domains/introduction)

In the Cloudflare root-domain zone, the expected default records for that auth subdomain are:

| Type | Name | Content |
| --- | --- | --- |
| TXT | resend._domainkey.auth | Exact generated DKIM public key from Resend |
| MX | send.auth | Exact regional feedback/bounce hostname and priority from Resend |
| TXT | send.auth | Exact generated SPF string, commonly v=spf1 include:amazonses.com ~all |
| TXT | _dmarc.auth | v=DMARC1; p=none; initially, then tighten after header/delivery checks |

The live Resend panel is authoritative if its labels differ. DKIM/region values cannot be filled in before adding the domain. TTL Auto; use DNS-only where applicable. Keep one SPF policy per hostname. The send.auth MX is for bounce handling, not a purchased inbox. Do not enable Resend receiving or replace root mail MX records unnecessarily. [DNS setup](https://resend.com/docs/knowledge-base/cloudflare), [DMARC](https://resend.com/docs/dashboard/domains/dmarc)

No DMARC reporting address is included above until a working report mailbox/service is configured. After verification, inspect received authentication headers and graduate to quarantine/reject when legitimate mail passes. A successful domain verification is not a promise that every mailbox will accept every message.

## Supabase settings and the Gmail reply-to detail

After Resend verifies the domain, enter these in the target Supabase project's Auth SMTP settings:

| Setting | Value |
| --- | --- |
| Sender name/address | Can You Guess? / noreply@auth.canyouguessapp.com |
| SMTP host | smtp.resend.com |
| Port | 465, secure TLS |
| Username | resend |
| Password | Dedicated Resend sending key, preferably domain-scoped; enter securely in Supabase |

Never put that key in chat, screenshots, .env public values or mobile configuration. Use the documented SMTP flow and validate the actual account's key permissions. [Resend/Supabase](https://resend.com/docs/send-with-supabase-smtp)

Gmail is fine as the support contact. A Reply-To header can point to Gmail while From stays on the verified domain, but Supabase's documented built-in SMTP setup does not expose a separate Reply-To setting. Do not assume that entering Gmail elsewhere adds the header. Minimum setup: put a visible support mailto link in auth templates. If actual reply routing is required, choose a tested domain forwarding setup or a Send Email Hook using Resend's reply_to field; the latter is additional backend work, not something already configured. No paid mailbox is required merely to send auth emails. [Auth email hook](https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook), [Resend reply-to API](https://resend.com/docs/api-reference/emails/send-email)

Test signup/OTP, recovery and email change to two non-team mailbox providers, inbox/spam placement, expired/reused codes, and device deep links. Domain/SMTP work does not require an EAS build; a JS-only OTP/recovery fix can use a development client once approved.

## Is Gmail SMTP an acceptable stopgap?

**Only for a tiny invite-only private beta, if necessary; Resend plus a domain is the recommended path.** This is an engineering recommendation, not a promise of email delivery.

Conditional setup: smtp.gmail.com, port 465 with TLS (or supported 587 STARTTLS), username/From canyouguessapp@gmail.com, a dedicated Google app password. Enable 2-Step Verification first; app passwords are unavailable on some account/security configurations. Never use the normal account password or enable obsolete less-secure-app access. Consumer Gmail's published limits differ from Workspace and blocked sending can interrupt recovery as well as new signups. [Google app passwords](https://support.google.com/accounts/answer/185833), [Gmail limits](https://support.google.com/mail/answer/22839), [Google SMTP settings](https://support.google.com/a/answer/176600)

If used, keep beta signup invitation-only, test external deliveries, monitor failures, and replace it with transactional SMTP before external/open beta. Enter the app password only in Supabase, then revoke it after switching providers. Do not try to use Resend to send From @gmail.com: you do not own/verify gmail.com. No Gmail SMTP changes were made today.

## Register the iPhone from Windows — no Mac and no build needed

After build 19's device check, open PowerShell in:

    C:\Users\Marketily\OneDrive\Desktop\Yael Levi\CanYouGuess\repo

Run only the registration command:

    npx --yes eas-cli@23.0.0 device:create

Choose the lerilevi Expo account and the existing Apple team when prompted; authenticate personally if asked. Choose the Website/registration-link option. Open the generated link in Safari on the iPhone (or scan the displayed QR code). Allow its device-identification profile, then Settings > Profile Downloaded, or General > VPN & Device Management, and install that specific Expo registration profile. Return to Safari to complete registration. Do not install an unrelated profile or send an Apple password/2FA code in chat.

Verify from Windows:

    npx --yes eas-cli@23.0.0 device:list

Registration does not compile an app or spend an EAS build credit. Expo registration and Apple portal/provisioning inclusion are distinct; before the approved development build, verify the phone is included in the actual ad hoc profile. We will handle profile refresh deliberately. [Device registration](https://docs.expo.dev/tutorial/eas/ios-development-build-for-devices/), [provisioning rules](https://docs.expo.dev/build/internal-distribution/)

**Stop here until the native batch is approved.** Do not run eas build yet, and do not run Xcode/Simulator instructions. No development profile or SDKs were added today.

## After the approved development client exists

Install it using the EAS installation link in Safari. On iOS 16+, open it once; if Developer Mode is required, go to Settings > Privacy & Security > Developer Mode, enable it, restart and confirm Turn On. On a phone never used for development, that option may not appear until the signed development app is installed. A Mac is not required for this path. [Developer Mode](https://docs.expo.dev/guides/ios-developer-mode/)

Then on Windows run the app's pinned Expo CLI:

    node node_modules/expo/bin/cli start --dev-client

Phone and PC should be on reachable Wi-Fi; allow the development server through the relevant firewall rule. Use the CLI's displayed link/QR to open the installed development client, not Expo Go. A tunnel is an alternative if LAN access is blocked; it may need an additional tunnel dependency. JS changes reload without native builds; native dependency/permission/plugin changes still need one.

With the same bundle ID, the development client replaces the TestFlight installation. Complete the build 19 baseline test first. Reinstall the TestFlight build for release checks. A separate dev bundle ID can support co-installation but needs additional Apple/ad/purchase configuration and is not approved or configured here.

## What to send back

Build 19 device result; chosen/registered domain; whether Resend is ready; the public DNS records only (not keys); two test email providers; confirmation device:list shows the iPhone. Age/ranked-mode and native-batch decisions remain separate.
