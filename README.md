# FreeDataStore Platform

SDK + CLI + backend for browser-based data tools on [freedatastore.online](https://freedatastore.online).

## What is this?

A curated store of free data tools that run entirely in the browser. Profile datasets, clean messy data, validate schemas, convert formats — all powered by DuckDB-WASM. No Python, no uploads, no setup.

## Packages

| Package | Description |
|---|---|
| `@freedatastore/sdk` | Core engine — DuckDB-WASM wrapper, file loading, profiling, cleaning, validation, export |
| `@freedatastore/cli` | CLI for scaffolding and publishing data tools |
| `@freedatastore/compliance` | Compliance checks for published tools |
| `@freedatastore/backend` | Host worker — R2 serving, registry API |

## Quick start

```bash
pnpm install
pnpm build
pnpm test
```

## License

MIT
