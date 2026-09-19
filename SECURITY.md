# Security Policy

## Reporting a vulnerability

Please report security vulnerabilities through GitHub Security Advisories
("Report a vulnerability" on the Security tab) rather than a public issue.

We aim to acknowledge a report within 3 working days and to provide a remediation
timeline within 10 working days.

Please do not include a working exploit in the initial report; a description of the
vulnerability class and the affected component is enough to begin triage.

## Scope

formancy is self-hosted software. The areas we consider highest risk, and are most
interested in reports about:

- **SSRF** via user-configured webhook and action targets
- **Expression sandbox escape** in the CEL evaluation layer
- **Authorization bypass** on submission read, update, export or anonymous submit
- **Stored XSS** via uploaded files or rendered form content
- **ReDoS** via author-supplied validation patterns
