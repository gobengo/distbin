# distbin/etc/distbin-nginx-subpath

This demonstrates how to host distbin at a 'subpath' like `yourdomain.com/yourSubpath`.

Motivated by this GitHub issue: https://github.com/gobengo/distbin/issues/20

It uses nginx as a reverse-proxy. End-user requests first hit nginx. If the HTTP request path starts with '/distbin/', nginx will remove that prefix from the request and forward the request to the running distbin process along a private network.

distbin itself is run with the environment variable `EXTERNAL_URL=http://localhost:8001/distbin/` set. This allows distbin to render links to the prefixed URL without having to resort to bug-prone URL rewriting of the distbin-html HTML.

## Usage

From this directory, `docker-compose up` and access `http://localhost:8001`.