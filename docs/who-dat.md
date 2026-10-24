# Optional Who-Dat fallback

[Who-Dat](https://github.com/lissy93/who-dat) is an MIT-licensed, self-hostable
RDAP/WHOIS HTTP service. It is useful when the MCP host cannot reach TCP port 43
or when you want to operate a shared lookup service. It queries underlying
registries; it does not supply an independent registration database.

The connector is disabled unless you set an owner-provided endpoint:

```bash
export DOMAIN_SCOUT_WHO_DAT_URL=http://localhost:8080
export DOMAIN_SCOUT_WHO_DAT_TOKEN='your-service-token'
```

The token is optional and sent as `Authorization: Bearer ...`. Use it when the
service has `AUTH_KEY` configured. HTTP and HTTPS base URLs are accepted,
including localhost and a reverse-proxy path prefix. URL credentials, query
parameters and fragments are rejected. The connector does not follow redirects.
Use an HTTPS endpoint when the service is reached over a public network.

## Result semantics and speed

The adapter uses `GET /v1/whois/{domain}` with two concurrent request slots.
It validates both `query` and `domain` against the requested name. A matching
`isRegistered: true` yields `registered`. A false value yields `unknown`:
Who-Dat's WHOIS mapper combines absent, reserved, premium and blocked names,
and its RDAP client maps HTTP 404 to the same false value. This connector never
reports `available`. HTTP errors, malformed responses and mismatched domains
also remain `unknown`; rate limits retain `Retry-After`.

`checkedAt` records when Domain Scout handled the result. `observedAt` preserves
Who-Dat's `meta.fetchedAt`; `upstreamCached` preserves its cache flag and detects
positive HTTP `Age` or Vercel HIT/STALE headers. `registry` records the supplied
upstream hostname when present. WHOIS responses can omit this identity.
Protocol is stated in the evidence. Missing metadata is not fabricated.

Who-Dat caches for one hour by default and can also sit behind a CDN. Domain
Scout's refresh option does not bypass these caches. The adapter uses one HTTP
request per lookup, propagates the lookup deadline, and starts no request once
that deadline has expired. It does not perform an extra raw-data lookup.

The author's [public demo](https://hub.docker.com/r/lissy93/who-dat) is documented
for testing only, not production. It is not a default endpoint or bulk backend.
Its documented limit is 30 requests/minute with burst 10; the adapter spaces
requests to that hostname by at least two seconds and honors returned limits.

## Docker Compose / Dokploy example

The public multi-platform image below is pinned to the verified `v2.0.0`
manifest digest. Docker Hub metadata was checked on 2026-10-24; the tag was
published on 2026-07-05. Nothing is deployed automatically.

```yaml
services:
  who-dat:
    image: lissy93/who-dat:v2.0.0@sha256:7bbfe95c6bc5aa6d7aeac033812621a30cc54d1208ab8e7bf9ce9318029e133a
    restart: unless-stopped
    environment:
      AUTH_KEY: ${WHO_DAT_AUTH_KEY:?Set a private service token}
      CACHE_TTL_SECONDS: "60"
      CDN_CACHE_TTL_SECONDS: "0"
      LOOKUP_TIMEOUT_SECONDS: "5"
    ports:
      - "127.0.0.1:8080:8080"
```

For local Docker Compose, set `WHO_DAT_AUTH_KEY` in your deployment environment,
then use the same value for the MCP server's `DOMAIN_SCOUT_WHO_DAT_TOKEN`.
For Dokploy, use a Compose application with the same service and environment;
attach an HTTPS domain to the `who-dat` service's container port 8080, then set
`DOMAIN_SCOUT_WHO_DAT_URL` to that domain. The loopback port is for host-local
access. In a shared container network, use `http://who-dat:8080` instead.
Allow outbound HTTPS and TCP 43 from this service for its registry lookups.

## Audited sources

- [v2.0.0 release](https://github.com/lissy93/who-dat/releases/tag/v2.0.0)
- [Docker image tag metadata](https://hub.docker.com/v2/repositories/lissy93/who-dat/tags/v2.0.0)
- [API documentation](https://github.com/lissy93/who-dat/blob/v2.0.0/.github/README.md)
- [Response model and metadata](https://github.com/lissy93/who-dat/blob/v2.0.0/internal/model/result.go)
- [Endpoint handlers](https://github.com/lissy93/who-dat/blob/v2.0.0/internal/server/handlers.go)
- [WHOIS verdict mapping](https://github.com/lissy93/who-dat/blob/v2.0.0/internal/whois/map.go)
- [RDAP verdict mapping](https://github.com/lissy93/who-dat/blob/v2.0.0/internal/rdap/client.go)
- [Timeout, authentication and cache settings](https://github.com/lissy93/who-dat/blob/v2.0.0/internal/config/config.go)
