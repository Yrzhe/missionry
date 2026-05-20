# Security Policy

Missionry is in **alpha**. Phase 1 is intended for local/demo use; do **not** deploy it as a production multi-tenant service yet.

## Reporting a vulnerability

Please do **not** open a public Issue for security problems.

DM the maintainer privately on X: [@yrzhe_top](https://x.com/yrzhe_top).

Include:
- A description of the issue (what an attacker could do).
- Steps to reproduce.
- The commit / version you tested against.
- Whether you've shared this elsewhere yet.

You can expect an initial reply within a few days. Once a fix is in, you'll be credited in the changelog if you want.

## Scope

In scope:
- Code in `missionry/server/` (the EdgeSpark backend).
- Architecture / data-model issues that allow cross-Mission bleed, sandbox escape (in the Missionry layer, not E2B's), audit log tampering, or unintended cross-project reads.
- Documentation that recommends an insecure setup.

Out of scope:
- Vulnerabilities in upstream platforms (EdgeSpark, Cloudflare, E2B, OpenAI). Please report those upstream.
- Missing security features that are explicitly deferred to a later phase.

## Secrets

If you accidentally see a real secret (token/key/credential) in the repo, in an Issue, or in a PR diff, please report it privately as above. Do not post it.
