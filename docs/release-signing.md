# Windows Signing

## Current state

- `pnpm dist` builds an unsigned NSIS installer.
- This is suitable for internal testing.
- Windows SmartScreen warnings are expected for client delivery.

## Signed build prerequisites

You need a valid Windows code-signing certificate and private key.

Supported environment variables for `electron-builder`:

- `CSC_LINK`
- `CSC_KEY_PASSWORD`

`CSC_LINK` can point to:

- a local `.pfx` file path
- a base64-encoded certificate payload

## Commands

Unsigned installer:

```powershell
pnpm dist
```

Explicit unsigned installer:

```powershell
pnpm dist:unsigned
```

Signed installer:

```powershell
$env:CSC_LINK="C:\certs\energy-desktop.pfx"
$env:CSC_KEY_PASSWORD="your-password"
pnpm dist:signed
```

## Packaged smoke test

След build или packaging можеш да валидираш `win-unpacked` приложението локално:

```powershell
pnpm smoke:packaged
```

Smoke test-ът:

- стартира packaged `.exe`
- изчаква startup лог
- валидира `SQLite initialized.`
- валидира `Main window created.`
- валидира `Window shown.`
- затваря процеса

## Expected output

Artifacts are written to:

```text
apps/desktop/dist/
```

Typical files:

- `Energy Desktop Setup 0.1.0.exe`
- `Energy Desktop Setup 0.1.0.exe.blockmap`

## Release recommendation

- Use unsigned builds only for internal QA.
- Use signed builds for any external client delivery.
- Test the signed installer on a clean Windows machine before distribution.
