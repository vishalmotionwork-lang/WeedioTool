# Build WeedioTool for Windows

Windows installer must be built on a Windows machine (native modules need Windows compilation).

## Steps

1. Install Node.js 22+ from https://nodejs.org
2. Copy the entire `WeedioTool` project folder to the Windows machine
3. Open Command Prompt / PowerShell in the WeedioTool folder
4. Run:

```
npm install
npm run build:win
```

5. Installers will be in the `dist/` folder:
   - `WeedioTool-Setup-1.0.0.exe` (installer)
   - `WeedioTool-1.0.0-portable.exe` (portable)

6. Copy these to `release/Windows/`

## Alternative: GitHub Actions CI

Add this to `.github/workflows/build.yml` to auto-build on push:

```yaml
name: Build
on: push
jobs:
  build-win:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm install
      - run: npm run build:win
      - uses: actions/upload-artifact@v4
        with:
          name: windows-installer
          path: dist/*.exe
```
