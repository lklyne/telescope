# Security Policy

## Reporting a vulnerability

Specular embeds full Chromium browser processes, so security issues are taken seriously.

If you discover a security vulnerability, **please do not open a public issue.** Instead, report it privately:

1. Email the maintainer directly (see GitHub profile for contact info)
2. Or use [GitHub's private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability) on this repository

Please include:
- A description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested fix (if you have one)

## Response timeline

- **Acknowledgment** within 72 hours
- **Assessment and plan** within 1 week
- **Fix or mitigation** as soon as practical, depending on severity

## Scope

The following are in scope:
- The Specular Electron application
- The MCP server and its tools
- The CDP proxy
- IPC and preload scripts
- Any data exposure or privilege escalation

## Supported versions

Only the latest release is actively supported with security fixes.

| Version | Supported |
|---|---|
| Latest release | Yes |
| Older releases | No |
