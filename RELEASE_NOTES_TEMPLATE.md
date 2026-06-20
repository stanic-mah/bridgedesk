# BridgeDesk GitHub Release Notes Template

Use this exact structure for every GitHub Release body:

```md
BridgeDesk v{{version}} focuses on {{focus}}.

{{update_log_bullets}}

Recommended download: `BridgeDesk-Setup.exe`

The portable exe is included for manual use only. Auto-update uses the installer plus `latest.yml`.
```

Rules:

- Keep the first sentence direct and version-specific.
- Use the bullet list from `UPDATE_LOG.md` for that version.
- Keep the recommended-download and portable/auto-update wording unchanged.
- Generate notes with `npm run release:notes -- <version> --focus "<focus>"`.
