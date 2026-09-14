# iOS / Capacitor (homeapp)

homeapp does **not** embed Capacitor inside the Next.js repo. It follows the
Rodor pattern: a thin native shell that loads the live site.

## Shell

Repo: [`rodor1155/ios-shell-template`](https://github.com/rodor1155/ios-shell-template)  
Instance: `instances/homeapp/`

| Field | Value |
| --- | --- |
| Display name | `homeapp` (placeholder until product name locks) |
| Bundle ID | `co.rodor.homeapp` (change when the name is final) |
| Web URL | `https://homeapp-mu.vercel.app` |
| URL scheme | `co.rodor.homeapp://` |
| Hub deep link | `co.rodor.homeapp://hub` → `/hub` (kitchen display; auth required) |

### Open in Xcode (Mac Mini)

```bash
cd ~/Rodor\ Tech/ios-shell-template
npm install
npm run instance:use homeapp
npm run prepare:instance
npm run open:ios
```

Then: select your Apple Development Team under **Signing & Capabilities**,
run on a simulator or device. **Nothing goes to App Store / TestFlight without
Ross’s explicit yes.**

### Assets

Placeholder icon/splash from the template are in
`instances/homeapp/assets/`. Replace with brand art when the working name and
mark are chosen (1024 icon, ~2732 splash). Splash background `#F7F3EB` (paper).

## Web app readiness

Already in good shape for a shell:

- Bottom tab bar + `safe-area-inset` padding
- Document / timetable photo upload paths (camera permission strings set)

Worth checking on device next:

- Google OAuth / magic-link return via `co.rodor.homeapp://` (Browser + App plugins)
- Camera capture from the web layer via `@capacitor/camera` if file input is weak in WKWebView
- Viewport / keyboard on timetable and forms

## TestFlight prerequisites (later)

1. Final app name + bundle ID
2. Real icon / splash
3. Apple Developer App ID + provisioning
4. Privacy labels (camera/photos; no ad tracking)
5. Delete-account already exists in Settings (App Store requirement)
6. Ross’s yes before any store upload
