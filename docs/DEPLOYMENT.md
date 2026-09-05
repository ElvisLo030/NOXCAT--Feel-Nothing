# Production deployment and CI/CD

The production instance runs on the HX370 server as a hardened systemd service.
It serves the game on `http://10.0.0.11:4173`, calls the local Ollama API on
loopback, and restarts automatically after a process failure or server reboot.

## Automatic deployment flow

Every push to `master` starts `.github/workflows/ci.yml`:

1. GitHub Actions installs dependencies and runs `npm run check`.
2. The server's `noxcat-update.timer` checks the public GitHub repository every
   two minutes, without allowing inbound access from the internet.
3. The server deploys the newest `master` revision only when the matching CI run
   completed successfully.
4. The server builds it in a new release directory, switches the `current`
   symlink, and restarts NOXCAT.
5. `/api/health` must respond successfully within 30 seconds. Otherwise the
   script restores the previous release.

The server retains the four newest releases. This pull-based CD design is used
because `10.0.0.11` is a private LAN address that GitHub-hosted runners cannot
reach. It needs no GitHub secret, inbound port, or self-hosted runner. Repository
build scripts run as the unprivileged `noxcat-build` account; the finished
release becomes root-owned and read-only before the production service uses it.

## Day-to-day use

Push to `master` and monitor the **Actions** tab. A green `verify` job means the
repository passed lint, type checks, unit tests, and production build. Within
about two minutes, the server will detect that successful revision, build it,
switch production atomically, and run its health check.

To rerun CI without another commit, open **Actions → NOXCAT CI → Run workflow**.

Useful server checks:

```bash
systemctl status noxcat
systemctl status noxcat-update.timer
journalctl -u noxcat -n 100 --no-pager
journalctl -u noxcat-update -n 100 --no-pager
cat /opt/noxcat/current-revision
curl http://127.0.0.1:4173/api/health
```
