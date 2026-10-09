# 0156 — A proxy is trusted by its address, and by nothing else

- **Status:** accepted
- **Date:** 2026-10-09
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/server/src/trust-proxy.test.ts` — unset and empty trust nothing;
  addresses and CIDR ranges in either family are read, and every accepted shape is one
  Fastify starts with; a hostname, an out-of-range octet or prefix, `/0`, a netmask, a name
  such as `loopback`, an empty entry and two addresses without a comma are each refused,
  naming the variable and the entry; `true` and a hop count are refused; Fastify still
  ignores a hop count, and still believes a trusted hop about `X-Forwarded-Host` and
  `X-Forwarded-Proto` — accepting any of the refused shapes, or Fastify changing either
  behaviour, fails a named case. `packages/server/src/rate-limit-client.test.ts`, through
  `createApp` — respondents behind a named proxy are counted apart and each still limited,
  nothing named is one budget, a direct client and entries written before the proxy's are
  not believed, and a client at the gateway is believed when a named range holds it and
  counted by the gateway when only the proxy is named; dropping `trustProxy` from
  `createApp` fails two. **What Docker does is a measurement, not a gate** — it needs
  Docker's networking, and Docker Desktop and rootless Docker were not available — taken on
  2026-10-09 and set out below.

## Context

Every limit on the public plane — a submission, a draft's write and read, a challenge, a file
offer — counts `request.ip`, and the server built Fastify trusting no proxy. Behind the reverse
proxy the deployment view draws, that is the proxy's address for every request, so every
respondent shared one budget (hazard D14).

Fastify's `trustProxy` takes `true`, a number of hops, a function, or a string or an array of
entries, each an address, a range written with a prefix length or with a netmask,
or one of the names `proxy-addr` expands — `loopback` (`127.0.0.1/8`, `::1/128`), `linklocal`
and `uniquelocal` (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `fc00::/7`). The Fastify
this server depends on, 5.12.5, takes a number and then trusts nothing: a count cannot tell the
proxy from a client that connects directly and writes enough hops itself.

A trusted address can write whatever client address it likes. So the setting is not a
convenience that is safe to over-specify: trusting one address too many lets whatever sends
from it choose a fresh budget per request.

## Decision

**`FORMANCY_TRUST_PROXY` reads addresses and CIDR ranges with a prefix length, and nothing
else.** Unset or empty trusts nothing, as before. Everything else stops the server at startup
with a sentence naming the variable, the entry it could not read and what to write — including
four things Fastify would accept:

- **A hop count,** because Fastify ignores it. A setting that reads as configured and does
  nothing is worse than none: the deployment believes it named its proxy.
- **`true`,** because it believes anybody.
- **A name for a range,** because the range it stands for is not on the page. `uniquelocal`
  is every private address — on Docker's default address pools, every network's gateway with
  it — and `loopback` behind Docker matches nothing the proxy sends from.
- **A netmask,** because a prefix length already says it, and a second spelling of the same
  thing is a second thing to get wrong. `/0`, which Fastify refuses too, is refused here first,
  for the reason `true` is.

**The documentation names the proxy's own address, never its network's range.** In a compose
deployment the proxy gets a pinned `ipv4_address`, that address alone is named, and the
server's port is not published behind it.

## Measured once against Docker

Docker 29.8.1 on Linux, iptables backend, its default userland proxy on; Compose 5.5.1; nginx
1.27.5; the server image built from this change; 2026-10-09. A burst was 31 submissions to the
public route, each writing a different `X-Forwarded-For`, where the default limit is 30 a
minute.

- **A connection to a published port is handed over from the network's gateway** when it comes
  from the machine itself — over loopback, over the machine's network address, or to the
  container's address directly — and when it comes from a container on another Docker network.
  A container on the same network arrives from its own address.
- **The network's range named:** a burst from the machine, and one from a container on another
  network, were each all admitted. With nothing named, the thirty-first was refused.
- **The proxy's address pinned and named, the server's port reset** (`ports: !reset []`):
  `127.0.0.1:4380` refused the connection; a burst sent to the server's container address from
  the machine, and one from another container on the network, were each refused at the
  thirty-first; a client behind the proxy was refused at the thirty-first while a second client
  behind it was still admitted; the proxy recreated came back at the same address.
- **A proxy on the host instead** — the port on loopback (`ports: !override`), the gateway
  named: a container on another network could no longer connect, and a burst from the machine
  was all admitted. That is the arrangement's cost, and the guide states it.
- **nginx, with `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for`, passed a
  client's own `X-Forwarded-Host` and `X-Forwarded-Proto` through unchanged.**

**What it did not show:** connections from another machine. Docker's iptables rule should keep
their address on Linux; Docker Desktop and rootless Docker were not available, and may hand
every connection over from the gateway, so the guide tells a reader to assume they do.

## Consequences

**A deployment writes its proxy down, and has to know its address.** Behind a CDN that is the
provider's published ranges, a long list. In compose it is an override file — a subnet, an
`ipv4_address`, a reset `ports` — and a `docker compose down`, because a network takes a subnet
only when it is created. That is more configuration than naming the range, which is what the
first draft of this change told people to do; it was measured as the hole above before it
merged.

**An Express habit fails at startup.** `trust proxy: 1` is a common spelling elsewhere; here it
stops the server, with the sentence saying what to write instead.

**There is no exclusion.** The setting cannot say "this range but not its gateway". A proxy that
needs one is pinned instead.

**A proxy on the host leaves the machine trusted.** Its connections arrive from the gateway, so
naming it lets every process on that machine choose its address; only the server's port on
loopback keeps that to the machine.

**Trusting a proxy trusts it about the host and the protocol too.** Fastify reads
`X-Forwarded-Host` and `X-Forwarded-Proto` from any trusted hop. No route reads either today
(checked 2026-10-09); the first that does inherits whatever the proxy passes on.

**Unset is still the default**, and nothing detects a deployment behind a proxy that left it
unset. Trusting nothing is the only default that cannot be exploited.

## Alternatives considered

**Pass the value to Fastify as written.** The least code, and the hop count would start a server
that trusts nothing while its operator believed otherwise; `true` would start one that trusts
everybody.

**Honour a hop count ourselves,** with a trust function that believes the last N entries.
Fastify stopped doing exactly that because a client connecting directly can write N entries of
its own; reimplementing it would reintroduce what the dependency removed.

**Accept `proxy-addr`'s names.** `loopback` is right when the server runs on the host beside its
proxy, and `127.0.0.0/8,::1` says the same with nothing hidden. `uniquelocal` is the value most
likely to be written in a Docker deployment and the one that trusts the gateway.

**Recommend the compose network's range.** What the first draft of the guide said, because a
proxy container's address can change across restarts. It holds the gateway, and the burst above
went straight through it.

**Refuse a range that holds the server's own default gateway,** read from `/proc/net/route` at
startup. It would catch the range, and it would refuse the proxy on the host, whose only address
is the gateway; it reads a Linux-only file for a decision the operator has to make anyway.

**Read the `Forwarded` header** (RFC 7239) instead. Fastify does not, the proxies people run add
`X-Forwarded-For` by default, and it changes nothing about whom to trust.
