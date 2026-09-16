# Upstream anchors

These files are vendored byte for byte from third party publications. They exist so a portable fact can be anchored outside this repository: we choose to vendor an artifact, but we do not choose its bytes or its published digest.

Each artifact carries a `<file>.provenance.json` record with the publisher, the URL, the published field, the algorithm, the published digest and the sha256 this repository pins. `tests/portable-profile.js` recomputes the published digest from the vendored bytes on every run, so the external claim stays attached to the artifact.

| artifact | publisher | published digest | pinned sha256 |
|---|---|---|---|
| `ms-2.1.3.tgz` | npm registry | `sha512-6FlzubTLZG3J2…WRTlA==` | `f6616e15e530ed552f9daa2d3ce71963947c6bc7c98c9b64fd3e673fd02622c6` |
| `pypi-six-1.16.0.tar.gz` | PyPI | `sha256-1e61c37477a1626…4c926` | `1e61c37477a1626458e36f7b1d82aa5c9b094fa4802892072e49de9c60c4c926` |

## Provenance

- `ms@2.1.3` was pulled with `npm pack ms@2.1.3 --registry https://registry.npmmirror.com`, which verifies the registry integrity before writing the file. The mirror is a copy of the canonical registry; the same `dist.integrity` and `dist.shasum` were observed from `registry.npmjs.org`, so the agreement is a consistency check rather than a second independent publisher.
- `six@1.16.0` was pulled with `python -m pip download six==1.16.0 --no-deps --no-binary :all:` from PyPI, and the sha256 of the downloaded sdist equals the `urls[].digests.sha256` value published by PyPI.

Re-verify from a network-connected machine:

```bash
npm pack ms@2.1.3 --pack-destination /tmp
sha256sum /tmp/ms-2.1.3.tgz
python -m pip download six==1.16.0 --no-deps --no-binary :all: --dest /tmp
sha256sum /tmp/six-1.16.0.tar.gz
```

Both sha256 values must equal the ones pinned in `examples/profiles/portable.profile.json`.
