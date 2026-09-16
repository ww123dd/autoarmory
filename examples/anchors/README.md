# Upstream anchors

These files are vendored byte for byte from a third party publication. They exist so a portable fact can be anchored outside this repository: we choose to vendor the artifact, but we do not choose its bytes or its published digest.

## ms@2.1.3

| field | value |
|---|---|
| mirror | https://registry.npmmirror.com/ms/-/ms-2.1.3.tgz |
| canonical registry | https://registry.npmjs.org/ms/-/ms-2.1.3.tgz |
| published integrity (sha512) | `sha512-6FlzubTLZG3J2a/NVCAleEhjzq5oxgHyaCU9yYXvcLsvoVaHJq/s5xXI6/XXP6tz7R9xAOtHnSO/tXtF3WRTlA==` |
| published shasum (sha1) | `574c8138ce1d2b5861f0b44579dbadd60c6615b2` |
| vendored file | `examples/anchors/ms-2.1.3.tgz` |
| sha512 of vendored bytes | `sha512-6FlzubTLZG3J2a/NVCAleEhjzq5oxgHyaCU9yYXvcLsvoVaHJq/s5xXI6/XXP6tz7R9xAOtHnSO/tXtF3WRTlA==` |
| sha1 of vendored bytes | `574c8138ce1d2b5861f0b44579dbadd60c6615b2` |
| sha256 pinned by the profile | `f6616e15e530ed552f9daa2d3ce71963947c6bc7c98c9b64fd3e673fd02622c6` |
| vendored on | 2026-09-16 |

Both the mirror and the canonical registry published the same `dist.integrity` and `dist.shasum` for this version; the file was pulled with `npm pack ms@2.1.3 --registry <mirror>`, which verifies that integrity before writing it. The mirror is a copy of the canonical registry, so agreement between the two is a consistency check rather than a second independent publisher.

Re-verify from a network-connected machine:

```bash
npm pack ms@2.1.3 --pack-destination /tmp
sha256sum /tmp/ms-2.1.3.tgz   # must equal the sha256 pinned in examples/profiles/portable.profile.json
```

`tests/portable-profile.js` re-checks the published sha512 against the vendored bytes on every run, so the external claim stays attached to the artifact.
