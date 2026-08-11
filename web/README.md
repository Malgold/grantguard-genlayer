# GrantGuard Console

The GrantGuard Console is the Rabby-connected frontend for the deployed
GrantGuard Intelligent Contract on GenLayer StudioNet.

It supports the entire lifecycle:

1. connect Rabby and switch to StudioNet;
2. create an immutable grant milestone;
3. submit public implementation evidence;
4. request validator-consensus evaluation;
5. follow the transaction through consensus and finality; and
6. inspect the resulting audit record directly from contract state.

## Run locally

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Open `http://localhost:3000` and unlock Rabby. The app reads from contract
`0x3f830e42594BD6A435180D7dC080a84077b88580` on StudioNet (chain ID `61999`).

## Verify

```bash
pnpm exec tsc --noEmit
pnpm run build
node --test tests/rendered-html.test.mjs
```

The app is intentionally stateless: wallet authorization and contract state are
the source of truth. GrantGuard never requests a seed phrase or private key.
