---
description: Rebuild and redeploy the bp-app container from the current tree, then health-check it.
---

Run the redeploy script and report the deployed commit and health status:

```console
$ ./scripts/redeploy.sh
```

It fast-forwards to origin/development (best effort), rebuilds the `bp-app`
Docker image, restarts the container, and waits for `/api/health`. If the
health check fails, show the container log tail the script prints. Do not
make any other changes.
